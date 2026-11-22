package app.tricouture.ui.screens.stash

import android.content.Context
import android.net.Uri
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import app.tricouture.ui.screens.patterns.NumberField
import app.tricouture.ui.screens.projects.PhotoViewer
import com.google.gson.JsonObject
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.text.Normalizer
import kotlin.coroutines.resume

private data class StashTab(val kind: String, val emoji: String, val key: String, val listKey: String)

private val TABS = listOf(
    StashTab("yarn", "🧶", "stash.tab.yarn", "yarnList"),
    StashTab("fabric", "🧵", "stash.tab.fabric", "fabricList"),
    StashTab("notion", "🔘", "stash.tab.notion", "notionList"),
    StashTab("tool", "🪡", "stash.tab.tool", "toolList"),
)

/** Noms de couleurs (fr + en) → teinte, pour chercher « rouge » ou « #e63946 » (comme le site). */
private val COLOR_NAMES = mapOf(
    "rouge" to "#e63946", "red" to "#e63946", "bleu" to "#1d3557", "blue" to "#1d3557",
    "vert" to "#2a9d8f", "green" to "#2a9d8f", "jaune" to "#ffd60a", "yellow" to "#ffd60a",
    "noir" to "#000000", "black" to "#000000", "blanc" to "#ffffff", "white" to "#ffffff",
    "gris" to "#808080", "grey" to "#808080", "gray" to "#808080", "marron" to "#8b4513", "brown" to "#8b4513",
    "rose" to "#ffc0cb", "pink" to "#ffc0cb", "orange" to "#ffa500", "violet" to "#8a2be2", "purple" to "#8a2be2",
    "mauve" to "#8a2be2", "beige" to "#f5f5dc", "turquoise" to "#40e0d0", "bordeaux" to "#800020", "maroon" to "#800020",
    "kaki" to "#78866b", "khaki" to "#78866b", "corail" to "#ff7f50", "coral" to "#ff7f50", "ivoire" to "#fffff0",
    "ivory" to "#fffff0", "moutarde" to "#ffdb58", "mustard" to "#ffdb58", "taupe" to "#483c32",
    "naturel" to "#f0e6d2", "natural" to "#f0e6d2", "ecru" to "#f0e6d2",
)

private fun normalize(s: String) = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().trim()

private fun hexDistance(a: String, b: String): Double {
    val pa = a.removePrefix("#").toLongOrNull(16) ?: return Double.MAX_VALUE
    val pb = b.removePrefix("#").toLongOrNull(16) ?: return Double.MAX_VALUE
    val dr = ((pa shr 16) and 255) - ((pb shr 16) and 255)
    val dg = ((pa shr 8) and 255) - ((pb shr 8) and 255)
    val db = (pa and 255) - (pb and 255)
    return Math.sqrt((dr * dr + dg * dg + db * db).toDouble())
}

private fun matches(fields: List<String?>, colorHex: String?, query: String): Boolean {
    if (query.isBlank()) return true
    val q = normalize(query)
    if (fields.any { it != null && normalize(it).contains(q) }) return true
    if (colorHex == null) return false
    val target = COLOR_NAMES[q] ?: if (Regex("^#?[0-9a-f]{6}$", RegexOption.IGNORE_CASE).matches(q)) (if (q.startsWith("#")) q else "#$q") else null
    return target != null && hexDistance(target, colorHex) < 110
}

