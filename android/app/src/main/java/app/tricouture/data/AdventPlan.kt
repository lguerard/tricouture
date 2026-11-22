package app.tricouture.data

import com.google.gson.JsonObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId

// Calcul des rappels de l'Avent, sans Android (testable à part) : même règle
// que notificationPlan dans $lib/advent.ts.

private val PARIS: ZoneId = ZoneId.of("Europe/Paris")

/** "8:5", "08:05", "8h05" → 08:05 ; sinon null. */
fun adventTime(v: String?): LocalTime? {
    val m = Regex("""^\s*(\d{1,2})\s*[:hH]\s*(\d{1,2})?\s*$""").find(v ?: return null) ?: return null
    val h = m.groupValues[1].toInt()
    val min = m.groupValues[2].ifEmpty { "0" }.toInt()
    return if (h > 23 || min > 59) null else LocalTime.of(h, min)
}

/**
 * Portes à rappeler et leur instant (ms), à partir de `now` : le 1er décembre
 * seul (« first ») ou chaque porte (« daily »), à l'heure fixée pour le jour,
 * sinon à l'heure de semaine ou de week-end, heure de Paris.
 */
fun adventSchedule(notify: JsonObject?, now: Long): List<Pair<Int, Long>> {
    if (notify == null) return emptyList()
    val year = notify.int("year") ?: return emptyList()
    val mode = notify.str("mode")
    if (mode == null || mode == "off") return emptyList()
    val days = if (mode == "first") listOf(1) else (1..24).toList()
    val perDay = notify.obj("days")
    return days.mapNotNull { day ->
        val date = LocalDate.of(year, 12, day)
        val weekend = date.dayOfWeek == DayOfWeek.SATURDAY || date.dayOfWeek == DayOfWeek.SUNDAY
        val time = adventTime(perDay?.str(day.toString()))
            ?: adventTime(if (weekend) notify.str("weekend") else notify.str("week"))
            ?: LocalTime.of(8, 0)
        val at = date.atTime(time).atZone(PARIS).toInstant().toEpochMilli()
        if (at <= now) null else day to at
    }
}
