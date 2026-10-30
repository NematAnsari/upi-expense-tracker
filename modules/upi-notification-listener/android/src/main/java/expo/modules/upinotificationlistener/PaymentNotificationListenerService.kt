package expo.modules.upinotificationlistener

import android.app.Notification
import android.content.ComponentName
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives every notification Android shows, but keeps only the ones that look
 * like a payment message (an amount plus a word like debited, credited, Dr, Cr,
 * paid, sent or received). Everything else is ignored immediately and never
 * stored. Nothing is sent off the phone. The JavaScript side does the detailed
 * reading; this filter only has to avoid throwing payment messages away.
 */
class PaymentNotificationListenerService : NotificationListenerService() {
  companion object {
    // An amount: "₹250", "Rs.250", "INR 250", or a number right after a money word
    // ("debited by 20.0", "credited with 500") because some banks write no currency.
    private val AMOUNT_PATTERN = Regex(
      """(₹|\brs\.?|\binr)\s*[0-9]|\b(debited|credited|deducted|withdrawn|paid|sent|received|spent|transferred|dr|cr)\.?\s+(by|for|of|with)?\s*[0-9]""",
      RegexOption.IGNORE_CASE
    )
    private val PAYMENT_WORD_PATTERN = Regex(
      """\b(debit(ed)?|credit(ed)?|dr|cr|deducted|paid|sent|received|spent|withdrawn|transferred|trf|deposited|refund(ed)?|payment|txn|transaction|upi)\b""",
      RegexOption.IGNORE_CASE
    )
    // Apps that only re-show a bank SMS you already get (each payment would appear twice).
    private val MIRROR_APPS = setOf("com.truecaller")

    // OTP messages are never kept, even if they mention an amount.
    private val OTP_PATTERN = Regex("""\b(otp|one time password|verification code)\b""", RegexOption.IGNORE_CASE)

    fun looksLikePayment(content: String): Boolean =
      AMOUNT_PATTERN.containsMatchIn(content) &&
        PAYMENT_WORD_PATTERN.containsMatchIn(content) &&
        !OTP_PATTERN.containsMatchIn(content)
  }

  /**
   * One message inside a notification. `id` tells messages apart: a message in a
   * conversation is identified by its own time and text (stable when the
   * conversation is shown again); anything else by the notification and its time.
   */
  private data class Message(val text: String, val postedAt: Long, val id: String)

  /**
   * All messages in a notification, read in full.
   *
   * SMS apps such as Google Messages put a whole conversation in one
   * notification (MessagingStyle). Its short text only shows the newest message,
   * so each message is read from the conversation itself. Other apps use the
   * expanded text (BIG_TEXT), a list of lines (InboxStyle) or the normal text.
   */
  private fun readMessages(extras: Bundle, sbn: StatusBarNotification): List<Message> {
    val postTime = sbn.postTime
    @Suppress("DEPRECATION")
    val conversation = extras.getParcelableArray(Notification.EXTRA_MESSAGES)
    if (!conversation.isNullOrEmpty()) {
      val messages = conversation.mapNotNull { item ->
        val bundle = item as? Bundle ?: return@mapNotNull null
        val text = bundle.getCharSequence("text")?.toString()?.trim().orEmpty()
        if (text.isEmpty()) {
          return@mapNotNull null
        }
        val time = bundle.getLong("time", 0L).takeIf { it > 0 } ?: postTime
        Message(text, time, "message|$time|$text")
      }
      if (messages.isNotEmpty()) {
        return messages
      }
    }

    // Includes the post time: a UPI app may reuse one notification for two equal
    // payments from the same person. Missing a payment is worse than a possible
    // duplicate, which the review screen flags.
    val notificationId = "notification|${sbn.key}|$postTime"
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim().orEmpty()
    if (bigText.isNotEmpty()) {
      return listOf(Message(bigText, postTime, "$notificationId|$bigText"))
    }
    val lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
    if (!lines.isNullOrEmpty()) {
      return lines.map { it.toString().trim() }
        .filter { it.isNotEmpty() }
        .map { Message(it, postTime, "$notificationId|$it") }
    }
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim().orEmpty()
    return if (text.isEmpty()) emptyList() else listOf(Message(text, postTime, "$notificationId|$text"))
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
    try {
      if (sbn == null || sbn.packageName == packageName || sbn.packageName in MIRROR_APPS) {
        return
      }
      val notification = sbn.notification ?: return
      // Group summaries repeat their children's text, which would create duplicates.
      if (notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) {
        return
      }

      val extras = notification.extras ?: return
      val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()

      var storedSomething = false
      for (message in readMessages(extras, sbn)) {
        if (!looksLikePayment("$title ${message.text}")) {
          continue
        }
        val isNew = CapturedNotificationStore.add(
          context = applicationContext,
          fingerprint = "${sbn.packageName}|$title|${message.id}",
          packageName = sbn.packageName,
          notificationKey = sbn.key,
          title = title,
          text = message.text,
          postedAt = message.postedAt
        )
        storedSomething = storedSomething || isNew
      }
      if (storedSomething) {
        ReviewReminder.show(applicationContext)
      }
    } catch (error: Exception) {
      // Never crash the listener because of one unusual notification.
      android.util.Log.w("UpiNotificationListener", "Could not read a notification", error)
    }
  }

  /**
   * Android can disconnect the listener (after an app update, or when the phone
   * saves battery). Ask to be connected again straight away.
   */
  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    requestRebind(ComponentName(this, PaymentNotificationListenerService::class.java))
  }
}
