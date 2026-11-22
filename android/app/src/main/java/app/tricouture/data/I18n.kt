package app.tricouture.data

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import com.google.gson.JsonParser

/**
 * Les traductions du site (app/src/lib/i18n/dict.ts), copiées dans
 * assets/i18n.json par `npm run i18n:android` : l'appli emploie les mêmes
 * mots que le site, en français et en anglais.
 */
object I18n {
    private var tables: Map<String, Map<String, String>> = emptyMap()

    fun init(context: Context) {
        if (tables.isNotEmpty()) return
        val text = context.assets.open("i18n.json").bufferedReader().use { it.readText() }
        tables = JsonParser.parseString(text).asJsonObject.entrySet().associate { (locale, table) ->
            locale to table.asJsonObject.entrySet().associate { (k, v) -> k to v.asString }
        }
    }

    fun t(locale: String, key: String, vars: Map<String, Any?> = emptyMap()): String {
        var s = APP_STRINGS[locale]?.get(key) ?: tables[locale]?.get(key) ?: tables["en"]?.get(key) ?: tables["fr"]?.get(key) ?: key
        for ((k, v) in vars) s = s.replace("{$k}", v?.toString() ?: "")
        return s
    }

    fun has(key: String): Boolean = APP_STRINGS["fr"]?.containsKey(key) == true || tables["fr"]?.containsKey(key) == true || tables["en"]?.containsKey(key) == true
}

/** Texte traduit dans la langue de l'appli. */
@Composable
fun tr(key: String, vararg vars: Pair<String, Any?>): String {
    val locale by Session.locale.collectAsState()
    return I18n.t(locale, key, vars.toMap())
}

/** Hors Compose (messages, notifications). */
fun t(key: String, vararg vars: Pair<String, Any?>): String = I18n.t(Session.locale.value, key, vars.toMap())
