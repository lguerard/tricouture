package app.tricouture.data

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject

// Lecture tolérante des données du site : un champ absent, null ou d'un
// autre type donne null plutôt qu'une exception.

private fun JsonObject.prim(key: String) = get(key)?.takeIf { it.isJsonPrimitive }?.asJsonPrimitive

fun JsonObject.str(key: String): String? = prim(key)?.asString
fun JsonObject.int(key: String): Int? = prim(key)?.let { p -> if (p.isNumber) p.asDouble.toInt() else p.asString.toIntOrNull() }
fun JsonObject.long(key: String): Long? = prim(key)?.let { p -> if (p.isNumber) p.asDouble.toLong() else p.asString.toLongOrNull() }
fun JsonObject.double(key: String): Double? = prim(key)?.let { p -> if (p.isNumber) p.asDouble else p.asString.toDoubleOrNull() }
fun JsonObject.bool(key: String): Boolean = prim(key)?.let { p -> if (p.isBoolean) p.asBoolean else p.asString == "true" } ?: false
fun JsonObject.obj(key: String): JsonObject? = get(key)?.takeIf { it.isJsonObject }?.asJsonObject
fun JsonObject.arr(key: String): JsonArray = get(key)?.takeIf { it.isJsonArray }?.asJsonArray ?: JsonArray()
fun JsonObject.objs(key: String): List<JsonObject> = arr(key).mapNotNull { it.takeIf { e -> e.isJsonObject }?.asJsonObject }
fun JsonObject.strs(key: String): List<String> = arr(key).mapNotNull { it.takeIf { e -> e.isJsonPrimitive }?.asString }
fun JsonObject.has(key: String): Boolean = get(key)?.isJsonNull == false

fun JsonElement?.objOrNull(): JsonObject? = this?.takeIf { it.isJsonObject }?.asJsonObject
