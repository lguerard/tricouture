package app.tricouture.ui.screens.patterns

import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import coil.compose.AsyncImage
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import kotlinx.coroutines.launch

/** Fiche d'un patron : couverture, infos, fichiers (PDF), pièces, outils IA. */
@Composable
fun PatternDetailScreen(id: String) {
    val nav = LocalNav.current
    val path = "/patterns/$id"
    val page = rememberPage(path)
    val data by page.data.collectAsState()
    val busy by page.busy.collectAsState()
    val ai by Session.ai.collectAsState()
    val toast = rememberToast()
    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    val d = data
    val p = d?.obj("pattern")
    val owner = d?.bool("isOwner") == true

    Screen(
        p?.str("title") ?: tr("nav.patterns"),
        onBack = { nav.popBackStack() },
        actions = {
            if (p != null && owner) {
                IconButton(onClick = { nav.navigate("pattern/$id/edit") }) { Icon(Icons.Default.Edit, tr("app.edit")) }
                IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, null) }
                DropdownMenu(menu, onDismissRequest = { menu = false }) {
                    DropdownMenuItem(
                        text = { Text(if (p.bool("isShared")) tr("patterns.detail.shareOn") else tr("patterns.detail.share")) },
                        onClick = { menu = false; page.submit(action = "toggleShare", onError = toast) },
                    )
                    DropdownMenuItem(
                        text = { Text(tr("patterns.detail.delete"), color = MaterialTheme.colorScheme.error) },
                        onClick = { menu = false; confirmDelete = true },
                    )
                }
            }
        },
        fab = {
            if (p != null) ExtendedFloatingActionButton(
                onClick = { nav.navigate("projects/new?pattern=$id") },
                icon = { Icon(Icons.Default.PlayArrow, null) },
                text = { Text(tr("patterns.detail.startProject").removePrefix("🧶 ")) },
            )
        },
    ) { padding ->
        PageBody(page, Modifier.padding(padding)) { data ->
            val pat = data.obj("pattern") ?: return@PageBody
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp, 8.dp, 16.dp, 96.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                Header(page, pat, data, owner, ai, toast)
                CoverSection(page, pat, owner, toast)
                Facts(pat)
                FilesSection(page, data, owner, toast)
                PiecesSection(page, pat, data, owner, ai, toast)
                if (ai) AssistantCard(
                    onAsk = { nav.navigate("assistant?kind=pattern&id=$id&title=" + Uri.encode(pat.str("title").orEmpty())) },
                    onSuggest = { q ->
                        nav.navigate("assistant?kind=pattern&id=$id&title=" + Uri.encode(pat.str("title").orEmpty()) + "&q=" + Uri.encode(q))
                    },
                )
            }
        }
    }
    if (confirmDelete) ConfirmDialog(
        tr("patterns.detail.deleteConfirm"),
        onConfirm = {
            page.submit(action = "delete", reload = false, onError = toast) { res ->
                if (res.ok) nav.popBackStack()
            }
        },
        onDismiss = { confirmDelete = false },
    )
}

@Composable
private fun Header(page: PageModel, p: JsonObject, data: JsonObject, owner: Boolean, ai: Boolean, toast: (String) -> Unit) {
    val nav = LocalNav.current
    var completing by remember { mutableStateOf(false) }
    var language by remember { mutableStateOf(Session.locale.value) }
    val scope = rememberCoroutineScope()
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(p.str("title").orEmpty(), style = MaterialTheme.typography.headlineSmall)
        ChipRow {
            Pill(craftLabel(p.str("craft")))
            p.strs("tags").forEach { tag ->
                TagChip(tag, data.obj("tagColors")) { nav.navigate("patterns/tag/" + Uri.encode(tag)) }
            }
        }
        if (!owner) Text(tr("patterns.detail.sharedBy", "name" to data.str("ownerName")), color = MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.labelLarge)
        if (owner && ai) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = {
                    completing = true
                    scope.launch {
                        try {
                            Session.kit.api("POST", "/api/ai/pattern-info", JsonParser.parseString(
                                """{"patternId":"${p.str("id")}","language":"$language"}"""))
                        } catch (e: KitException) {
                            toast(if (e.message == "empty") t("patterns.detail.completeEmpty") else e.message ?: t("patterns.detail.aiError"))
                        } finally {
                            completing = false
                        }
                    }
                },
                enabled = !completing,
            ) { Text(if (completing) tr("patterns.detail.completing") else tr("patterns.detail.complete")) }
            FilterMenu(if (language == "fr") "Français" else "English", false, listOf("fr" to "Français", "en" to "English")) { language = it }
        }
    }
}

