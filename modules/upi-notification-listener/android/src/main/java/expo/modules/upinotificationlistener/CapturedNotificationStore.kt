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
  private const val KEY_SEEN = "seen_fingerprints"
  private const val MAX_ITEMS = 500
  private const val MAX_SEEN = 1000

  private val lock = Any()

  private fun prefs(context: Context) =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun readArray(context: Context, key: String): JSONArray {
    val raw = prefs(context).getString(key, null) ?: return JSONArray()
    return try {
      JSONArray(raw)
    } catch (error: Exception) {
      JSONArray()
    }
  }

  private fun writeArray(context: Context, key: String, array: JSONArray) {
    prefs(context).edit().putString(key, array.toString()).apply()
  }

  /** Keeps only the last `max` entries so storage cannot grow without limit. */
  private fun keepNewest(array: JSONArray, max: Int): JSONArray {
    val trimmed = JSONArray()
    val start = maxOf(0, array.length() - max)
    for (index in start until array.length()) {
      trimmed.put(array.get(index))
    }
    return trimmed
  }

  /**
   * Adds a message unless it was seen before. A conversation notification (for
   * example Google Messages) keeps showing older messages, so "seen" is
   * remembered even after the app has picked an item up from the queue.
   * `fingerprint` identifies one message (see PaymentNotificationListenerService).
   * Returns true if something new was stored.
   */
  fun add(
    context: Context,
    fingerprint: String,
    packageName: String,
    notificationKey: String,
    title: String,
    text: String,
    postedAt: Long
  ): Boolean {
    synchronized(lock) {
      val seen = readArray(context, KEY_SEEN)
      for (index in 0 until seen.length()) {
        if (seen.optString(index) == fingerprint) {
          return false
        }
      }

      val items = readArray(context, KEY_ITEMS)
      items.put(
        JSONObject()
          .put("id", UUID.randomUUID().toString())
          .put("packageName", packageName)
          .put("notificationKey", notificationKey)
          .put("title", title)
          .put("text", text)
          .put("postedAt", postedAt)
          .put("capturedAt", System.currentTimeMillis())
      )
      seen.put(fingerprint)

      writeArray(context, KEY_ITEMS, keepNewest(items, MAX_ITEMS))
      writeArray(context, KEY_SEEN, keepNewest(seen, MAX_SEEN))
      return true
    }
  }

  fun getAll(context: Context): List<Map<String, Any>> {
    synchronized(lock) {
      val items = readArray(context, KEY_ITEMS)
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
      val items = readArray(context, KEY_ITEMS)
      val kept = JSONArray()
      for (index in 0 until items.length()) {
        val item = items.getJSONObject(index)
        if (!idSet.contains(item.optString("id"))) {
          kept.put(item)
        }
      }
      writeArray(context, KEY_ITEMS, kept)
    }
  }

  fun clear(context: Context) {
    synchronized(lock) {
      writeArray(context, KEY_ITEMS, JSONArray())
    }
  }
}
