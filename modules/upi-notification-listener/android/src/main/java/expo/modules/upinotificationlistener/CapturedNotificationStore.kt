package expo.modules.upinotificationlistener

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/**
 * A small on-device queue of captured payment notifications.
 *
 * The listener service can run while the app's JavaScript is not running, so it
 * saves matches here. When the app opens, JavaScript reads them, stores what it
 * needs in its own database, and removes them from this queue.
 * Stored in private app storage: other apps cannot read it.
 */
object CapturedNotificationStore {
  private const val PREFS_NAME = "upi_notification_listener"
  private const val KEY_ITEMS = "captured"
  private const val MAX_ITEMS = 500

  private val lock = Any()

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun readItems(context: Context): JSONArray {
    val raw = prefs(context).getString(KEY_ITEMS, null) ?: return JSONArray()
    return try {
      JSONArray(raw)
    } catch (error: Exception) {
      JSONArray()
    }
  }

  private fun writeItems(context: Context, items: JSONArray) {
    prefs(context).edit().putString(KEY_ITEMS, items.toString()).apply()
  }

  /**
   * Adds an item unless the same notification with the same text is already queued.
   * Returns true if something new was stored.
   */
  fun add(
    context: Context,
    packageName: String,
    notificationKey: String,
    title: String,
    text: String,
    postedAt: Long
  ): Boolean {
    synchronized(lock) {
      val items = readItems(context)
      for (index in 0 until items.length()) {
        val existing = items.getJSONObject(index)
        if (existing.optString("notificationKey") == notificationKey && existing.optString("text") == text) {
          return false
        }
      }

      val item = JSONObject()
        .put("id", UUID.randomUUID().toString())
        .put("packageName", packageName)
        .put("notificationKey", notificationKey)
        .put("title", title)
        .put("text", text)
        .put("postedAt", postedAt)
        .put("capturedAt", System.currentTimeMillis())
      items.put(item)

      // Keep only the newest items so storage cannot grow without limit.
      val trimmed = JSONArray()
      val start = maxOf(0, items.length() - MAX_ITEMS)
      for (index in start until items.length()) {
        trimmed.put(items.get(index))
      }
      writeItems(context, trimmed)
      return true
    }
  }

  fun getAll(context: Context): List<Map<String, Any>> {
    synchronized(lock) {
      val items = readItems(context)
      return (0 until items.length()).map { index ->
        val item = items.getJSONObject(index)
        mapOf(
          "id" to item.optString("id"),
          "packageName" to item.optString("packageName"),
          "notificationKey" to item.optString("notificationKey"),
          "title" to item.optString("title"),
          "text" to item.optString("text"),
          "postedAt" to item.optLong("postedAt").toDouble(),
          "capturedAt" to item.optLong("capturedAt").toDouble()
        )
      }
    }
  }

  fun remove(context: Context, ids: List<String>) {
    synchronized(lock) {
      val idSet = ids.toSet()
      val items = readItems(context)
      val kept = JSONArray()
      for (index in 0 until items.length()) {
        val item = items.getJSONObject(index)
        if (!idSet.contains(item.optString("id"))) {
          kept.put(item)
        }
      }
      writeItems(context, kept)
    }
  }

  fun clear(context: Context) {
    synchronized(lock) {
      writeItems(context, JSONArray())
    }
  }
}