@Composable
private fun CoverSection(page: PageModel, p: JsonObject, owner: Boolean, toast: (String) -> Unit) {
    var tools by remember { mutableStateOf(false) }
    var candidates by remember { mutableStateOf<List<JsonObject>>(emptyList()) }
    var url by remember { mutableStateOf("") }
    val cover = p.str("coverPath")
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (cover != null) {
            MediaImage(cover, Modifier.fillMaxWidth().heightIn(max = 420.dp).clip(RoundedCornerShape(12.dp)), width = 800,
                contentScale = ContentScale.Fit)
        }
        if (owner) TextButton(onClick = { tools = !tools }) { Text("🖼️ " + tr("patterns.cover.change")) }
        if (owner && tools) {
            OutlinedButton(onClick = {
                page.submit(action = "findCovers", reload = false, onError = toast) { res ->
                    candidates = (res as? ActionResult.Success)?.data?.objs("covers").orEmpty()
                }
            }) { Text("🔍 " + tr("patterns.cover.search")) }
            if (candidates.isNotEmpty()) LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(candidates) { c ->
                    AsyncImage(
                        c.str("imageUrl"), c.str("title"),
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.size(110.dp, 140.dp).clip(RoundedCornerShape(8.dp)).clickable {
                            page.submit(action = "setCover", fields = listOf("url" to c.str("imageUrl").orEmpty()), onError = toast) {
                                if (it.ok) { candidates = emptyList(); toast(t("app.saved")) }
                            }
                        },
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(url, { url = it }, placeholder = { Text(tr("patterns.cover.urlPlaceholder")) }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.weight(1f))
                Button(onClick = {
                    page.submit(action = "setCover", fields = listOf("url" to url.trim()), onError = toast) {
                        if (it.ok) { url = ""; toast(t("app.saved")) }
                    }
                }, enabled = url.isNotBlank()) { Text(tr("patterns.cover.use")) }
            }
            if (cover != null) TextButton(onClick = { page.submit(action = "removeCover", onError = toast) }) {
                Text(tr("patterns.cover.remove"), color = MaterialTheme.colorScheme.error)
            }
        }
    }
}

