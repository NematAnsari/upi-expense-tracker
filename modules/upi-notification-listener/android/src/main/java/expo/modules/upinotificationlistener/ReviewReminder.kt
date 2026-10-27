package expo.modules.upinotificationlistener

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build

/**
 * The app's own "Payment detected. Tap to review." notification.
 *
 * Shown by the listener service when a new payment message is captured, so you
 * know there is something to review even while the app is closed. Tapping it
 * opens the Review Payments screen. It can be switched off in Auto-Detect Settings.
 */
object ReviewReminder {
  private const val PREFS_NAME = "upi_notification_listener"
  private const val KEY_ENABLED = "review_reminders_enabled"
  private const val CHANNEL_ID = "payment_review"
  private const val NOTIFICATION_ID = 4201
  // Must match "scheme" in app.json and the route src/app/review-payments.js.
  private const val REVIEW_LINK = "upiexpensetracker://review-payments"

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, true)

  fun setEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    if (!enabled) {
      clear(context)
    }
  }

  /** Android 13+ asks the user before an app may show notifications. */
  fun canPostNotifications(context: Context): Boolean =
    Build.VERSION.SDK_INT < 33 ||
      context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

  fun show(context: Context) {
    if (!isEnabled(context) || !canPostNotifications(context)) {
      return
    }
    val manager = context.getSystemService(NotificationManager::class.java) ?: return

    if (Build.VERSION.SDK_INT >= 26) {
      val channel = NotificationChannel(CHANNEL_ID, "Payments to review", NotificationManager.IMPORTANCE_DEFAULT)
      channel.description = "Tells you when a payment from your bank SMS is waiting to be added."
      manager.createNotificationChannel(channel)
    }

    val openReview = Intent(Intent.ACTION_VIEW, Uri.parse(REVIEW_LINK))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val contentIntent = PendingIntent.getActivity(
      context,
      0,
      openReview,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)
    val notification = builder
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Payment detected")
      .setContentText("Tap to review and add it to your transactions.")
      .setContentIntent(contentIntent)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .build()

    // One notification that is updated, not a new one per payment.
    manager.notify(NOTIFICATION_ID, notification)
  }

  fun clear(context: Context) {
    context.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID)
  }
}