/** Stock : laine, tissu, mercerie, outils. Recherche par texte, couleur ou matière. */
@Composable
fun StashScreen(presetTab: String = "", presetQuery: String = "") {
    val nav = LocalNav.current
    val page = rememberPage("/stash")
    val toast = rememberToast()
    var tab by rememberSaveable { mutableStateOf(TABS.firstOrNull { it.kind == presetTab }?.kind ?: "yarn") }
    var query by rememberSaveable { mutableStateOf(presetQuery) }
    var adding by rememberSaveable { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<Pair<String, String>?>(null) }
    var viewing by remember { mutableStateOf<String?>(null) }
    val ai by Session.ai.collectAsState()
    val current = TABS.first { it.kind == tab }

    Screen(
        tr("stash.title"),
        actions = {
            if (ai) IconButton(onClick = { nav.navigate("assistant?kind=&id=&title=&q=") }) { Icon(Icons.Default.AutoAwesome, tr("chat.ask")) }
        },
        fab = {
            if (!adding) ExtendedFloatingActionButton(
                onClick = { adding = true },
                icon = { Icon(Icons.Default.Add, null) },
                text = { Text(tr("stash.addItem").removePrefix("+ ")) },
            )
        },
    ) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            Column(Modifier.fillMaxSize()) {
                ScrollableTabRow(selectedTabIndex = TABS.indexOf(current), edgePadding = 8.dp) {
                    TABS.forEach { tb ->
                        Tab(selected = tab == tb.kind, onClick = { tab = tb.kind; adding = false },
                            text = { Text("${tb.emoji} ${tr(tb.key)} (${d.arr(tb.listKey).size()})") })
                    }
                }
                if (adding) {
                    AddItemForm(page, tab, onDone = { adding = false })
                    return@Column
                }
                OutlinedTextField(
                    query, { query = it },
                    placeholder = { Text(tr("stash.searchPlaceholder")) },
                    leadingIcon = { Icon(Icons.Default.Search, null) },
                    trailingIcon = { if (query.isNotEmpty()) IconButton(onClick = { query = "" }) { Icon(Icons.Default.Close, null) } },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                )
                val items = d.objs(current.listKey).filter { item -> matches(searchFields(item, tab), item.str("colorHex"), query) }
                LazyColumn(
                    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    if (items.isEmpty()) item { EmptyState(if (query.isBlank()) tr("app.empty") else tr("stash.noResults"), emoji = current.emoji) }
                    items(items, key = { it.str("id").orEmpty() }) { item ->
                        StashCard(item, tab,
                            onPhoto = { viewing = item.str("photoPath") },
                            onRemovePhoto = {
                                page.submit(action = "removePhoto", fields = listOf("kind" to tab, "id" to item.str("id").orEmpty()), onError = toast)
                            },
                            onDelete = { deleting = tab to item.str("id").orEmpty() })
                    }
                }
            }
        }
    }
    deleting?.let { (kind, id) ->
        ConfirmDialog(tr("app.confirmDelete"), onConfirm = {
            page.submit(action = "delete", fields = listOf("kind" to kind, "id" to id), onError = toast)
        }, onDismiss = { deleting = null })
    }
    viewing?.let { PhotoViewer(it) { viewing = null } }
}

@Composable
private fun searchFields(item: JsonObject, kind: String): List<String?> = when (kind) {
    "yarn" -> listOf(item.str("brand"), item.str("name"), item.str("colorway"), item.str("fiber"), item.str("weightCategory"),
        item.str("motif")?.let { tr("motif.$it") }, item.str("dyeLot"), item.str("notes"))
    "fabric" -> listOf(item.str("name"), item.str("fabricType"), item.str("composition"), item.str("motif")?.let { tr("motif.$it") })
    "notion" -> listOf(item.str("name"), item.str("category"))
    else -> listOf(item.str("type")?.let { tr("tool.$it") })
}

