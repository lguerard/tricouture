package app.tricouture.data

import android.icu.text.RelativeDateTimeFormatter
import java.text.DateFormat
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Date
import java.util.Locale

// Dates comme sur le site ($lib/format) : « 3 oct. 2026 », « dans 5 jours ».

private fun javaLocale(): Locale = if (Session.locale.value == "fr") Locale.FRANCE else Locale.US

/** Jour calendaire d'une valeur du site : "2026-10-03" ou un horodatage ISO. */
fun parseDay(value: String?): LocalDate? {
    if (value.isNullOrBlank()) return null
    return try {
        if (value.length == 10) LocalDate.parse(value)
        else OffsetDateTime.parse(value).atZoneSameInstant(ZoneId.systemDefault()).toLocalDate()
    } catch (e: Exception) {
        null
    }
}

fun formatDate(value: String?): String {
    val d = parseDay(value) ?: return ""
    val date = Date.from(d.atStartOfDay(ZoneId.systemDefault()).toInstant())
    return DateFormat.getDateInstance(DateFormat.MEDIUM, javaLocale()).format(date)
}

fun formatDateTime(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return try {
        val i = OffsetDateTime.parse(value).toInstant()
        DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, javaLocale()).format(Date.from(i))
    } catch (e: Exception) {
        formatDate(value)
    }
}

/** Jours entiers depuis aujourd'hui (négatif = passé). */
fun daysFromToday(value: String?): Int? {
    val d = parseDay(value) ?: return null
    return ChronoUnit.DAYS.between(LocalDate.now(), d).toInt()
}

fun formatRelativeDays(value: String?): String {
    val n = daysFromToday(value) ?: return ""
    val f = RelativeDateTimeFormatter.getInstance(android.icu.util.ULocale.forLocale(javaLocale()))
    return when (n) {
        0 -> f.format(RelativeDateTimeFormatter.Direction.THIS, RelativeDateTimeFormatter.AbsoluteUnit.DAY)
        1 -> f.format(RelativeDateTimeFormatter.Direction.NEXT, RelativeDateTimeFormatter.AbsoluteUnit.DAY)
        -1 -> f.format(RelativeDateTimeFormatter.Direction.LAST, RelativeDateTimeFormatter.AbsoluteUnit.DAY)
        else -> f.format(Math.abs(n).toDouble(),
            if (n > 0) RelativeDateTimeFormatter.Direction.NEXT else RelativeDateTimeFormatter.Direction.LAST,
            RelativeDateTimeFormatter.RelativeUnit.DAYS)
    }
}

fun formatDeadline(value: String?): String = if (value.isNullOrBlank()) "" else "${formatDate(value)} · ${formatRelativeDays(value)}"

/** Montant en euros (centimes → « 12,50 € »). */
fun formatEuros(cents: Long?): String {
    if (cents == null) return ""
    return java.text.NumberFormat.getCurrencyInstance(Locale.FRANCE).format(cents / 100.0)
}