@Composable
private fun Facts(p: JsonObject) {
    val context = LocalContext.current
    val rows = buildList {
        p.str("garmentType")?.let { add(tr("patterns.detail.garmentType") to it) }
        p.str("designer")?.let { add(tr("patterns.detail.designer") to it) }
        p.str("source")?.let { add(tr("patterns.detail.source") to it) }
        difficultyLabel(p.int("difficulty")).takeIf { it.isNotEmpty() }?.let { add(tr("patterns.detail.difficulty") to it) }
        p.str("language")?.let { add(tr("patterns.detail.language") to it) }
        p.str("sizes")?.let { add(tr("patterns.detail.sizes") to it) }
        if (p.has("gaugeStitches") || p.has("gaugeRows")) add(tr("patterns.detail.gauge") to tr("patterns.detail.gaugeValue",
            "stitches" to (p.double("gaugeStitches")?.let(::num) ?: "?"), "rows" to (p.double("gaugeRows")?.let(::num) ?: "?")))
        p.int("yardageRequired")?.let { add(tr("patterns.detail.yardage") to "$it m") }
    }
    if (rows.isEmpty() && p.str("notes").isNullOrBlank()) return
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            rows.forEach { (k, v) ->
                Row {
                    Text(k, Modifier.width(110.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val link = v.trim().takeIf { it.startsWith("http://") || it.startsWith("https://") }
                    Text(
                        v, style = MaterialTheme.typography.bodyMedium,
                        color = if (link != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                        modifier = if (link != null) Modifier.clickable { openUrl(context, link) } else Modifier,
                    )
                }
            }
            p.str("notes")?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

/** 12.0 → "12", 12.5 → "12.5". */
fun num(v: Double): String = if (v == Math.floor(v)) v.toLong().toString() else v.toString()

@Composable
private fun FilesSection(page: PageModel, data: JsonObject, owner: Boolean, toast: (String) -> Unit) {
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var replacing by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<String?>(null) }
    val picker = rememberFilePicker { uri ->
        val fileId = replacing ?: return@rememberFilePicker
        scope.launch {
            val part = readPicked(context, uri)
            page.submit(action = "replaceFile", fields = listOf("fileId" to fileId), files = listOf(part), onError = toast) {
                if (it.ok) toast(t("patterns.detail.fileReplaced"))
            }
        }
    }
    val files = data.objs("files")
    if (files.isEmpty()) {
        Text(tr("patterns.detail.noFiles"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        return
    }
    files.forEach { f ->
        val mime = f.str("mimeType").orEmpty()
        val stored = f.str("storedPath").orEmpty()
        ElevatedCard(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(if (mime == "application/pdf") Icons.Default.PictureAsPdf else Icons.Default.Image, null)
                    Text(f.str("filename").orEmpty(), Modifier.weight(1f).padding(start = 8.dp), style = MaterialTheme.typography.titleSmall)
                }
                if (mime.startsWith("image/")) {
                    MediaImage(stored, Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)), width = 800, contentScale = ContentScale.FillWidth)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (mime == "application/pdf") Button(onClick = {
                        nav.navigate("pdf?path=" + Uri.encode(stored) + "&title=" + Uri.encode(f.str("filename").orEmpty()))
                    }) { Text(tr("patterns.detail.open")) }
                    else OutlinedButton(onClick = {
                        scope.launch {
                            try { openExternally(context, downloadMedia(context, stored, mime.substringAfter('/')), mime) }
                            catch (e: Exception) { toast(e.message ?: "") }
                        }
                    }) { Text(tr("patterns.detail.open")) }
                    if (owner) {
                        TextButton(onClick = {
                            replacing = f.str("id")
                            picker(arrayOf("application/pdf", "image/*"))
                        }) { Text(tr("patterns.detail.fileReplace")) }
                        TextButton(onClick = { deleting = f.str("id") }) {
                            Text(tr("patterns.detail.fileDelete"), color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
        }
    }
    deleting?.let { fid ->
        ConfirmDialog(tr("patterns.detail.fileDeleteConfirm") + " ?", onConfirm = {
            page.submit(action = "deleteFile", fields = listOf("fileId" to fid), onError = toast) {
                if (it.ok) toast(t("patterns.detail.fileDeleted"))
            }
        }, onDismiss = { deleting = null })
    }
}

@Composable
private fun PiecesSection(page: PageModel, p: JsonObject, data: JsonObject, owner: Boolean, ai: Boolean, toast: (String) -> Unit) {
    val scope = rememberCoroutineScope()
    var analyzing by remember { mutableStateOf(false) }
    var newPiece by remember { mutableStateOf("") }
    val craft = p.str("craft")
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(tr("patterns.detail.piecesTitle"), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                if (owner && ai) TextButton(onClick = {
                    analyzing = true
                    scope.launch {
                        try {
                            Session.kit.api("POST", "/api/ai/pattern-pieces", JsonParser.parseString("""{"patternId":"${p.str("id")}"}"""))
                        } catch (e: KitException) {
                            toast(when (e.message) {
                                "no-text" -> t("patterns.detail.piecesNoText")
                                "empty" -> t("patterns.detail.piecesEmpty")
                                else -> e.message ?: t("patterns.detail.aiError")
                            })
                        } finally {
                            analyzing = false
                        }
                    }
                }, enabled = !analyzing) {
                    Text(if (analyzing) tr("patterns.detail.piecesAnalyzing") else tr("patterns.detail.piecesAnalyze"))
                }
            }
            val pieces = data.objs("pieces")
            if (pieces.isEmpty()) Text(tr("patterns.detail.piecesEmptyList"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            pieces.forEach { piece ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(piece.str("name").orEmpty(), Modifier.weight(1f))
                    val field = if (craft == "couture") "quantity" else "defaultTotalRows"
                    val value = piece.int(field)
                    if (owner) {
                        var text by remember(piece.str("id"), value) { mutableStateOf(value?.toString().orEmpty()) }
                        OutlinedTextField(
                            text, { v -> text = v.filter { it.isDigit() } },
                            placeholder = { Text(if (craft == "couture") tr("patterns.detail.piecesQuantityPlaceholder") else tr("patterns.detail.piecesRowsPlaceholder")) },
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            modifier = Modifier.width(96.dp),
                        )
                        if (text != (value?.toString().orEmpty())) IconButton(onClick = {
                            page.submit(action = "updatePieceDefaults", fields = listOf("pieceId" to piece.str("id").orEmpty(), field to text), onError = toast)
                        }) { Icon(Icons.Default.Check, tr("app.save")) }
                        IconButton(onClick = {
                            page.submit(action = "removePiece", fields = listOf("pieceId" to piece.str("id").orEmpty()), onError = toast)
                        }) { Icon(Icons.Default.Close, tr("patterns.detail.piecesRemove")) }
                    } else if (value != null) {
                        Text(
                            if (craft == "couture") tr("patterns.detail.piecesQuantityBadge", "n" to value) else tr("patterns.detail.piecesRowsBadge", "n" to value),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
            if (owner) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(newPiece, { newPiece = it }, placeholder = { Text(tr("patterns.detail.piecesAddPlaceholder")) },
                    singleLine = true, modifier = Modifier.weight(1f))
                Button(onClick = {
                    page.submit(action = "addPiece", fields = listOf("name" to newPiece.trim()), onError = toast) { if (it.ok) newPiece = "" }
                }, enabled = newPiece.isNotBlank()) { Text(tr("patterns.detail.piecesAdd")) }
            }
        }
    }
}

@Composable
fun AssistantCard(onAsk: () -> Unit, onSuggest: (String) -> Unit) {
    val suggestion = tr("chat.suggest.yarnForPattern")
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(tr("patterns.detail.assistantTitle"), style = MaterialTheme.typography.titleMedium)
            Text(tr("patterns.detail.assistantHint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onAsk) { Text(tr("chat.ask")) }
                OutlinedButton(onClick = { onSuggest(suggestion) }) { Text(suggestion, maxLines = 1) }
            }
        }
    }
}
