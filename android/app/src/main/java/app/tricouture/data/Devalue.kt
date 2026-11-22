package app.tricouture.data

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.google.gson.JsonPrimitive

/**
 * Décodeur du format « devalue » de SvelteKit : c'est ainsi que le site
 * envoie les données d'une page (`/patterns/__data.json`) et la réponse d'un
 * formulaire. Les valeurs sont « aplaties » dans un tableau ; un objet ou une
 * liste désigne ses éléments par leur position dans ce tableau.
 *
 * Résultat en JSON ordinaire : une date devient sa chaîne ISO, un Set une
 * liste, une Map un objet ; `undefined` disparaît, NaN et ±∞ deviennent null.
 */
object Devalue {
    private const val UNDEFINED = -1
    private const val HOLE = -2
    private const val NAN = -3
    private const val POSITIVE_INFINITY = -4
    private const val NEGATIVE_INFINITY = -5
    private const val NEGATIVE_ZERO = -6

    /** Une valeur absente (`undefined`) : retirée des objets, null dans les listes. */
    private val ABSENT: JsonElement = JsonNull.INSTANCE

    fun parse(text: String): JsonElement = unflatten(JsonParser.parseString(text))

    fun unflatten(parsed: JsonElement): JsonElement {
        if (parsed.isJsonPrimitive) return special(parsed.asInt) ?: JsonNull.INSTANCE
        val values = parsed.asJsonArray
        val hydrated = arrayOfNulls<JsonElement>(values.size())
        val undefined = BooleanArray(values.size())

        fun hydrate(index: Int): JsonElement {
            special(index)?.let { return it }
            if (index < 0) return JsonNull.INSTANCE
            hydrated[index]?.let { return it }
            val value = values[index]
            val out: JsonElement = when {
                value.isJsonNull || value.isJsonPrimitive -> value
                value.isJsonArray -> {
                    val arr = value.asJsonArray
                    val head = arr.firstOrNull()
                    if (head != null && head.isJsonPrimitive && head.asJsonPrimitive.isString) {
                        typed(head.asString, arr, ::hydrate)
                    } else {
                        val list = JsonArray()
                        hydrated[index] = list // cycles
                        for (n in arr) {
                            val i = n.asInt
                            if (i == HOLE) list.add(JsonNull.INSTANCE) else list.add(hydrate(i))
                        }
                        list
                    }
                }
                else -> {
                    val obj = JsonObject()
                    hydrated[index] = obj
                    for ((key, n) in value.asJsonObject.entrySet()) {
                        val i = n.asInt
                        if (i == UNDEFINED) continue
                        obj.add(key, hydrate(i))
                    }
                    obj
                }
            }
            hydrated[index] = out
            return out
        }
        return hydrate(0)
    }

    private fun special(index: Int): JsonElement? = when (index) {
        UNDEFINED, HOLE, NAN, POSITIVE_INFINITY, NEGATIVE_INFINITY -> ABSENT
        NEGATIVE_ZERO -> JsonPrimitive(0)
        else -> null
    }

    private fun typed(type: String, arr: JsonArray, hydrate: (Int) -> JsonElement): JsonElement = when (type) {
        "Date" -> arr[1]
        "Set" -> JsonArray().also { out -> for (i in 1 until arr.size()) out.add(hydrate(arr[i].asInt)) }
        "Map" -> JsonObject().also { out ->
            var i = 1
            while (i + 1 < arr.size()) {
                val key = hydrate(arr[i].asInt)
                out.add(if (key.isJsonPrimitive) key.asString else key.toString(), hydrate(arr[i + 1].asInt))
                i += 2
            }
        }
        // Objet sans prototype : paires clé / position.
        "null" -> JsonObject().also { out ->
            var i = 1
            while (i + 1 < arr.size()) {
                out.add(arr[i].asString, hydrate(arr[i + 1].asInt))
                i += 2
            }
        }
        "BigInt" -> JsonPrimitive(arr[1].asString.toBigInteger())
        "Object" -> arr[1]
        "RegExp" -> arr[1]
        "URL", "URLSearchParams" -> arr[1]
        else -> JsonNull.INSTANCE
    }
}
