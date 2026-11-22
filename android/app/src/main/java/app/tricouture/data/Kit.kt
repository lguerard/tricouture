package app.tricouture.data

import com.google.gson.JsonElement
import com.google.gson.JsonNull
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import okhttp3.Call
import okhttp3.Callback
import okhttp3.FormBody
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Erreur renvoyée par le serveur (ou réseau), avec un message lisible. */
open class KitException(message: String, val status: Int = 0) : Exception(message)

/** Session expirée ou absente : retour à l'écran de connexion. */
class UnauthorizedException : KitException("Session expirée", 401)

/** Réponse d'un formulaire du site (« action » SvelteKit). */
sealed class ActionResult {
    data class Success(val data: JsonObject) : ActionResult()
    /** Refus du formulaire (champ manquant…) : `data` porte le message, comme sur le site. */
    data class Failure(val status: Int, val data: JsonObject) : ActionResult()
    data class Redirect(val location: String) : ActionResult()

    val ok: Boolean get() = this !is Failure
    /** Message d'erreur du formulaire, sous la forme qu'utilise le site (`error`, `message`). */
    val error: String?
        get() = (this as? Failure)?.data?.let { it.str("error") ?: it.str("message") ?: "Erreur ${it.str("status") ?: status}" }
}

/** Fichier joint à un formulaire. */
class FilePart(val field: String, val name: String, val mime: String, val bytes: ByteArray)

/**
 * Le site sert d'API à l'appli : chaque page expose ses données en JSON
 * (`<page>/__data.json`) et ses formulaires répondent en JSON quand on le
 * leur demande (`x-sveltekit-action`). L'appli s'authentifie avec le même
 * jeton de session que le site, en « Authorization: Bearer ».
 */
