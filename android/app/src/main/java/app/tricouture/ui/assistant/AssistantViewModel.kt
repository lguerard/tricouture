package app.tricouture.ui.assistant

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.tricouture.data.Session
import app.tricouture.data.UnauthorizedException
import app.tricouture.data.objs
import app.tricouture.data.obj
import app.tricouture.data.str
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

/** Ce que l'assistant a trouvé (carte sous la réponse). */
data class Ref(val kind: String, val id: String, val title: String, val subtitle: String?, val href: String, val image: String?)

/** Ce que l'assistant a modifié (lien sous la réponse). */
data class Action(val kind: String, val what: String, val title: String, val href: String)

data class ChatEntry(
    val id: Long,
    val role: String, // "user" | "assistant"
    val text: String = "",
    val context: ChatContext? = null,
    val pending: Boolean = false,
    val tool: String? = null,
    val refs: List<Ref> = emptyList(),
    val actions: List<Action> = emptyList(),
    /** Clé de traduction de l'erreur (chat.error.*). */
    val error: String? = null,
    val stopped: Boolean = false,
)

/** L'objet ouvert à l'écran, joint à la question (patron, projet, laine). */
data class ChatContext(val kind: String, val id: String, val title: String)

/**
 * Conversation avec l'assistant du site (POST /api/ai/assistant, réponse en
 * flux SSE : `data: {json}`). Gardée le temps de la session de l'appli, et
 * renvoyée en entier à chaque question, comme sur le site.
 */
class AssistantViewModel : ViewModel() {
    private val _entries = MutableStateFlow<List<ChatEntry>>(emptyList())
    val entries: StateFlow<List<ChatEntry>> = _entries.asStateFlow()
    private val _context = MutableStateFlow<ChatContext?>(null)
    val context: StateFlow<ChatContext?> = _context.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy: StateFlow<Boolean> = _busy.asStateFlow()
    private val _slow = MutableStateFlow(false)
    val slow: StateFlow<Boolean> = _slow.asStateFlow()

    private var job: Job? = null
    private var nextId = 0L
    private var run = 0L
    private var stoppedAt = 0L

    fun setContext(c: ChatContext?) { _context.value = c }

    fun newConversation() {
        stop()
        _entries.value = emptyList()
        _context.value = null
    }

    fun stop() {
        if (job?.isActive == true) stoppedAt = System.currentTimeMillis()
        job?.cancel()
        val running = _entries.value.lastOrNull { it.pending } ?: return
        update(running.id) { it.copy(pending = false, tool = null, stopped = true) }
        _busy.value = false
    }

    fun retry() {
        val list = _entries.value
        val lastUser = list.indexOfLast { it.role == "user" }
        if (lastUser < 0) return
        val question = list[lastUser].text
        _entries.value = list.subList(0, lastUser)
        send(question)
    }

    fun send(text: String) {
        val question = text.trim()
        if (question.isEmpty() || _busy.value) return
        val ctx = _context.value
        val history = _entries.value.filter { it.text.isNotBlank() && it.error == null }
        val reply = ChatEntry(nextId + 1, "assistant", pending = true)
        _entries.update { it + ChatEntry(nextId, "user", question, context = ctx) + reply }
        nextId += 2
        _busy.value = true
        _slow.value = false
        val current = ++run
        job = viewModelScope.launch {
            val slowTimer = launch { delay(8000); _slow.value = true }
            try {
                val body = JsonObject().apply {
                    add("messages", JsonArray().apply {
                        history.forEach { e -> add(JsonObject().apply { addProperty("role", e.role); addProperty("content", e.text) }) }
                        add(JsonObject().apply { addProperty("role", "user"); addProperty("content", question) })
                    })
                    if (ctx != null) add("context", JsonObject().apply {
                        addProperty("kind", ctx.kind); addProperty("id", ctx.id); addProperty("title", ctx.title)
                    })
                }
                var res = post(body)
                // Reposée juste après « stop » : le serveur n'a peut-être pas encore vu la fin de la précédente.
                if (res.code == 429 && System.currentTimeMillis() - stoppedAt < 3000) {
                    res.close()
                    delay(800)
                    res = post(body)
                }
                res.use { r ->
                    if (!r.isSuccessful || r.body == null) {
                        val key = when (r.code) {
                            413 -> "chat.error.tooLong"; 429 -> "chat.error.busy"; 503 -> "chat.error.unavailable"
                            else -> "chat.error.failed"
                        }
                        update(reply.id) { it.copy(error = key) }
                        return@use
                    }
                    withContext(Dispatchers.IO) {
                        val source = r.body!!.source()
                        val frame = StringBuilder()
                        while (isActive) {
                            val line = source.readUtf8Line() ?: break
                            if (line.isEmpty()) {
                                if (frame.isNotEmpty()) onFrame(reply.id, frame.toString())
                                frame.clear()
                            } else if (line.startsWith("data:")) {
                                frame.append(line.removePrefix("data:").trimStart())
                            }
                        }
                        if (frame.isNotEmpty()) onFrame(reply.id, frame.toString())
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: UnauthorizedException) {
            } catch (e: Exception) {
                update(reply.id) { it.copy(error = "chat.error.network") }
            } finally {
                slowTimer.cancel()
                update(reply.id) { it.copy(pending = false, tool = null) }
                if (run == current) {
                    _busy.value = false
                    _slow.value = false
                }
                // L'assistant a modifié quelque chose : les écrans se rechargeront.
                if (_entries.value.firstOrNull { it.id == reply.id }?.actions?.isNotEmpty() == true) Session.changed()
            }
        }
    }

    private suspend fun post(body: JsonObject) = Session.kit.raw(
        Request.Builder().url(Session.kit.url("/api/ai/assistant"))
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build(),
    )

    private fun onFrame(id: Long, json: String) {
        val e = try { JsonParser.parseString(json).asJsonObject } catch (ex: Exception) { return }
        when (e.str("t")) {
            "delta" -> update(id) { it.copy(text = it.text + (e.str("text") ?: ""), tool = null) }.also { _slow.value = false }
            "tool" -> update(id) { it.copy(tool = e.str("name")) }
            "refs" -> update(id) { entry ->
                val known = entry.refs.map { "${it.kind}:${it.id}" }.toSet()
                val more = e.objs("items").map { r ->
                    Ref(r.str("kind").orEmpty(), r.str("id").orEmpty(), r.str("title").orEmpty(), r.str("subtitle"), r.str("href").orEmpty(), r.str("image"))
                }.filter { "${it.kind}:${it.id}" !in known }
                entry.copy(refs = entry.refs + more)
            }
            "action" -> e.obj("action")?.let { a ->
                update(id) { it.copy(actions = it.actions + Action(a.str("kind").orEmpty(), a.str("what").orEmpty(), a.str("title").orEmpty(), a.str("href").orEmpty())) }
            }
            "error" -> update(id) { it.copy(error = "chat.error." + (e.str("code") ?: "failed")) }
            "done" -> update(id) { it.copy(pending = false, tool = null) }
        }
    }

    private fun update(id: Long, change: (ChatEntry) -> ChatEntry) {
        _entries.update { list -> list.map { if (it.id == id) change(it) else it } }
    }
}