@Composable
private fun StashCard(item: JsonObject, kind: String, onPhoto: () -> Unit, onRemovePhoto: () -> Unit, onDelete: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    ElevatedCard(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            val photo = item.str("photoPath")
            if (photo != null) {
                MediaImage(photo, Modifier.size(64.dp).clip(RoundedCornerShape(8.dp)).clickable(onClick = onPhoto), width = 200)
            } else {
                Box(
                    Modifier.size(64.dp).clip(RoundedCornerShape(8.dp))
                        .background(item.str("colorHex")?.let { hexColor(it) } ?: MaterialTheme.colorScheme.surfaceVariant),
                    contentAlignment = Alignment.Center,
                ) { if (item.str("colorHex") == null) Text(TABS.first { it.kind == kind }.emoji, style = MaterialTheme.typography.titleLarge) }
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                when (kind) {
                    "yarn" -> {
                        Text(listOfNotNull(item.str("brand"), item.str("name")).joinToString(" ").ifBlank { tr("stash.yarn.fallbackName") },
                            style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        val skeins = item.double("skeins") ?: 1.0
                        Sub(listOfNotNull(
                            item.str("colorway"),
                            item.str("weightCategory"),
                            item.str("fiber"),
                            item.str("motif")?.let { tr("motif.$it") },
                            (if (skeins == Math.floor(skeins)) skeins.toLong().toString() else skeins.toString()) + " " +
                                if (skeins > 1) tr("stash.yarn.skeinPlural") else tr("stash.yarn.skein"),
                            item.int("yardsPerSkein")?.let { "$it m" },
                            item.str("dyeLot")?.let { tr("stash.yarn.dyeLotPrefix") + " " + it },
                        ))
                    }
                    "fabric" -> {
                        Text(item.str("name") ?: item.str("fabricType") ?: tr("stash.fabric.fallbackName"),
                            style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Sub(listOfNotNull(
                            item.str("fabricType"), item.str("composition"), item.str("motif")?.let { tr("motif.$it") },
                            item.int("lengthCm")?.let { "$it cm" }, item.int("widthCm")?.let { tr("stash.fabric.widthPrefix") + " $it cm" },
                        ))
                    }
                    "notion" -> {
                        Text(item.str("name").orEmpty(), style = MaterialTheme.typography.titleSmall)
                        Sub(listOfNotNull(item.str("category"), tr("stash.qtyPrefix") + " " + (item.int("quantity") ?: 0)))
                    }
                    else -> {
                        Text(item.str("type")?.let { tr("tool.$it") }.orEmpty(), style = MaterialTheme.typography.titleSmall)
                        Sub(listOfNotNull(
                            item.double("sizeMm")?.let { (if (it == Math.floor(it)) it.toLong().toString() else it.toString()) + " mm" },
                            item.int("lengthCm")?.let { "$it cm" },
                            tr("stash.qtyPrefix") + " " + (item.int("quantity") ?: 1),
                            if (item.has("inUseProjectId")) tr("stash.inUse") else null,
                        ))
                    }
                }
            }
            Box {
                IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, null) }
                DropdownMenu(menu, onDismissRequest = { menu = false }) {
                    if (photo != null) DropdownMenuItem(text = { Text(tr("stash.removePhoto")) }, onClick = { menu = false; onRemovePhoto() })
                    DropdownMenuItem(text = { Text(tr("stash.delete"), color = MaterialTheme.colorScheme.error) }, onClick = { menu = false; onDelete() })
                }
            }
        }
    }
}

@Composable
private fun Sub(parts: List<String>) {
    val text = parts.filter { it.isNotBlank() }.joinToString(" · ")
    if (text.isNotEmpty()) Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        maxLines = 2, overflow = TextOverflow.Ellipsis)
}

