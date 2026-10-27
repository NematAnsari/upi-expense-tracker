package expo.modules.upinotificationlistener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Receives every notification Android shows, but keeps only the ones that look
 * like a payment message (an amount in ₹/Rs/INR plus a word like debited,
 * credited, paid, sent or received). Everything else is ignored immediately and
 * never stored. Nothing is sent off the phone.
 */
class PaymentNotificationListenerService : NotificationListenerService() {
  companion object {
    private val AMOUNT_PATTERN = Regex("""(₹|\brs\.?|\binr)\s*[0-9]""", RegexOption.IGNORE_CASE)
    private val PAYMENT_WORD_PATTERN = Regex(
      """\b(debit(ed)?|credit(ed)?|paid|sent|received|spent|withdrawn|transferred|payment|txn|transaction|upi)\b""",
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
      val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
        ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString().orEmpty()

      if (text.isBlank() || !looksLikePayment("$title $text")) {
        return
      }

      val isNew = CapturedNotificationStore.add(
        context = applicationContext,
        packageName = sbn.packageName,
        notificationKey = sbn.key,
        title = title,
        text = text,
        postedAt = sbn.postTime
      )
      if (isNew) {
        ReviewReminder.show(applicationContext)
      }
    } catch (error: Exception) {
      // Never crash the listener because of one unusual notification.
      android.util.Log.w("UpiNotificationListener", "Could not read a notification", error)
    }
  }
}
