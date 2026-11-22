package app.tricouture.ui.screens.patterns

import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.Routes
import app.tricouture.ui.components.*
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

/** Champs du formulaire de patron (création et modification). */
private class PatternFields(p: JsonObject?, craft: String) {
    var title by mutableStateOf(p?.str("title").orEmpty())
    var craft by mutableStateOf(p?.str("craft") ?: craft.ifEmpty { "tricot" })
    var garmentType by mutableStateOf(p?.str("garmentType").orEmpty())
    var designer by mutableStateOf(p?.str("designer").orEmpty())
    var source by mutableStateOf(p?.str("source").orEmpty())
    var difficulty by mutableStateOf(p?.int("difficulty")?.toString().orEmpty())
    var language by mutableStateOf(p?.str("language").orEmpty())
    var sizes by mutableStateOf(p?.str("sizes").orEmpty())
    var yardage by mutableStateOf(p?.int("yardageRequired")?.toString().orEmpty())
    var gaugeStitches by mutableStateOf(p?.double("gaugeStitches")?.let(::num).orEmpty())
    var gaugeRows by mutableStateOf(p?.double("gaugeRows")?.let(::num).orEmpty())
    var tags by mutableStateOf(p?.strs("tags")?.joinToString(", ").orEmpty())
    var notes by mutableStateOf(p?.str("notes").orEmpty())
    var aiLanguage by mutableStateOf(Session.locale.value)
    var coverUrl by mutableStateOf("")

    fun fields() = listOf(
        "title" to title, "craft" to craft, "garmentType" to garmentType, "designer" to designer, "source" to source,
        "difficulty" to difficulty, "language" to language, "sizes" to sizes, "yardageRequired" to yardage,
        "gaugeStitches" to gaugeStitches, "gaugeRows" to gaugeRows, "tags" to tags, "notes" to notes,
    )
}

/** Nouveau patron (`id` null) ou modification d'un patron existant. */
@Composable
fun PatternFormScreen(id: String?, presetCraft: String = "", presetUrl: String = "") {
    val nav = LocalNav.current
    val page = if (id != null) rememberPage("/patterns/$id/edit") else null
    val title = if (id == null) tr("patterns.new.title") else tr("patterns.detail.edit").removePrefix("✏️ ")
    Screen(title, onBack = { nav.popBackStack() }) { padding ->
        if (page == null) {
            PatternForm(null, null, presetCraft, presetUrl, Modifier.padding(padding))
        } else {
            PageBody(page, Modifier.padding(padding)) { d -> PatternForm(id, d.obj("pattern"), "", "", Modifier) }
        }
    }
}

