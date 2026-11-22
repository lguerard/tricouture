package app.tricouture.ui.assistant

import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.Routes
import app.tricouture.ui.components.*
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

/**
 * Assistant : la conversation (avec, en option, le patron / projet ouvert),
 * et les outils de la page du site (traduction, génération de patron).
 */
@Composable
fun AssistantScreen(kind: String, id: String, title: String, question: String) {
    val nav = LocalNav.current
    val activity = LocalContext.current as ComponentActivity
    // Une seule conversation pour toute l'appli : on la retrouve d'un écran à l'autre.
    val chat: AssistantViewModel = viewModel(activity)
    val ai by Session.ai.collectAsState()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(kind, id) {
        if (kind.isNotEmpty() && id.isNotEmpty()) chat.setContext(ChatContext(kind, id, title))
    }
    // Suggestion choisie depuis une fiche : envoyée aussitôt, une seule fois.
    var asked by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(question) {
        if (question.isNotBlank() && !asked) { asked = true; chat.send(question) }
    }
    Screen(
        tr("chat.title"),
        onBack = { nav.popBackStack() },
        actions = {
            if (tab == 0) TextButton(onClick = { chat.newConversation() }) { Text(tr("chat.new")) }
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            TabRow(selectedTabIndex = tab) {
                Tab(tab == 0, { tab = 0 }, text = { Text("🤖 " + tr("assistant.chatTitle"), maxLines = 1, overflow = TextOverflow.Ellipsis) })
                Tab(tab == 1, { tab = 1 }, text = { Text("🌍 " + tr("assistant.tabTranslate"), maxLines = 1) })
                Tab(tab == 2, { tab = 2 }, text = { Text("✨ " + tr("assistant.tabGenerate"), maxLines = 1) })
            }
            when (tab) {
                0 -> if (ai) Chat(chat) else EmptyState(tr("chat.error.unavailable"), emoji = "🤖")
                1 -> Translate()
                else -> Generate()
            }
        }
    }
}