class Kit(
    private val base: () -> String,
    private val token: () -> String?,
    private val locale: () -> String,
    private val onUnauthorized: () -> Unit,
) {
    val http: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val req = chain.request()
            val b = req.newBuilder()
            token()?.let { b.header("Authorization", "Bearer $it") }
            // Langue des textes produits par le serveur (IA, e-mails…).
            if (req.header("Cookie") == null) b.header("Cookie", "locale=${locale()}")
            // Le site refuse les formulaires venus d'une autre origine (CSRF).
            if (req.method != "GET") b.header("Origin", origin(req.url))
            chain.proceed(b.build())
        }
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(300, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    private fun origin(url: HttpUrl): String {
        val default = (url.scheme == "https" && url.port == 443) || (url.scheme == "http" && url.port == 80)
        return if (default) "${url.scheme}://${url.host}" else "${url.scheme}://${url.host}:${url.port}"
    }

    fun url(path: String, query: Map<String, String?> = emptyMap()): HttpUrl {
        val root = base().trimEnd('/')
        val b = (root + (if (path.startsWith("/")) path else "/$path")).toHttpUrl().newBuilder()
        for ((k, v) in query) if (!v.isNullOrEmpty()) b.addQueryParameter(k, v)
        return b.build()
    }

    /** Adresse d'un fichier du site (couverture, photo…), en vignette de `width` px si donné. */
    fun media(path: String?, width: Int? = null): String? {
        if (path.isNullOrBlank()) return null
        if (path.startsWith("http")) return path
        val p = if (path.startsWith("/media/")) path else "/media/" + path.trimStart('/')
        return url(p, if (width != null) mapOf("w" to width.toString()) else emptyMap()).toString()
    }

    /** Données d'une page du site (ses `load`, layout compris, fusionnées). */
    suspend fun load(path: String, query: Map<String, String?> = emptyMap()): JsonObject {
        val dataPath = path.trimEnd('/').let { if (it.isEmpty()) "/__data.json" else "$it/__data.json" }
        val res = call(Request.Builder().url(url(dataPath, query)).get().build())
        val text = res.use { r ->
            if (r.code == 401) throw unauthorized()
            r.body?.string().orEmpty()
        }
        val json = parseJson(text) ?: throw KitException("Réponse illisible du serveur (${res.code})", res.code)
        when (json.str("type")) {
            "redirect" -> {
                val to = json.str("location").orEmpty()
                if (to.startsWith("/login")) throw unauthorized()
                throw RedirectException(to)
            }
            "error" -> throw errorOf(json)
        }
        val merged = JsonObject()
        for (node in json.arr("nodes")) {
            val n = node.asJsonObject
            when (n.str("type")) {
                "data" -> {
                    val data = Devalue.unflatten(n.get("data"))
                    if (data.isJsonObject) for ((k, v) in data.asJsonObject.entrySet()) merged.add(k, v)
                }
                "error" -> throw errorOf(n)
            }
        }
        return merged
    }

    /** Envoie un formulaire du site : `name` est l'action nommée (`?/delete`), null pour celle par défaut. */
    suspend fun action(
        path: String,
        name: String? = null,
        fields: List<Pair<String, String>> = emptyList(),
        files: List<FilePart> = emptyList(),
    ): ActionResult {
        val body: RequestBody = if (files.isEmpty()) {
            FormBody.Builder().apply { fields.forEach { (k, v) -> add(k, v) } }.build()
        } else {
            MultipartBody.Builder().setType(MultipartBody.FORM).apply {
                fields.forEach { (k, v) -> addFormDataPart(k, v) }
                files.forEach { f -> addFormDataPart(f.field, f.name, f.bytes.toRequestBody(f.mime.toMediaType())) }
            }.build()
        }
        val u = url(path).newBuilder().apply { if (name != null) encodedQuery("/$name") }.build()
        val req = Request.Builder().url(u).post(body)
            .header("x-sveltekit-action", "true")
            .header("Accept", "application/json")
            .build()
        val res = call(req)
        val text = res.use { r ->
            if (r.code == 401) throw unauthorized()
            r.body?.string().orEmpty()
        }
        val json = parseJson(text) ?: throw KitException("Réponse illisible du serveur (${res.code})", res.code)
        val data = json.get("data")?.takeIf { it.isJsonPrimitive }?.asString?.let { Devalue.parse(it) }
        val obj = data?.takeIf { it.isJsonObject }?.asJsonObject ?: JsonObject()
        return when (json.str("type")) {
            "success" -> ActionResult.Success(obj)
            "failure" -> ActionResult.Failure(json.int("status") ?: 400, obj)
            "redirect" -> {
                val to = json.str("location").orEmpty()
                if (to.startsWith("/login")) throw unauthorized()
                ActionResult.Redirect(to)
            }
            else -> throw errorOf(json)
        }
    }

    /** Appel d'une route d'API du site (`/api/...`), réponse JSON. */
    suspend fun api(method: String, path: String, body: JsonElement? = null, query: Map<String, String?> = emptyMap()): JsonElement {
        val rb = body?.toString()?.toRequestBody("application/json".toMediaType())
        val req = Request.Builder().url(url(path, query)).method(method, rb ?: if (method == "GET") null else ByteArray(0).toRequestBody()).build()
        val res = call(req)
        val text = res.use { r ->
            if (r.code == 401) throw unauthorized()
            val t = r.body?.string().orEmpty()
            if (!r.isSuccessful) {
                val msg = parseJson(t)?.let { it.str("message") ?: it.str("error") }
                throw KitException(msg ?: "Erreur ${r.code}", r.code)
            }
            t
        }
        return if (text.isBlank()) JsonNull.INSTANCE else JsonParser.parseString(text)
    }

    /** Envoi multipart vers une route d'API (`/api/...`). */
    suspend fun apiMultipart(path: String, fields: List<Pair<String, String>>, files: List<FilePart>): JsonElement {
        val body = MultipartBody.Builder().setType(MultipartBody.FORM).apply {
            fields.forEach { (k, v) -> addFormDataPart(k, v) }
            files.forEach { f -> addFormDataPart(f.field, f.name, f.bytes.toRequestBody(f.mime.toMediaType())) }
        }.build()
        val res = call(Request.Builder().url(url(path)).post(body).build())
        val text = res.use { r ->
            if (r.code == 401) throw unauthorized()
            val t = r.body?.string().orEmpty()
            if (!r.isSuccessful) {
                val msg = parseJson(t)?.let { it.str("message") ?: it.str("error") }
                throw KitException(msg ?: "Erreur ${r.code}", r.code)
            }
            t
        }
        return if (text.isBlank()) JsonNull.INSTANCE else JsonParser.parseString(text)
    }

    /** Requête brute (téléchargement d'un PDF, flux de l'assistant…). L'appelant ferme la réponse. */
    suspend fun raw(request: Request): Response {
        val res = call(request)
        if (res.code == 401) {
            res.close()
            throw unauthorized()
        }
        return res
    }

    /** Connexion : le formulaire du site pose le cookie de session, dont on garde le jeton. */
    suspend fun login(server: String, email: String, password: String): String =
        authAction(server, "/login", listOf("email" to email, "password" to password))

    /** Création de compte : comme la connexion, le site ouvre aussitôt la session. */
    suspend fun register(server: String, email: String, name: String, password: String): String =
        authAction(server, "/register", listOf("email" to email, "displayName" to name, "password" to password))

    private suspend fun authAction(server: String, path: String, fields: List<Pair<String, String>>): String {
        val root = server.trimEnd('/')
        val body = FormBody.Builder().apply { fields.forEach { (k, v) -> add(k, v) } }.build()
        val req = Request.Builder().url("$root$path".toHttpUrl()).post(body)
            .header("x-sveltekit-action", "true")
            .header("Accept", "application/json")
            .build()
        val res = call(req, anonymous = true)
        res.use { r ->
            val token = r.headers("Set-Cookie").firstNotNullOfOrNull { c ->
                Regex("""^session=([0-9a-f]+)""").find(c)?.groupValues?.get(1)
            }
            if (token != null) return token
            val json = parseJson(r.body?.string().orEmpty())
            val data = json?.get("data")?.takeIf { it.isJsonPrimitive }?.asString?.let { Devalue.parse(it) }
            val msg = data?.takeIf { it.isJsonObject }?.asJsonObject?.let { it.str("error") ?: it.str("message") }
            throw KitException(msg ?: if (r.code >= 500) "Le serveur ne répond pas correctement (${r.code})" else "Identifiants incorrects", r.code)
        }
    }

    /** Vérifie qu'une adresse est bien un serveur Tricouture. */
    suspend fun probe(server: String): Boolean {
        val req = Request.Builder().url("${server.trimEnd('/')}/login".toHttpUrl()).get().build()
        return try {
            call(req, anonymous = true).use { it.isSuccessful }
        } catch (e: Exception) {
            false
        }
    }

    private val anonymousHttp by lazy {
        OkHttpClient.Builder()
            .followRedirects(false)
            .addInterceptor { chain ->
                val req = chain.request()
                val b = req.newBuilder().header("Cookie", "locale=${locale()}")
                if (req.method != "GET") b.header("Origin", origin(req.url))
                chain.proceed(b.build())
            }
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .build()
    }

    private suspend fun call(request: Request, anonymous: Boolean = false): Response = withContext(Dispatchers.IO) {
        val client = if (anonymous) anonymousHttp else http
        try {
            client.newCall(request).await()
        } catch (e: IOException) {
            throw KitException(networkMessage(e))
        }
    }

    private fun unauthorized(): UnauthorizedException {
        onUnauthorized()
        return UnauthorizedException()
    }

    private fun errorOf(json: JsonObject): KitException {
        val err = json.obj("error")
        val status = json.int("status") ?: 500
        return KitException(err?.str("message") ?: json.str("message") ?: "Erreur $status", status)
    }

    private fun parseJson(text: String): JsonObject? = try {
        JsonParser.parseString(text).takeIf { it.isJsonObject }?.asJsonObject
    } catch (e: Exception) {
        null
    }

    companion object {
        fun networkMessage(e: IOException): String = when (e) {
            is java.net.UnknownHostException -> "Serveur introuvable : vérifie l'adresse et ta connexion"
            is java.net.SocketTimeoutException -> "Le serveur met trop de temps à répondre"
            is java.net.ConnectException -> "Impossible de joindre le serveur"
            is javax.net.ssl.SSLException -> "Connexion sécurisée impossible (certificat)"
            else -> e.message ?: "Erreur réseau"
        }
    }
}

/** Le site a redirigé ailleurs (page déplacée, élément supprimé…). */
class RedirectException(val location: String) : KitException("Redirection vers $location", 303)

suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            if (cont.isActive) cont.resume(response) else response.close()
        }
        override fun onFailure(call: Call, e: IOException) {
            if (!cont.isCancelled) cont.resumeWithException(e)
        }
    })
    cont.invokeOnCancellation { runCatching { cancel() } }
}
