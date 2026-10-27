package expo.modules.upinotificationlistener

import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The bridge JavaScript uses to check settings and read captured notifications. */
class UpiNotificationListenerModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UpiNotificationListener")

    /** True when the user has switched on Notification access for this app. */
    Function("isPermissionGranted") {
      val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
      val component = ComponentName(context, PaymentNotificationListenerService::class.java)
      enabled.split(":").any { entry ->
        ComponentName.unflattenFromString(entry) == component
      }
    }

    /**
     * True when battery saving will not stop the app in the background
     * (OnePlus: Battery set to "Unrestricted").
     */
    Function("isBatteryUnrestricted") {
      val powerManager = context.getSystemService(PowerManager::class.java)
      powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: false
    }

    /** Opens Android's Notification access screen. */
    Function("openPermissionSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    /** Opens this app's info page (battery, notifications, "Allow restricted settings"). */
    Function("openAppSettings") {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.fromParts("package", context.packageName, null))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    /** Whether "Payment detected" alerts are switched on in the app. */
    Function("areRemindersEnabled") {
      ReviewReminder.isEnabled(context)
    }

    Function("setRemindersEnabled") { enabled: Boolean ->
      ReviewReminder.setEnabled(context, enabled)
    }

    /** Whether Android allows this app to show notifications at all. */
    Function("canShowReminders") {
      ReviewReminder.canPostNotifications(context)
    }

    AsyncFunction("getCapturedNotifications") {
      CapturedNotificationStore.getAll(context)
    }

    AsyncFunction("removeCapturedNotifications") { ids: List<String> ->
      CapturedNotificationStore.remove(context, ids)
      // The app has now picked these up (they show in Review Payments), so the
      // "Payment detected" alert is no longer needed.
      if (CapturedNotificationStore.getAll(context).isEmpty()) {
        ReviewReminder.clear(context)
      }
    }

    AsyncFunction("clearCapturedNotifications") {
      CapturedNotificationStore.clear(context)
    }
  }
}