/** Formulaire d'ajout (un par type), avec les aides du site : code-barres, étiquette, URL, photo. */
@Composable
private fun AddItemForm(page: PageModel, kind: String, onDone: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    val ai by Session.ai.collectAsState()
    val f = remember(kind) { mutableStateMapOf<String, String>().apply { if (kind == "yarn") put("skeins", "1"); if (kind == "tool") { put("type", "aiguille_circulaire"); put("quantity", "1") } } }
    var photo by remember(kind) { mutableStateOf<Uri?>(null) }
    var photoDataUrl by remember(kind) { mutableStateOf<String?>(null) }
    var msg by remember(kind) { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    var urlOpen by remember { mutableStateOf(false) }
    var url by remember { mutableStateOf("") }

    fun apply(fields: JsonObject?) {
        fields?.entrySet()?.forEach { (k, v) ->
            if (v.isJsonPrimitive && v.asString.isNotBlank()) f[k] = v.asString
        }
    }
    suspend fun analyze(part: FilePart, withMotif: Boolean) {
        val needsColor = (kind == "yarn" || kind == "fabric") && f["colorHex"].isNullOrBlank()
        val needsMotif = withMotif && (kind == "yarn" || kind == "fabric") && f["motif"].isNullOrBlank()
        if (!needsColor && !needsMotif) return
        try {
            val res = Session.kit.apiMultipart("/api/ai/analyze-photo" + if (needsMotif) "" else "?motif=0", emptyList(), listOf(part.copyAs("file"))).objOrNull()
            if (needsColor) res?.str("colorHex")?.let { f["colorHex"] = it }
            if (needsMotif) res?.str("motif")?.let { f["motif"] = it }
        } catch (e: Exception) { }
    }
    fun lookup(path: String, body: JsonObject) {
        busy = true
        msg = null
        scope.launch {
            try {
                val res = Session.kit.api("POST", path, body).objOrNull()
                apply(res?.obj("fields"))
                res?.str("photoDataUrl")?.let { data ->
                    photoDataUrl = data
                    photo = null
                    dataUrlPart(data)?.let { analyze(it, true) }
                }
                msg = t("stash.fieldsPrefilled")
                urlOpen = false
            } catch (e: KitException) {
                msg = when (e.message) {
                    "blocked" -> t("stash.importBlocked")
                    "nometa" -> t("stash.importNoMetadata")
                    else -> e.message ?: t("stash.scanUnavailable")
                }
            } finally {
                busy = false
            }
        }
    }
    val barcodeShot = rememberCamera(context) { uri ->
        busy = true
        scope.launch {
            val code = readBarcode(context, uri)
            if (code == null) {
                msg = t("stash.barcodeNoCode")
                busy = false
            } else {
                if (kind == "yarn") f["notes"] = code
                lookup("/api/ai/lookup-barcode", JsonObject().apply { addProperty("code", code); addProperty("kind", kind) })
            }
        }
    }
    val labelShot = rememberCamera(context) { uri ->
        busy = true
        scope.launch {
            try {
                val part = readPickedImage(context, uri, "file", 1600)
                val res = Session.kit.apiMultipart("/api/ai/scan-label", emptyList(), listOf(part)).objOrNull()
                val raw = res?.obj("fields")
                if (kind == "fabric") {
                    raw?.str("name")?.let { f["name"] = it }
                    raw?.str("fiber")?.let { f["composition"] = it }
                } else apply(raw)
                analyze(part, false)
                msg = t("stash.fieldsPrefilled")
            } catch (e: Exception) {
                msg = e.message ?: t("stash.scanUnavailable")
            } finally {
                busy = false
            }
        }
    }
    val pickPhoto = rememberFilePicker { uri ->
        photo = uri
        photoDataUrl = null
        scope.launch { analyze(readPickedImage(context, uri, "file", 1024), true) }
    }
    val takePhoto = rememberCamera(context) { uri ->
        photo = uri
        photoDataUrl = null
        scope.launch { analyze(readPickedImage(context, uri, "file", 1024), true) }
    }

    fun submit() {
        busy = true
        scope.launch {
            try {
                val files = photo?.let { listOf(readPickedImage(context, it, "photo")) } ?: emptyList()
                val fields = f.toList() + listOfNotNull(photoDataUrl?.let { "photoDataUrl" to it })
                val action = when (kind) { "yarn" -> "addYarn"; "fabric" -> "addFabric"; "notion" -> "addNotion"; else -> "addTool" }
                page.submit(action = action, fields = fields, files = files, onError = { code ->
                    toast(when (code) {
                        "photoFormat" -> t("stash.errPhotoFormat")
                        "notionName" -> t("stash.errNotionName")
                        "toolType" -> t("stash.errToolType")
                        else -> t("stash.errGeneric")
                    })
                }) { if (it.ok) onDone() }
            } finally {
                busy = false
            }
        }
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = barcodeShot, enabled = !busy) { Text("📦 " + tr("stash.scanBarcode"), maxLines = 1) }
            if (ai && (kind == "yarn" || kind == "fabric")) OutlinedButton(onClick = labelShot, enabled = !busy) {
                Text("📷 " + tr("stash.scanLabel"), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        TextButton(onClick = { urlOpen = !urlOpen }) { Text("🔗 " + tr("stash.importUrl")) }
        if (urlOpen) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(url, { url = it }, placeholder = { Text(tr("stash.importUrlPlaceholder")) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.weight(1f))
            Button(onClick = { lookup("/api/ai/lookup-url", JsonObject().apply { addProperty("url", url.trim()); addProperty("kind", kind) }) },
                enabled = url.isNotBlank() && !busy) { Text(tr("stash.importUrlSubmit")) }
        }
        if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
        msg?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary) }

        @Composable fun field(key: String, label: String, placeholder: String? = null) =
            OutlinedTextField(f[key].orEmpty(), { f[key] = it }, label = { Text(label) }, placeholder = placeholder?.let { { Text(it) } },
                singleLine = true, modifier = Modifier.fillMaxWidth())
        @Composable fun number(key: String, label: String, decimal: Boolean = false) =
            NumberField(f[key].orEmpty(), { f[key] = it }, label, Modifier.fillMaxWidth(), decimal = decimal)
        @Composable fun color(key: String, label: String) = ColorPickerRow(label, f[key].orEmpty()) { f[key] = it }
        @Composable fun motif(key: String, label: String) = SelectField(label, f[key].orEmpty(),
            listOf("" to tr("stash.optionNone")) + MOTIFS.map { it to tr("motif.$it") }, { f[key] = it }, Modifier.fillMaxWidth())

        when (kind) {
            "yarn" -> {
                field("brand", tr("stash.yarn.brand"))
                field("name", tr("stash.yarn.name"))
                field("colorway", tr("stash.yarn.colorway"))
                color("colorHex", tr("stash.yarn.color"))
                field("dyeLot", tr("stash.yarn.dyeLot"))
                SelectField(tr("stash.yarn.weight"), f["weightCategory"].orEmpty(), listOf("" to tr("stash.optionNone")) + YARN_WEIGHTS.map { it to it },
                    { f["weightCategory"] = it }, Modifier.fillMaxWidth())
                field("fiber", tr("stash.yarn.fiber"), tr("stash.yarn.fiberPlaceholder"))
                motif("motif", tr("stash.yarn.motif"))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f)) { number("yardsPerSkein", tr("stash.yarn.yardsPerSkein")) }
                    Box(Modifier.weight(1f)) { number("skeins", tr("stash.yarn.skeins"), decimal = true) }
                }
                field("notes", tr("stash.yarn.notes"))
            }
            "fabric" -> {
                field("name", tr("stash.fabric.name"))
                field("fabricType", tr("stash.fabric.type"), tr("stash.fabric.typePlaceholder"))
                color("colorHex", tr("stash.fabric.color"))
                field("composition", tr("stash.fabric.composition"))
                motif("motif", tr("stash.fabric.motif"))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f)) { number("lengthCm", tr("stash.fabric.length")) }
                    Box(Modifier.weight(1f)) { number("widthCm", tr("stash.fabric.width")) }
                }
            }
            "notion" -> {
                field("name", tr("stash.notion.name"))
                field("category", tr("stash.notion.category"), tr("stash.notion.categoryPlaceholder"))
                number("quantity", tr("stash.notion.quantity"))
            }
            else -> {
                SelectField(tr("stash.tool.type"), f["type"].orEmpty(), TOOL_TYPES.map { it to tr("tool.$it") }, { f["type"] = it }, Modifier.fillMaxWidth())
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.weight(1f)) { number("sizeMm", tr("stash.tool.size"), decimal = true) }
                    Box(Modifier.weight(1f)) { number("lengthCm", tr("stash.tool.cable")) }
                }
                number("quantity", tr("stash.tool.quantity"))
            }
        }

        Text(tr("stash.yarn.photo"), style = MaterialTheme.typography.labelLarge)
        val preview = photoDataUrl?.let { dataUrlBitmap(it) }
        when {
            photo != null -> coil.compose.AsyncImage(photo, null, Modifier.size(120.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
            preview != null -> Image(preview.asImageBitmap(), null, Modifier.size(120.dp).clip(RoundedCornerShape(8.dp)), contentScale = ContentScale.Crop)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { pickPhoto(arrayOf("image/*")) }) { Text(tr("app.choosePhoto")) }
            OutlinedButton(onClick = takePhoto) { Text(tr("app.takePhoto")) }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onDone) { Text(tr("stash.close")) }
            Button(onClick = { submit() }, enabled = !busy, modifier = Modifier.weight(1f)) {
                Text(when (kind) {
                    "yarn" -> tr("stash.yarn.submit"); "fabric" -> tr("stash.fabric.submit"); "notion" -> tr("stash.notion.submit")
                    else -> tr("stash.tool.submit")
                })
            }
        }
        Spacer(Modifier.height(40.dp))
    }
}