@Composable
private fun Chat(chat: AssistantViewModel) {
    val nav = LocalNav.current
    val context = LocalContext.current
    val entries by chat.entries.collectAsState()
    val ctx by chat.context.collectAsState()
    val busy by chat.busy.collectAsState()
    val slow by chat.slow.collectAsState()
    var draft by rememberSaveable { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(entries.size, entries.lastOrNull()?.text?.length) {
        if (entries.isNotEmpty()) list.animateScrollToItem(entries.size - 1)
    }
    fun open(path: String) {
        Routes.fromSitePath(path)?.let { nav.navigate(it) }
    }
    Column(Modifier.fillMaxSize().imePadding()) {
        LazyColumn(
            state = list,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = PaddingValues(12.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            if (entries.isEmpty()) item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(tr("chat.intro"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val suggestions = buildList {
                        if (ctx?.kind == "project") add("chat.suggest.thisProject" to true)
                        if (ctx?.kind == "yarn") add("chat.suggest.patternForYarn" to true)
                        add("chat.suggest.yarnForPattern" to (ctx?.kind == "pattern"))
                        add("chat.suggest.explainStitch" to false)
                        add("chat.suggest.whereAmI" to true)
                    }
                    suggestions.forEach { (key, send) ->
                        val text = tr(key)
                        SuggestionChip(onClick = { if (send) chat.send(text) else draft = text }, label = { Text(text) })
                    }
                }
            }
            items(entries, key = { it.id }) { e ->
                if (e.role == "user") {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(16.dp)) {
                            Text(e.text, Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onPrimaryContainer)
                        }
                    }
                } else Answer(e, slow && e.pending, onOpen = ::open, onWeb = { openUrl(context, it) }, onRetry = { chat.retry() })
            }
        }
        ctx?.let { c ->
            AssistChip(
                onClick = {},
                label = { Text(tr("chat.context.${c.kind}") + " : " + c.title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                trailingIcon = { Icon(Icons.Default.Close, tr("chat.removeContext"), Modifier.clickable { chat.setContext(null) }) },
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }
        Row(Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(draft, { draft = it }, placeholder = { Text(tr("chat.placeholder")) }, maxLines = 5,
                modifier = Modifier.weight(1f))
            if (busy) IconButton(onClick = { chat.stop() }) { Icon(Icons.Default.Stop, tr("chat.stop")) }
            else IconButton(onClick = { chat.send(draft); draft = "" }, enabled = draft.isNotBlank()) {
                Icon(Icons.AutoMirrored.Filled.Send, tr("chat.send"))
            }
        }
        Text(tr("chat.disclaimer"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(start = 12.dp, end = 12.dp, bottom = 6.dp))
    }
}

@Composable
private fun Answer(e: ChatEntry, slow: Boolean, onOpen: (String) -> Unit, onWeb: (String) -> Unit, onRetry: () -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (e.text.isNotEmpty()) ChatMarkdown(e.text, onOpen, onWeb)
        if (e.pending && e.text.isEmpty()) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
            Text(e.tool?.let { k -> "chat.tool.$k".takeIf { I18n.has(it) }?.let { tr(it) } } ?: tr("chat.thinking"),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (slow) Text(tr("chat.slow"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        e.refs.forEach { r ->
            OutlinedCard(onClick = { onOpen(r.href) }, modifier = Modifier.fillMaxWidth()) {
                Row(Modifier.padding(8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    MediaImage(r.image, Modifier.size(44.dp).clip(RoundedCornerShape(6.dp)), width = 200,
                        placeholder = when (r.kind) { "pattern" -> "📄"; "project" -> "🧶"; else -> "🧵" })
                    Column(Modifier.weight(1f)) {
                        Text(r.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        r.subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    }
                }
            }
        }
        e.actions.forEach { a ->
            val icon = when (a.kind) { "created" -> "✨"; "updated" -> "✏️"; "deleted" -> "🗑"; "note_added" -> "📝"; else -> "🖼️" }
            val what = "chat.what.${a.what}".takeIf { I18n.has(it) }?.let { tr(it) } ?: a.what
            Text("$icon $what : ${a.title}", color = MaterialTheme.colorScheme.primary,
                modifier = if (a.kind != "deleted" && a.href.isNotEmpty()) Modifier.clickable { onOpen(a.href) } else Modifier)
        }
        if (e.stopped) Text(tr("chat.stopped"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        e.error?.let { key ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (I18n.has(key)) tr(key) else tr("chat.error.failed"), color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
                TextButton(onClick = onRetry) { Text(tr("chat.retry")) }
            }
        }
    }
}

@Composable
private fun Translate() {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var source by rememberSaveable { mutableStateOf("") }
    var result by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(source, { source = it.take(8000) }, label = { Text(tr("assistant.sourceLabel")) },
            placeholder = { Text(tr("assistant.sourcePlaceholder")) }, minLines = 6, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            busy = true; error = null; result = ""
            scope.launch {
                try {
                    result = Session.kit.api("POST", "/api/ai/translate", JsonObject().apply { addProperty("text", source) })
                        .objOrNull()?.str("result").orEmpty()
                } catch (e: KitException) {
                    error = e.message ?: t("assistant.error")
                } finally { busy = false }
            }
        }, enabled = !busy && source.isNotBlank()) { Text(if (busy) tr("assistant.translating") else tr("assistant.translateBtn")) }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (result.isNotEmpty()) {
            Text(tr("assistant.translationLabel"), style = MaterialTheme.typography.labelLarge)
            SelectionContainerText(result)
            TextButton(onClick = { clipboard.setText(AnnotatedString(result)) }) { Icon(Icons.Default.ContentCopy, null) }
        }
    }
}

@Composable
private fun Generate() {
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    var desc by rememberSaveable { mutableStateOf("") }
    var craft by rememberSaveable { mutableStateOf("tricot") }
    var gauge by rememberSaveable { mutableStateOf("") }
    var size by rememberSaveable { mutableStateOf("") }
    var result by rememberSaveable { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        OutlinedTextField(desc, { desc = it }, label = { Text(tr("assistant.descLabel")) },
            placeholder = { Text(tr("assistant.descPlaceholder")) }, minLines = 3, modifier = Modifier.fillMaxWidth())
        SelectField(tr("assistant.typeLabel"), craft, CRAFTS.map { it to craftLabel(it) }, { craft = it }, Modifier.fillMaxWidth())
        OutlinedTextField(gauge, { gauge = it }, label = { Text(tr("assistant.gaugeLabel")) },
            placeholder = { Text(tr("assistant.gaugePlaceholder")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(size, { size = it }, label = { Text(tr("assistant.sizeLabel")) },
            placeholder = { Text(tr("assistant.sizePlaceholder")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            busy = true; error = null; result = ""
            scope.launch {
                try {
                    result = Session.kit.api("POST", "/api/ai/generate-pattern", JsonObject().apply {
                        addProperty("description", desc); addProperty("craft", craft); addProperty("gauge", gauge); addProperty("size", size)
                    }).objOrNull()?.str("result").orEmpty()
                } catch (e: KitException) {
                    error = e.message ?: t("assistant.error")
                } finally { busy = false }
            }
        }, enabled = !busy && desc.isNotBlank()) { Text(if (busy) tr("assistant.generating") else tr("assistant.generateBtn")) }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (result.isNotEmpty()) {
            Text(tr("assistant.generatedLabel"), style = MaterialTheme.typography.labelLarge)
            SelectionContainerText(result)
            TextButton(onClick = { clipboard.setText(AnnotatedString(result)) }) { Icon(Icons.Default.ContentCopy, null) }
        }
    }
}

@Composable
private fun SelectionContainerText(text: String) {
    androidx.compose.foundation.text.selection.SelectionContainer {
        Text(text, Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)).padding(12.dp),
            style = MaterialTheme.typography.bodyMedium)
    }
}
