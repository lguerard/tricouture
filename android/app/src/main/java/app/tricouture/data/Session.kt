package app.tricouture.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.Locale

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

private val SERVER_KEY = stringPreferencesKey("server_url")
private val TOKEN_KEY = stringPreferencesKey("session_token")
private val LOCALE_KEY = stringPreferencesKey("locale")

/** Ce qui est connu de la personne connectée (données du layout du site). */
data class Me(val id: String, val name: String, val email: String, val isAdmin: Boolean, val aiAutoFill: Boolean)

/**
 * État de l'appli partagé par tous les écrans : adresse du serveur, jeton
 * de session, langue, et le client qui parle au site.
 */
object Session {
    private lateinit var store: DataStore<Preferences>
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val _server = MutableStateFlow("")
    val server: StateFlow<String> = _server.asStateFlow()
    private val _token = MutableStateFlow<String?>(null)
    val token: StateFlow<String?> = _token.asStateFlow()
    private val _locale = MutableStateFlow(defaultLocale())
    val locale: StateFlow<String> = _locale.asStateFlow()
    /** null tant que les préférences n'ont pas été lues. */
    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()
    private val _me = MutableStateFlow<Me?>(null)
    val me: StateFlow<Me?> = _me.asStateFlow()
    /** L'IA (Ollama) est-elle configurée sur le serveur ? */
    private val _ai = MutableStateFlow(false)
    val ai: StateFlow<Boolean> = _ai.asStateFlow()

    /** Compteur de modifications (formulaires envoyés) : une page affichée se recharge s'il a bougé. */
    private val _changes = MutableStateFlow(0)
    val changes: StateFlow<Int> = _changes.asStateFlow()
    fun changed() { _changes.value++ }

    val kit = Kit(
        base = { _server.value },
        token = { _token.value },
        locale = { _locale.value },
        onUnauthorized = { forget() },
        onChanged = { changed() },
    )

    fun init(context: Context) {
        if (::store.isInitialized) return
        store = context.applicationContext.dataStore
        scope.launch {
            val prefs = store.data.first()
            _server.value = prefs[SERVER_KEY].orEmpty()
            _token.value = prefs[TOKEN_KEY]
            prefs[LOCALE_KEY]?.let { _locale.value = it }
            _ready.value = true
        }
    }

    suspend fun login(server: String, email: String, password: String) {
        val clean = normalize(server)
        val token = kit.login(clean, email.trim(), password)
        _server.value = clean
        _token.value = token
        store.edit {
            it[SERVER_KEY] = clean
            it[TOKEN_KEY] = token
        }
    }

    suspend fun register(server: String, email: String, name: String, password: String) {
        val clean = normalize(server)
        val token = kit.register(clean, email.trim(), name.trim(), password)
        _server.value = clean
        _token.value = token
        store.edit {
            it[SERVER_KEY] = clean
            it[TOKEN_KEY] = token
        }
    }

    suspend fun logout() {
        val sent = _token.value
        if (sent != null) runCatching { kit.action("/logout") }
        forget()
    }

    private fun forget() {
        val sent = _token.value ?: return
        _token.value = null
        _me.value = null
        scope.launch { store.edit { if (it[TOKEN_KEY] == sent) it.remove(TOKEN_KEY) } }
    }

    fun setLocale(locale: String) {
        _locale.value = locale
        scope.launch { store.edit { it[LOCALE_KEY] = locale } }
    }

    /** Données communes renvoyées par le layout du site, à chaque page. */
    /** Calendrier de l'Avent (layout du site) : rôle, porte en attente, notifications. */
    private val _advent = MutableStateFlow<com.google.gson.JsonObject?>(null)
    val advent: StateFlow<com.google.gson.JsonObject?> = _advent.asStateFlow()

    fun absorbLayout(data: com.google.gson.JsonObject) {
        data.obj("advent")?.let { _advent.value = it }
        data.obj("user")?.let { u ->
            _me.value = Me(
                id = u.str("id").orEmpty(),
                name = u.str("displayName").orEmpty(),
                email = u.str("email").orEmpty(),
                isAdmin = u.bool("isAdmin"),
                aiAutoFill = u.bool("aiAutoFillEnabled"),
            )
        }
        if (data.has("ai")) _ai.value = data.bool("ai")
    }

    fun normalize(server: String): String {
        var s = server.trim().trimEnd('/')
        if (s.isNotEmpty() && !s.startsWith("http://") && !s.startsWith("https://")) s = "https://$s"
        return s
    }

    private fun defaultLocale(): String = if (Locale.getDefault().language == "fr") "fr" else "en"
}
