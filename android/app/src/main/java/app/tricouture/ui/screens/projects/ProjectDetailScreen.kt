package app.tricouture.ui.screens.projects

import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import app.tricouture.ui.screens.patterns.NumberField
import com.google.gson.JsonObject
import kotlinx.coroutines.launch
import java.util.Locale

/** Fiche projet : compteur de rangs, rythme, pièces, détails, matières, photos, partage. */
@Composable
fun ProjectDetailScreen(id: String) {
    val nav = LocalNav.current
    val page = rememberPage("/projects/$id")
    val data by page.data.collectAsState()
    val ai by Session.ai.collectAsState()
    val toast = rememberToast()
    var confirmDelete by remember { mutableStateOf(false) }
    val p = data?.obj("project")
    val access = data?.str("access")
    val isOwner = access == "owner"
    val readOnly = access == "view"

    Screen(
        p?.str("title") ?: tr("nav.projects"),
        onBack = { nav.popBackStack() },
        actions = {
            if (p != null && ai) IconButton(onClick = {
                nav.navigate("assistant?kind=project&id=$id&title=" + Uri.encode(p.str("title").orEmpty()))
            }) { Icon(Icons.Default.AutoAwesome, tr("chat.ask")) }
            if (p != null && isOwner) IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Default.Delete, tr("app.delete")) }
        },
    ) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val proj = d.obj("project") ?: return@PageBody
            // Rappel 3 jours avant l'échéance (comme le site dans l'appli).
            val ctx = LocalContext.current
            LaunchedEffect(proj.str("deadline"), proj.str("status")) {
                Reminders.syncDeadline(ctx, id, proj.str("title").orEmpty(), proj.str("deadline"), proj.str("status") == "fini")
            }
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp, 8.dp, 16.dp, 32.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                if (!isOwner) Text(
                    tr("projects.share.sharedWithMe") + if (readOnly) " — " + tr("projects.share.readOnly") else "",
                    color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium,
                )
                d.obj("pattern")?.let { pat ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("projects.detail.patternLabel") + " ", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(pat.str("title").orEmpty(), color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable { nav.navigate("pattern/${pat.str("id")}") })
                    }
                }
                // La couture avance par pièces (à couper, cousue…), pas par rangs.
                if (d.obj("pattern")?.str("craft") != "couture") Counter(page, proj, readOnly, toast)
                Pace(page, proj, d, readOnly, toast)
                if (d.obj("pattern") != null && d.objs("pieces").isNotEmpty()) Pieces(page, d, readOnly, toast)
                if (!readOnly) Details(page, proj, toast)
                Materials(page, d, readOnly, toast)
                Photos(page, proj, d, readOnly, toast)
                if (isOwner) Sharing(page, d, toast)
            }
        }
    }
    if (confirmDelete) ConfirmDialog(tr("projects.detail.confirmDelete"), onConfirm = {
        page.submit(action = "delete", onError = toast) { if (it.ok) nav.popBackStack() }
    }, onDismiss = { confirmDelete = false })
}

@Composable
fun SectionCard(title: String, content: @Composable ColumnScope.() -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            content()
        }
    }
}

