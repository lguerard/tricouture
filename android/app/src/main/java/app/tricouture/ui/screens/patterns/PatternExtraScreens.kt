package app.tricouture.ui.screens.patterns

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import kotlinx.coroutines.launch

/** Liseuse plein écran d'un PDF du site. */
@Composable
fun PdfScreen(path: String, title: String) {
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    Screen(title, onBack = { nav.popBackStack() }, actions = {
        IconButton(onClick = {
            scope.launch {
                try { openExternally(context, downloadMedia(context, path, "pdf"), "application/pdf") }
                catch (e: Exception) { toast(e.message ?: "") }
            }
        }) { Icon(Icons.Default.OpenInNew, tr("app.openWith")) }
    }) { padding ->
        PdfPages(path, Modifier.padding(padding).fillMaxSize())
    }
}

/** Import en lot : un patron par PDF, envoyés un par un (comme le site). */
@Composable
fun PatternImportScreen() {
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var files by remember { mutableStateOf<List<Uri>>(emptyList()) }
    var craft by remember { mutableStateOf("tricot") }
    var tags by remember { mutableStateOf("") }
    var aiLanguage by remember { mutableStateOf(Session.locale.value) }
    var progress by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    var created by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var skipped by remember { mutableStateOf<List<String>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    val pick = rememberMultiFilePicker { files = (files + it).distinct() }

    fun run() {
        if (files.isEmpty()) { error = t("patterns.import.error.noFiles"); return }
        if (files.size > 60) { error = t("patterns.import.error.tooMany", "max" to 60); return }
        error = null
        created = emptyList()
        skipped = emptyList()
        scope.launch {
            val list = files
            progress = 0 to list.size
            for ((i, uri) in list.withIndex()) {
                var name = uri.lastPathSegment ?: "?"
                try {
                    val part = readPicked(context, uri, "file")
                    name = part.name
                    val res = Session.kit.apiMultipart("/api/patterns/import-one",
                        listOf("craft" to craft, "tags" to tags, "aiLanguage" to aiLanguage), listOf(part)).objOrNull()
                    if (res?.bool("ok") == true) created = created + (res.str("id").orEmpty() to res.str("title").orEmpty())
                    else skipped = skipped + (res?.str("name") ?: name)
                } catch (e: Exception) {
                    skipped = skipped + name
                }
                progress = (i + 1) to list.size
            }
            progress = null
            files = emptyList()
        }
    }

    Screen(tr("patterns.import.title"), onBack = { nav.popBackStack() }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(tr("patterns.import.intro"), color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (created.isNotEmpty() || skipped.isNotEmpty()) OutlinedCard {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(tr("patterns.import.doneTitle", "n" to created.size), style = MaterialTheme.typography.titleMedium)
                    created.forEach { (pid, title) ->
                        Text(title, color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable { nav.navigate("pattern/$pid") })
                    }
                    if (skipped.isNotEmpty()) Text(tr("patterns.import.skipped", "files" to skipped.joinToString(", ")),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            Text(tr("patterns.import.filesLabel"), style = MaterialTheme.typography.labelLarge)
            files.forEach { Text("📄 " + (it.lastPathSegment?.substringAfterLast('/') ?: it.toString()), maxLines = 1) }
            OutlinedButton(onClick = { pick(arrayOf("application/pdf")) }, enabled = progress == null) { Text(tr("app.pickFile")) }
            Text(tr("patterns.import.filesHint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            SelectField(tr("patterns.import.craftLabel"), craft, CRAFTS.map { it to craftLabel(it) }, { craft = it }, Modifier.fillMaxWidth())
            Text(tr("patterns.import.craftHint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(tags, { tags = it }, label = { Text(tr("patterns.import.tagsLabel")) },
                placeholder = { Text(tr("patterns.import.tagsPlaceholder")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            SelectField(tr("patterns.import.aiLanguageLabel"), aiLanguage, listOf("fr" to "Français", "en" to "English"),
                { aiLanguage = it }, Modifier.fillMaxWidth())
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            progress?.let { (i, n) ->
                LinearProgressIndicator(progress = { if (n == 0) 0f else i / n.toFloat() }, Modifier.fillMaxWidth())
                Text("$i / $n", style = MaterialTheme.typography.bodySmall)
            }
            Button(onClick = { run() }, enabled = progress == null && files.isNotEmpty(), modifier = Modifier.fillMaxWidth()) {
                Text(tr("patterns.import.submit"))
            }
        }
    }
}

/** Couleurs des tags : une pastille par tag, couleur au choix ou automatique. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagColorsScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/patterns/tags")
    val toast = rememberToast()
    var open by remember { mutableStateOf<String?>(null) }
    Screen(tr("patterns.tags.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val colors = d.obj("colors")
            val tags = d.strs("allTags")
            val overridden = d.strs("overriddenTags").toSet()
            val swatches = buildList {
                colors?.entrySet()?.forEach { (_, v) -> v.objOrNull()?.str("bg")?.let { add(it) } }
                d.objs("palette").forEach { it.str("bg")?.let { bg -> add(bg) } }
            }.distinct()
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Text(tr("patterns.tags.subtitle"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (tags.isEmpty()) item { EmptyState(tr("patterns.tags.empty")) }
                items(tags) { tag ->
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(Modifier.weight(1f)) { TagChip(tag, colors) }
                                if (tag in overridden) TextButton(onClick = {
                                    page.submit(action = "resetColor", fields = listOf("tag" to tag), onError = toast)
                                }) { Text(tr("patterns.tags.reset")) }
                                TextButton(onClick = { open = if (open == tag) null else tag }) { Text(tr("patterns.tags.changeColor")) }
                            }
                            if (open == tag) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                swatches.forEach { bg ->
                                    Box(
                                        Modifier.size(36.dp).clip(CircleShape).background(hexColor(bg))
                                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, CircleShape)
                                            .clickable {
                                                open = null
                                                page.submit(action = "setColor", fields = listOf("tag" to tag, "bg" to bg), onError = toast)
                                            },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