@Composable
private fun PatternForm(id: String?, p: JsonObject?, presetCraft: String, presetUrl: String, modifier: Modifier) {
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val toast = rememberToast()
    val f = remember(p) { PatternFields(p, presetCraft).also { if (presetUrl.isNotBlank()) it.source = presetUrl } }
    var files by remember { mutableStateOf<List<Uri>>(emptyList()) }
    var saving by remember { mutableStateOf(false) }
    var fetching by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val pick = rememberMultiFilePicker { files = files + it }
    val ai by Session.ai.collectAsState()

    fun fillFromLink() {
        val url = f.source.trim().takeIf { it.isNotEmpty() } ?: return
        fetching = true
        scope.launch {
            try {
                val meta = Session.kit.api("POST", "/api/patterns/from-url", JsonObject().apply { addProperty("url", url) }).objOrNull()
                if (meta != null) {
                    if (f.title.isBlank()) meta.str("title")?.let { f.title = it }
                    if (f.designer.isBlank()) meta.str("designer")?.let { f.designer = it }
                    meta.str("source")?.let { f.source = it }
                    if (meta.str("title") == null && meta.str("designer") == null) toast(t("patterns.new.fetchEmpty"))
                }
            } catch (e: Exception) {
                toast(t("patterns.new.fetchFailed"))
            } finally {
                fetching = false
            }
        }
    }
    // Lien reçu par « Partager » : on lit aussitôt le titre et l'auteur.
    LaunchedEffect(presetUrl) { if (presetUrl.startsWith("http")) fillFromLink() }

    fun save() {
        if (f.title.isBlank()) { error = t("patterns.new.error.missingFields"); return }
        saving = true
        error = null
        scope.launch {
            try {
                val parts = files.map { readPicked(context, it, "files") }
                val extra = if (id == null) listOf("aiLanguage" to f.aiLanguage, "coverUrl" to f.coverUrl) else emptyList()
                val res = Session.kit.action(if (id == null) "/patterns/new" else "/patterns/$id/edit", null, f.fields() + extra, parts)
                when (res) {
                    is ActionResult.Failure -> error = res.error
                    is ActionResult.Redirect -> {
                        val target = Routes.fromSitePath(res.location)
                        nav.popBackStack()
                        // Nouveau patron : on ouvre sa fiche. Modification : la fiche se recharge en revenant.
                        if (id == null && target != null) nav.navigate(target)
                    }
                    is ActionResult.Success -> nav.popBackStack()
                }
            } catch (e: Exception) {
                error = e.message
            } finally {
                saving = false
            }
        }
    }

    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        OutlinedTextField(f.title, { f.title = it }, label = { Text(tr("patterns.new.titleLabel")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        SelectField(tr("patterns.new.typeLabel"), f.craft, CRAFTS.map { it to craftLabel(it) }, { f.craft = it }, Modifier.fillMaxWidth())
        OutlinedTextField(f.garmentType, { f.garmentType = it }, label = { Text(tr("patterns.new.garmentTypeLabel")) },
            placeholder = { Text(tr("patterns.new.garmentTypePlaceholder")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(f.designer, { f.designer = it }, label = { Text(tr("patterns.new.designerLabel")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(f.source, { f.source = it }, label = { Text(tr("patterns.new.sourceLabel")) },
                placeholder = { Text(tr("patterns.new.sourcePlaceholder")) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.weight(1f))
            OutlinedButton(onClick = { fillFromLink() }, enabled = !fetching && f.source.startsWith("http")) {
                Text(if (fetching) tr("patterns.new.fetching") else tr("patterns.new.fetchFromLink"))
            }
        }
        SelectField(tr("patterns.new.difficultyLabel"), f.difficulty,
            listOf("" to "—") + (1..5).map { it.toString() to difficultyLabel(it) }, { f.difficulty = it }, Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(f.language, { f.language = it }, label = { Text(tr("patterns.new.languageLabel")) },
                placeholder = { Text(tr("patterns.new.languagePlaceholder")) }, singleLine = true, modifier = Modifier.weight(1f))
            NumberField(f.yardage, { f.yardage = it }, tr("patterns.new.yardageLabel"), Modifier.weight(1f))
        }
        OutlinedTextField(f.sizes, { f.sizes = it }, label = { Text(tr("patterns.new.sizesLabel")) },
            placeholder = { Text(tr("patterns.new.sizesPlaceholder")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberField(f.gaugeStitches, { f.gaugeStitches = it }, tr("patterns.new.gaugeStitchesLabel"), Modifier.weight(1f))
            NumberField(f.gaugeRows, { f.gaugeRows = it }, tr("patterns.new.gaugeRowsLabel"), Modifier.weight(1f))
        }
        OutlinedTextField(f.tags, { f.tags = it }, label = { Text(tr("patterns.new.tagsLabel")) },
            placeholder = { Text(tr("patterns.new.tagsPlaceholder")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(f.notes, { f.notes = it }, label = { Text(tr("patterns.new.notesLabel")) }, minLines = 3, modifier = Modifier.fillMaxWidth())

        Text(tr("patterns.new.filesLabel"), style = MaterialTheme.typography.labelLarge)
        files.forEach { uri ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.AttachFile, null)
                Text(uri.lastPathSegment?.substringAfterLast('/') ?: uri.toString(), Modifier.weight(1f).padding(start = 6.dp), maxLines = 1)
                IconButton(onClick = { files = files - uri }) { Icon(Icons.Default.Close, null) }
            }
        }
        OutlinedButton(onClick = { pick(arrayOf("application/pdf", "image/*")) }) { Text(tr("app.pickFile")) }
        Text(tr("patterns.new.filesHint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        if (id == null) {
            if (ai) {
                SelectField(tr("patterns.new.aiLanguageLabel"), f.aiLanguage, listOf("fr" to "Français", "en" to "English"),
                    { f.aiLanguage = it }, Modifier.fillMaxWidth())
                Text(tr("patterns.new.aiLanguageHint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            OutlinedTextField(f.coverUrl, { f.coverUrl = it }, label = { Text(tr("patterns.new.coverUrlLabel")) },
                placeholder = { Text("https://…") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri), modifier = Modifier.fillMaxWidth())
            Text(tr("patterns.new.coverUrlHint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = { save() }, enabled = !saving, modifier = Modifier.fillMaxWidth().height(48.dp)) {
            if (saving) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text(tr("app.save"))
        }
        Spacer(Modifier.height(24.dp))
    }
}

/** Champ numérique (chiffres et séparateur décimal). */
@Composable
fun NumberField(value: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier, decimal: Boolean = false) {
    OutlinedTextField(
        value,
        { v -> onChange(v.filter { it.isDigit() || (decimal && (it == '.' || it == ',')) }.replace(',', '.')) },
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number),
        modifier = modifier,
    )
}