private fun FilePart.copyAs(field: String) = FilePart(field, name, mime, bytes)

private fun dataUrlBytes(dataUrl: String): Pair<String, ByteArray>? {
    val m = Regex("^data:([^;]+);base64,(.*)$", RegexOption.DOT_MATCHES_ALL).find(dataUrl) ?: return null
    return try { m.groupValues[1] to Base64.decode(m.groupValues[2], Base64.DEFAULT) } catch (e: Exception) { null }
}

private fun dataUrlPart(dataUrl: String): FilePart? = dataUrlBytes(dataUrl)?.let { (mime, bytes) -> FilePart("file", "photo.jpg", mime, bytes) }

private fun dataUrlBitmap(dataUrl: String): android.graphics.Bitmap? =
    dataUrlBytes(dataUrl)?.let { (_, bytes) -> android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size) }

/** Lit un code-barres sur une photo (ML Kit, sur le téléphone). */
private suspend fun readBarcode(context: Context, uri: Uri): String? = suspendCancellableCoroutine { cont ->
    try {
        val image = InputImage.fromFilePath(context, uri)
        BarcodeScanning.getClient().process(image)
            .addOnSuccessListener { codes -> cont.resume(codes.firstNotNullOfOrNull { it.rawValue }) }
            .addOnFailureListener { cont.resume(null) }
    } catch (e: Exception) {
        cont.resume(null)
    }
}

/** Couleur : pastilles rapides + saisie hexadécimale. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ColorPickerRow(label: String, value: String, onChange: (String) -> Unit) {
    val quick = listOf("#e63946", "#ffa500", "#ffd60a", "#2a9d8f", "#1d3557", "#8a2be2", "#ffc0cb", "#8b4513",
        "#f5f5dc", "#f0e6d2", "#ffffff", "#808080", "#000000", "#800020", "#78866b", "#40e0d0")
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Box(Modifier.size(36.dp).clip(CircleShape).background(hexColor(value.ifBlank { null }, MaterialTheme.colorScheme.surfaceVariant))
                .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape))
            OutlinedTextField(value, { v -> onChange(v.trim().let { if (it.isNotEmpty() && !it.startsWith("#")) "#$it" else it }.take(7)) },
                label = { Text(label) }, placeholder = { Text("#rrggbb") }, singleLine = true, modifier = Modifier.weight(1f))
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            quick.forEach { hex ->
                Box(Modifier.size(28.dp).clip(CircleShape).background(hexColor(hex))
                    .border(if (value.equals(hex, true)) 3.dp else 1.dp, MaterialTheme.colorScheme.outline, CircleShape)
                    .clickable { onChange(hex) })
            }
        }
    }
}
