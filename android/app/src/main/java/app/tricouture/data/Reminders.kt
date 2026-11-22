package app.tricouture.data

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import app.tricouture.MainActivity
import app.tricouture.R
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import java.time.ZoneId

/** Un rappel programmé sur le téléphone. */
data class Reminder(val id: Int, val at: Long, val title: String, val body: String, val path: String)

/**
 * Notifications du téléphone, programmées par l'appli elle-même (le site ne
 * peut pas en envoyer) : le calendrier de l'Avent de la personne qui le
 * reçoit (même règle que $lib/advent.ts → notificationPlan) et les échéances
 * de projets. Les rappels sont gardés pour être reprogrammés après un
 * redémarrage ou une mise à jour de l'appli.
 */
object Reminders {
    const val ADVENT_ID_BASE = 880_000
    const val ADVENT_DAYS = 24
    private const val CHANNEL = "reminders"
    private const val PREFS = "reminders"

    // --- Calendrier de l'Avent -------------------------------------------

    /** Les rappels de l'Avent à programmer à partir de maintenant (`notify` du layout du site). */
    fun adventPlan(notify: JsonObject?, now: Long = System.currentTimeMillis()): List<Reminder> =
        adventSchedule(notify, now).map { (day, at) ->
            Reminder(
                ADVENT_ID_BASE + day, at,
                if (day == 1) t("advent.notif.firstTitle") else t("advent.notif.dayTitle", "n" to day),
                if (day == 1) t("advent.notif.firstBody") else t("advent.notif.dayBody"),
                "/avent",
            )
        }

    /** Remplace les rappels de l'Avent par ceux du planning (vide = tout annuler). */
    fun syncAdvent(context: Context, notify: JsonObject?) {
        val plan = adventPlan(notify)
        val sig = (notify?.toString() ?: "none") + ":" + Session.locale.value
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (prefs.getString("adventSig", null) == sig) return
        for (day in 1..ADVENT_DAYS) cancel(context, ADVENT_ID_BASE + day)
        plan.forEach { schedule(context, it) }
        prefs.edit().putString("adventSig", sig).apply()
    }

    // --- Échéances de projets --------------------------------------------

    /** Rappel 3 jours avant l'échéance d'un projet pas encore fini (comme le site). */
    fun syncDeadline(context: Context, projectId: String, title: String, deadline: String?, finished: Boolean) {
        val id = 900_000 + (projectId.hashCode() and 0x7ffff)
        val day = parseDay(deadline)
        if (day == null || finished) {
            cancel(context, id)
            return
        }
        val at = day.minusDays(3).atTime(9, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
        if (at <= System.currentTimeMillis()) return
        schedule(context, Reminder(id, at, t("app.deadlineSoon", "n" to 3), title, "/projects/$projectId"))
    }

    // --- Mécanique ---------------------------------------------------------

    private fun stored(context: Context): JsonObject {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("pending", null)
        return try { raw?.let { JsonParser.parseString(it).asJsonObject } } catch (e: Exception) { null } ?: JsonObject()
    }

    private fun store(context: Context, all: JsonObject) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("pending", all.toString()).apply()
    }

    private fun intent(context: Context, r: Reminder): PendingIntent {
        val i = Intent(context, ReminderReceiver::class.java)
            .putExtra("id", r.id).putExtra("title", r.title).putExtra("body", r.body).putExtra("path", r.path)
        return PendingIntent.getBroadcast(context, r.id, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun schedule(context: Context, r: Reminder) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = intent(context, r)
        // Heure exacte si Android l'autorise, sinon à quelques minutes près.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.at, pi)
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.at, pi)
        }
        val all = stored(context)
        all.add(r.id.toString(), JsonObject().apply {
            addProperty("at", r.at); addProperty("title", r.title); addProperty("body", r.body); addProperty("path", r.path)
        })
        store(context, all)
    }

    fun cancel(context: Context, id: Int) {
        val am = context.getSystemService(AlarmManager::class.java) ?: return
        val pi = PendingIntent.getBroadcast(context, id, Intent(context, ReminderReceiver::class.java),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
        if (pi != null) am.cancel(pi)
        val all = stored(context)
        if (all.remove(id.toString()) != null) store(context, all)
    }

    /** Après un redémarrage ou une mise à jour : Android a oublié les alarmes, on les remet. */
    fun restore(context: Context) {
        val now = System.currentTimeMillis()
        val all = stored(context)
        for ((key, v) in all.entrySet().toList()) {
            val o = v.asJsonObject
            val at = o.long("at") ?: continue
            if (at <= now) { all.remove(key); continue }
            val r = Reminder(key.toInt(), at, o.str("title").orEmpty(), o.str("body").orEmpty(), o.str("path") ?: "/")
            val am = context.getSystemService(AlarmManager::class.java) ?: continue
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms())
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent(context, r))
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent(context, r))
        }
        store(context, all)
    }

    fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(NotificationChannel(CHANNEL, t("app.reminders"), NotificationManager.IMPORTANCE_DEFAULT))
    }

    internal fun show(context: Context, id: Int, title: String, body: String, path: String) {
        ensureChannel(context)
        val open = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_OPEN_PATH, path)
        val pi = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        try { NotificationManagerCompat.from(context).notify(id, n) } catch (e: SecurityException) { }
        val all = stored(context)
        if (all.remove(id.toString()) != null) store(context, all)
    }
}

/** Alarme arrivée : affiche la notification. */
class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        I18n.init(context)
        Reminders.show(
            context,
            intent.getIntExtra("id", 0),
            intent.getStringExtra("title").orEmpty(),
            intent.getStringExtra("body").orEmpty(),
            intent.getStringExtra("path") ?: "/",
        )
    }
}

/** Redémarrage du téléphone ou mise à jour de l'appli : reprogrammer les rappels. */
class RestoreRemindersReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        Reminders.restore(context)
    }
}