@Composable
private fun Counter(page: PageModel, p: JsonObject, readOnly: Boolean, toast: (String) -> Unit) {
    var heard by remember { mutableStateOf<String?>(null) }
    fun step(delta: Int) {
        // Affichage immédiat, le site confirme ensuite.
        page.patch { d ->
            d.obj("project")?.let { pr ->
                val row = ((pr.int("currentRow") ?: 0) + delta).coerceAtLeast(0)
                pr.addProperty("currentRow", row)
                val total = pr.int("totalRows")
                if (total != null && total > 0) pr.addProperty("progressPct", (row * 100 / total).coerceIn(0, 100))
            }
        }
        page.submit(action = "row", fields = listOf("delta" to delta.toString()), onError = toast)
    }
    val speech = rememberSpeech { text ->
        val t0 = text.lowercase(Locale.ROOT)
        heard = if (t0.isBlank()) t("projects.detail.heardNothing") else t("projects.detail.heardQuote", "text" to t0)
        if (Regex("""suivant|plus un|rang|incr|\bun\b|\+|next|plus one|row""").containsMatchIn(t0)) step(1)
    }
    SectionCard(tr("projects.detail.counterTitle")) {
        val current = p.int("currentRow") ?: 0
        val total = p.int("totalRows")
        Text(
            "$current" + if (total != null && total > 0) " / $total" else "",
            fontSize = 56.sp, fontWeight = FontWeight.Bold, modifier = Modifier.align(Alignment.CenterHorizontally),
        )
        val pct = p.int("progressPct") ?: 0
        LinearProgressIndicator(progress = { pct / 100f }, Modifier.fillMaxWidth().height(8.dp).clip(RoundedCornerShape(4.dp)))
        if (!readOnly) Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = { step(-1) }, modifier = Modifier.weight(1f).height(64.dp)) { Text("−", fontSize = 28.sp) }
            Button(onClick = { step(1) }, modifier = Modifier.weight(2f).height(64.dp)) {
                Text(tr("projects.detail.addRow"), fontSize = 22.sp)
            }
        }
        if (!readOnly) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = speech) { Text(tr("projects.detail.micStart")) }
            val nav = LocalNav.current
            FilledTonalButton(onClick = { nav.navigate("project/${p.str("id")}/focus") }) { Text(tr("app.focus.open")) }
        }
        heard?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        Text(tr("projects.detail.percentDone", "n" to pct), style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Pace(page: PageModel, p: JsonObject, d: JsonObject, readOnly: Boolean, toast: (String) -> Unit) {
    var rows by remember { mutableStateOf("") }
    var minutes by remember { mutableStateOf("") }
    SectionCard(tr("projects.detail.paceTitle")) {
        fun hours(h: Double?): String = when {
            h == null -> "—"
            h < 1 -> t("projects.detail.minutesShort", "n" to Math.round(h * 60))
            else -> t("projects.detail.hoursShort", "n" to String.format(Locale.ROOT, "%.1f", h))
        }
        val spent = p.int("timeSpentMinutes") ?: 0
        val facts = buildList {
            add(tr("projects.detail.speed") to (d.double("rowsPerHour")?.let { t("projects.detail.rowsPerHour", "n" to String.format(Locale.ROOT, "%.1f", it)) }
                ?: tr("projects.detail.noDataYet")))
            add(tr("projects.detail.rowsRemaining") to (d.int("remaining")?.toString() ?: "—"))
            add(tr("projects.detail.timeRemaining") to hours(d.double("hoursLeft")))
            add(tr("projects.detail.timeSpent") to tr("projects.detail.timeSpentValue", "h" to spent / 60, "m" to spent % 60))
            p.str("deadline")?.let { add(tr("projects.detail.deadline") to formatDeadline(it)) }
        }
        facts.forEach { (k, v) ->
            Row {
                Text(k, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
                Text(v, style = MaterialTheme.typography.bodyMedium)
            }
        }
        if (!readOnly) Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            NumberField(rows, { rows = it }, tr("projects.detail.rowsDonePlaceholder"), Modifier.weight(1f))
            NumberField(minutes, { minutes = it }, tr("projects.detail.minutesPlaceholder"), Modifier.weight(1f))
        }
        if (!readOnly) Button(onClick = {
            page.submit(action = "logPace", fields = listOf("rowsDone" to rows, "minutes" to minutes), onError = toast) {
                if (it.ok) { rows = ""; minutes = ""; toast(t("app.saved")) }
            }
        }, enabled = rows.isNotBlank() && minutes.isNotBlank()) { Text(tr("projects.detail.logSession")) }
    }
}

@Composable
private fun Pieces(page: PageModel, d: JsonObject, readOnly: Boolean, toast: (String) -> Unit) {
    val craft = d.obj("pattern")?.str("craft")
    val pieces = d.objs("pieces")
    SectionCard(tr("projects.detail.piecesTitle")) {
        pieces.forEach { piece ->
            val pid = piece.str("id").orEmpty()
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                when {
                    craft == "couture" -> {
                        Text(piece.str("name").orEmpty() + (piece.int("quantity")?.let { " ×$it" } ?: ""), Modifier.weight(1f))
                        SelectField("", piece.str("status") ?: "a_couper", PIECE_STATUSES.map { it to pieceStatusLabel(it) }, { s ->
                            if (!readOnly) page.submit(action = "setPieceStatus", fields = listOf("pieceId" to pid, "status" to s), onError = toast)
                        }, Modifier.width(170.dp))
                    }
                    (piece.int("totalRows") ?: 0) > 0 -> {
                        Text(piece.str("name").orEmpty(), Modifier.weight(1f))
                        IconButton(onClick = {
                            page.submit(action = "setPieceRow", fields = listOf("pieceId" to pid, "delta" to "-1"), onError = toast)
                        }, enabled = !readOnly) { Icon(Icons.Default.Remove, null) }
                        Text("${piece.int("currentRow") ?: 0} / ${piece.int("totalRows")}", style = MaterialTheme.typography.bodyMedium)
                        IconButton(onClick = {
                            page.submit(action = "setPieceRow", fields = listOf("pieceId" to pid, "delta" to "1"), onError = toast)
                        }, enabled = !readOnly) { Icon(Icons.Default.Add, null) }
                    }
                    else -> {
                        Checkbox(piece.bool("completed"), { c ->
                            page.submit(action = "togglePiece", fields = listOf("pieceId" to pid, "completed" to c.toString()), onError = toast)
                        }, enabled = !readOnly)
                        Text(piece.str("name").orEmpty(), Modifier.weight(1f))
                        if (!readOnly) {
                            var target by remember(pid) { mutableStateOf("") }
                            OutlinedTextField(target, { v -> target = v.filter { it.isDigit() } },
                                placeholder = { Text(tr("projects.detail.pieceRowsPlaceholder")) }, singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.width(90.dp))
                            if (target.isNotEmpty()) IconButton(onClick = {
                                page.submit(action = "setPieceTotalRows", fields = listOf("pieceId" to pid, "totalRows" to target), onError = toast)
                            }) { Icon(Icons.Default.Check, null) }
                        }
                    }
                }
            }
        }
        Text(tr("projects.detail.piecesDone", "done" to pieces.count { it.bool("completed") }, "total" to pieces.size),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun Details(page: PageModel, p: JsonObject, toast: (String) -> Unit) {
    val key = p.str("updatedAt")
    var status by remember(key) { mutableStateOf(p.str("status") ?: "idee") }
    var progress by remember(key) { mutableStateOf((p.int("progressPct") ?: 0).toString()) }
    var totalRows by remember(key) { mutableStateOf(p.int("totalRows")?.toString().orEmpty()) }
    var deadline by remember(key) { mutableStateOf(p.str("deadline").orEmpty()) }
    var cost by remember(key) { mutableStateOf(String.format(Locale.ROOT, "%.2f", (p.long("costCents") ?: 0) / 100.0)) }
    var retail by remember(key) { mutableStateOf(p.long("retailPriceCents")?.let { String.format(Locale.ROOT, "%.2f", it / 100.0) }.orEmpty()) }
    var location by remember(key) { mutableStateOf(p.str("location").orEmpty()) }
    var notes by remember(key) { mutableStateOf(p.str("notes").orEmpty()) }
    SectionCard(tr("projects.detail.detailsTitle")) {
        SelectField(tr("projects.detail.column"), status, PROJECT_STATUSES.map { it to statusLabel(it) }, { status = it }, Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberField(progress, { progress = it }, tr("projects.detail.progress"), Modifier.weight(1f))
            NumberField(totalRows, { totalRows = it }, tr("projects.detail.totalRows"), Modifier.weight(1f))
        }
        DateField(tr("projects.detail.deadline"), deadline, { deadline = it }, Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            NumberField(cost, { cost = it }, tr("projects.detail.cost"), Modifier.weight(1f), decimal = true)
            NumberField(retail, { retail = it }, tr("projects.detail.retail"), Modifier.weight(1f), decimal = true)
        }
        val savings = retail.toDoubleOrNull()?.let { r -> r - (cost.toDoubleOrNull() ?: 0.0) }
        if (savings != null) Text(tr("projects.detail.savingsLabel") + " " + String.format(Locale.FRANCE, "%.2f €", savings),
            style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
        OutlinedTextField(location, { location = it }, label = { Text(tr("projects.detail.location")) }, singleLine = true,
            modifier = Modifier.fillMaxWidth())
        OutlinedTextField(notes, { notes = it }, label = { Text(tr("projects.detail.notes")) }, minLines = 3, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            page.submit(action = "update", fields = listOf(
                "status" to status, "progressPct" to progress, "totalRows" to totalRows, "deadline" to deadline,
                "cost" to cost, "retail" to retail, "location" to location, "notes" to notes,
                "timeSpentMinutes" to (p.int("timeSpentMinutes") ?: 0).toString(),
            ), onError = toast) { if (it.ok) toast(t("app.saved")) }
        }) { Text(tr("projects.detail.save")) }
    }
}

@Composable
private fun Materials(page: PageModel, d: JsonObject, readOnly: Boolean, toast: (String) -> Unit) {
    val nav = LocalNav.current
    SectionCard(tr("projects.detail.materialsTitle")) {
        Text(tr("projects.detail.materialsHint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

        Text(tr("projects.detail.yarnSectionTitle"), style = MaterialTheme.typography.titleSmall)
        val usedYarns = d.objs("usedYarns")
        if (usedYarns.isEmpty()) Text(tr("projects.detail.noYarnUsed"), style = MaterialTheme.typography.bodySmall)
        usedYarns.forEach { u ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                val name = listOfNotNull(u.str("brand"), u.str("name"), u.str("colorway")).joinToString(" ").ifBlank { tr("projects.detail.deletedYarn") }
                Text("$name — " + tr("projects.detail.skeinsAmount", "n" to num(u.double("skeinsUsed"))), Modifier.weight(1f))
                if (!readOnly) IconButton(onClick = {
                    page.submit(action = "undoYarnUse", fields = listOf("id" to u.str("id").orEmpty()), onError = toast)
                }) { Icon(Icons.Default.Undo, tr("projects.detail.undoUse")) }
            }
        }
        val yarnStash = d.objs("yarnStash")
        if (!readOnly) {
            if (yarnStash.isEmpty()) TextButton(onClick = { nav.navigate("stash") }) {
                Text(tr("projects.detail.noYarnsInStash") + " " + tr("projects.detail.goToStash"))
            } else UseMaterial(
                tr("projects.detail.selectYarn"),
                yarnStash.map { y ->
                    y.str("id").orEmpty() to listOfNotNull(y.str("brand"), y.str("name"), y.str("colorway")).joinToString(" ") +
                        " (" + t("projects.detail.stashRemainingSkeins", "n" to num(y.double("skeins"))) + ")"
                },
                tr("projects.detail.skeinsUsedPlaceholder"), decimal = true,
            ) { id, amount -> page.submit(action = "useYarn", fields = listOf("yarnId" to id, "skeinsUsed" to amount), onError = toast) }
        }

        Text(tr("projects.detail.fabricSectionTitle"), style = MaterialTheme.typography.titleSmall)
        val usedFabrics = d.objs("usedFabrics")
        if (usedFabrics.isEmpty()) Text(tr("projects.detail.noFabricUsed"), style = MaterialTheme.typography.bodySmall)
        usedFabrics.forEach { u ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                val name = listOfNotNull(u.str("name"), u.str("fabricType")).joinToString(" ").ifBlank { tr("projects.detail.deletedFabric") }
                Text("$name — " + tr("projects.detail.lengthAmount", "n" to (u.int("lengthUsedCm") ?: 0)), Modifier.weight(1f))
                if (!readOnly) IconButton(onClick = {
                    page.submit(action = "undoFabricUse", fields = listOf("id" to u.str("id").orEmpty()), onError = toast)
                }) { Icon(Icons.Default.Undo, tr("projects.detail.undoUse")) }
            }
        }
        val fabricStash = d.objs("fabricStash")
        if (!readOnly) {
            if (fabricStash.isEmpty()) TextButton(onClick = { nav.navigate("stash") }) {
                Text(tr("projects.detail.noFabricsInStash") + " " + tr("projects.detail.goToStash"))
            } else UseMaterial(
                tr("projects.detail.selectFabric"),
                fabricStash.map { f ->
                    f.str("id").orEmpty() to listOfNotNull(f.str("name"), f.str("fabricType")).joinToString(" ") +
                        " (" + t("projects.detail.stashRemainingCm", "n" to (f.int("lengthCm") ?: 0)) + ")"
                },
                tr("projects.detail.lengthUsedPlaceholder"), decimal = false,
            ) { id, amount -> page.submit(action = "useFabric", fields = listOf("fabricId" to id, "lengthUsedCm" to amount), onError = toast) }
        }
    }
}

private fun num(v: Double?): String = when {
    v == null -> "0"
    v == Math.floor(v) -> v.toLong().toString()
    else -> v.toString()
}

@Composable
private fun UseMaterial(placeholder: String, options: List<Pair<String, String>>, amountLabel: String, decimal: Boolean, onUse: (String, String) -> Unit) {
    var choice by remember { mutableStateOf("") }
    var amount by remember { mutableStateOf("") }
    SelectField(placeholder, choice, options, { choice = it }, Modifier.fillMaxWidth())
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        NumberField(amount, { amount = it }, amountLabel, Modifier.weight(1f), decimal = decimal)
        Button(onClick = { onUse(choice, amount); amount = ""; choice = "" }, enabled = choice.isNotEmpty() && amount.isNotEmpty()) {
            Text(tr("projects.detail.useMaterial"))
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Photos(page: PageModel, p: JsonObject, d: JsonObject, readOnly: Boolean, toast: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var caption by remember { mutableStateOf("") }
    var viewing by remember { mutableStateOf<String?>(null) }
    fun upload(uris: List<Uri>) {
        scope.launch {
            try {
                val parts = uris.take(10).map { readPickedImage(context, it, "photos") }
                page.submit(action = "addPhoto", fields = listOf("caption" to caption), files = parts, onError = toast) {
                    if (it.ok) { caption = ""; toast(t("projects.photos.added")) }
                }
            } catch (e: Exception) {
                toast(e.message ?: "")
            }
        }
    }
    val pick = rememberMultiFilePicker { upload(it) }
    val camera = rememberCamera(context) { upload(listOf(it)) }
    SectionCard(tr("projects.photos.title")) {
        val photos = d.objs("photos")
        if (photos.isEmpty()) Text(tr("projects.photos.empty"), style = MaterialTheme.typography.bodySmall)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            photos.forEach { ph ->
                Box {
                    MediaImage(ph.str("storedPath"), Modifier.size(104.dp).clip(RoundedCornerShape(8.dp))
                        .clickable { viewing = ph.str("storedPath") }, width = 400)
                    if (!readOnly) IconButton(
                        onClick = { page.submit(action = "deletePhoto", fields = listOf("photoId" to ph.str("id").orEmpty()), onError = toast) },
                        modifier = Modifier.align(Alignment.TopEnd).size(32.dp),
                    ) {
                        Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f)) {
                            Icon(Icons.Default.Close, tr("projects.photos.delete"), Modifier.padding(4.dp))
                        }
                    }
                }
            }
        }
        if (!readOnly) {
            OutlinedTextField(caption, { caption = it }, placeholder = { Text(tr("projects.photos.captionPlaceholder")) }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { pick(arrayOf("image/*")) }) { Icon(Icons.Default.Image, null); Text(" " + tr("app.choosePhoto")) }
                OutlinedButton(onClick = camera) { Icon(Icons.Default.PhotoCamera, null); Text(" " + tr("app.takePhoto")) }
            }
            if (p.str("status") == "fini") Text(tr("projects.photos.galleryHint"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
    viewing?.let { path -> PhotoViewer(path) { viewing = null } }
}

/** Photo en grand, par-dessus l'écran. */
@Composable
fun PhotoViewer(path: String, onClose: () -> Unit) {
    androidx.compose.ui.window.Dialog(onDismissRequest = onClose, properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().clickable(onClick = onClose), contentAlignment = Alignment.Center) {
            MediaImage(path, Modifier.fillMaxWidth(), width = null, contentScale = androidx.compose.ui.layout.ContentScale.Fit)
        }
    }
}

@Composable
private fun Sharing(page: PageModel, d: JsonObject, toast: (String) -> Unit) {
    var who by remember { mutableStateOf("") }
    var role by remember { mutableStateOf("view") }
    SectionCard(tr("projects.share.title")) {
        val shared = d.objs("sharedWith")
        if (shared.isEmpty()) Text(tr("projects.share.none"), style = MaterialTheme.typography.bodySmall)
        shared.forEach { s ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(s.str("displayName").orEmpty())
                    Text((s.str("email").orEmpty()) + " · " + if (s.str("role") == "edit") tr("projects.share.roleEdit") else tr("projects.share.roleView"),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                TextButton(onClick = { page.submit(action = "unshare", fields = listOf("userId" to s.str("userId").orEmpty()), onError = toast) }) {
                    Text(tr("projects.share.revoke"))
                }
            }
        }
        val people = d.objs("people")
        if (people.isEmpty()) Text(tr("projects.share.noAccounts"), style = MaterialTheme.typography.bodySmall)
        else {
            SelectField(tr("projects.share.with"), who, people.map { it.str("id").orEmpty() to (it.str("displayName") ?: it.str("email").orEmpty()) },
                { who = it }, Modifier.fillMaxWidth())
            SelectField(tr("projects.share.role"), role, listOf("view" to tr("projects.share.roleView"), "edit" to tr("projects.share.roleEdit")),
                { role = it }, Modifier.fillMaxWidth())
            Button(onClick = {
                page.submit(action = "share", fields = listOf("userId" to who, "role" to role), onError = toast) { if (it.ok) who = "" }
            }, enabled = who.isNotEmpty()) { Text(tr("projects.share.submit")) }
        }
    }
}
