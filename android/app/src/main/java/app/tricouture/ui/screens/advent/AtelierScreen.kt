package app.tricouture.ui.screens.advent

import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import app.tricouture.ui.screens.patterns.NumberField
import app.tricouture.ui.screens.projects.SectionCard
import app.tricouture.ui.screens.stash.ColorPickerRow
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

private val TODO_PHASES = listOf(
    "before" to listOf("yarn", "notions", "patterns", "import"),
    "prepare" to listOf("packs", "tags", "hints", "fill", "preview"),
    "during" to listOf("hide", "watch"),
)
private const val YARN_ROWS = 4

/** Atelier du lutin : préparer le calendrier, ses 24 portes et la liste de choses à faire. */
@Composable
fun AtelierScreen(calendarId: String = "") {
    val nav = LocalNav.current
    var selected by rememberSaveable { mutableStateOf(calendarId) }
    val page = rememberPage("/avent/atelier", mapOf("c" to selected))
    val toast = rememberToast()
    var openDay by rememberSaveable { mutableStateOf<Int?>(null) }
    Screen(tr("advent.workshop.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val cal = d.obj("calendar")
            val days = d.objs("days").associateBy { it.int("day") ?: 0 }
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                item { Text(tr("advent.workshop.subtitle"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                val calendars = d.objs("calendars")
                if (calendars.size > 1) item {
                    SelectField(tr("advent.ws.calTitle"), cal?.str("id").orEmpty(),
                        calendars.map { it.str("id").orEmpty() to "${it.str("year")} · ${it.str("title")} (${it.str("recipientName")})" },
                        { selected = it }, Modifier.fillMaxWidth())
                }
                if (d.bool("canCreate")) item { CreateCalendar(page, d, toast) { selected = it } }
                if (cal == null) return@LazyColumn
                item { CalendarSettings(page, cal, toast) }
                item {
                    Button(onClick = { nav.navigate("avent?preview=${cal.str("id")}&date=${cal.int("year")}-12-01") }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Default.Visibility, null); Text("  " + tr("advent.ws.preview"))
                    }
                }
                item { Checklist(page, cal, toast) }
                item { Text(tr("advent.ws.legend"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                items((1..24).toList()) { day ->
                    val row = days[day] ?: JsonObject()
                    DayCard(page, cal, d, day, row, openDay == day, { openDay = if (openDay == day) null else day }, toast)
                }
            }
        }
    }
}

@Composable
private fun CreateCalendar(page: PageModel, d: JsonObject, toast: (String) -> Unit, onCreated: (String) -> Unit) {
    var who by remember { mutableStateOf("") }
    var year by remember { mutableStateOf(java.time.LocalDate.now().year.toString()) }
    var title by remember { mutableStateOf("") }
    var open by remember { mutableStateOf(d.obj("calendar") == null) }
    if (!open) {
        TextButton(onClick = { open = true }) { Text("+ " + tr("advent.ws.new")) }
        return
    }
    SectionCard(tr("advent.ws.new")) {
        SelectField(tr("advent.ws.recipient"), who, d.objs("people").map { it.str("id").orEmpty() to it.str("displayName").orEmpty() }, { who = it }, Modifier.fillMaxWidth())
        NumberField(year, { year = it }, tr("advent.ws.year"), Modifier.fillMaxWidth())
        OutlinedTextField(title, { title = it }, label = { Text(tr("advent.ws.calTitle")) }, placeholder = { Text(tr("advent.ws.calTitlePh")) },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            page.submit(action = "create", fields = listOf("recipientId" to who, "year" to year, "title" to title), onError = toast) { res ->
                if (res is ActionResult.Redirect) Uri.parse("http://x" + res.location).getQueryParameter("c")?.let(onCreated)
            }
        }, enabled = who.isNotEmpty()) { Text(tr("advent.ws.create")) }
    }
}

@Composable
private fun CalendarSettings(page: PageModel, cal: JsonObject, toast: (String) -> Unit) {
    val key = cal.toString()
    var title by remember(key) { mutableStateOf(cal.str("title").orEmpty()) }
    var message by remember(key) { mutableStateOf(cal.str("message").orEmpty()) }
    var reveal by remember(key) { mutableStateOf(cal.bool("revealEarly")) }
    var notify by remember(key) { mutableStateOf(cal.str("notify") ?: "first") }
    var week by remember(key) { mutableStateOf(cal.str("notifyTimeWeek") ?: "08:00") }
    var weekend by remember(key) { mutableStateOf(cal.str("notifyTimeWeekend") ?: "09:00") }
    SectionCard("${cal.int("year")} · ${cal.str("title").orEmpty()}") {
        OutlinedTextField(title, { title = it }, label = { Text(tr("advent.ws.calTitle")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(message, { message = it }, label = { Text(tr("advent.ws.calMessage")) }, minLines = 2, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(tr("advent.ws.revealEarly"), Modifier.weight(1f))
            Switch(reveal, { reveal = it })
        }
        SelectField(tr("advent.ws.notify"), notify, listOf("off", "first", "daily").map { it to tr("advent.ws.notify.$it") }, { notify = it }, Modifier.fillMaxWidth())
        Text(tr("advent.ws.notifyHelp"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (notify != "off") Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(week, { week = it }, label = { Text(tr("advent.ws.notifyTimeWeek")) }, placeholder = { Text("08:00") }, singleLine = true, modifier = Modifier.weight(1f))
            OutlinedTextField(weekend, { weekend = it }, label = { Text(tr("advent.ws.notifyTimeWeekend")) }, placeholder = { Text("09:00") }, singleLine = true, modifier = Modifier.weight(1f))
        }
        Button(onClick = {
            page.submit(action = "saveCalendar", fields = listOfNotNull(
                "calendarId" to cal.str("id").orEmpty(), "title" to title, "message" to message,
                if (reveal) "revealEarly" to "on" else null,
                "notify" to notify, "notifyTimeWeek" to week, "notifyTimeWeekend" to weekend,
            ), onError = toast) { if (it.ok) toast(t("app.saved")) }
        }) { Text(tr("advent.ws.save")) }
    }
}

@Composable
private fun Checklist(page: PageModel, cal: JsonObject, toast: (String) -> Unit) {
    val done = cal.strs("todoDone").toSet()
    var text by remember { mutableStateOf("") }
    var open by rememberSaveable { mutableStateOf(false) }
    val total = TODO_PHASES.sumOf { it.second.size }
    SectionCard(tr("advent.todo.title")) {
        Row(Modifier.fillMaxWidth().clickable { open = !open }, verticalAlignment = Alignment.CenterVertically) {
            Text(tr("advent.todo.progress", "n" to done.size.coerceAtMost(total), "total" to total), Modifier.weight(1f))
            Icon(if (open) Icons.Default.ExpandLess else Icons.Default.ExpandMore, null)
        }
        if (!open) return@SectionCard
        TODO_PHASES.forEach { (phase, ids) ->
            Text(tr("advent.todo.phase.$phase"), style = MaterialTheme.typography.titleSmall)
            ids.forEach { id ->
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(id in done, { on ->
                        page.submit(action = "toggleTodo", fields = listOfNotNull("calendarId" to cal.str("id").orEmpty(), "id" to id,
                            if (on) "done" to "on" else null), onError = toast)
                    }, enabled = id != "fill")
                    Column(Modifier.padding(top = 12.dp)) {
                        Text(tr("advent.todo.$id"))
                        Text(tr("advent.todo.$id.note"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        val custom = cal.objs("todoCustom")
        if (custom.isNotEmpty()) {
            Text(tr("advent.todo.mine"), style = MaterialTheme.typography.titleSmall)
            custom.groupBy { it.str("group").orEmpty() }.forEach { (group, items) ->
                if (group.isNotBlank()) Text(group, style = MaterialTheme.typography.labelLarge)
                items.forEach { item ->
                    val id = item.str("id").orEmpty()
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(id in done, { on ->
                            page.submit(action = "toggleTodo", fields = listOfNotNull("calendarId" to cal.str("id").orEmpty(), "id" to id,
                                if (on) "done" to "on" else null), onError = toast)
                        })
                        Column(Modifier.weight(1f)) {
                            Text(item.str("title").orEmpty())
                            item.str("note")?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                        }
                        IconButton(onClick = {
                            page.submit(action = "deleteTodo", fields = listOf("calendarId" to cal.str("id").orEmpty(), "id" to id), onError = toast)
                        }) { Icon(Icons.Default.Delete, tr("advent.todo.delete")) }
                    }
                }
            }
        }
        Text(tr("advent.todo.addLabel"), style = MaterialTheme.typography.labelLarge)
        OutlinedTextField(text, { text = it }, placeholder = { Text(tr("advent.todo.addPh")) }, minLines = 3, modifier = Modifier.fillMaxWidth())
        Text(tr("advent.todo.addHelp"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Button(onClick = {
            page.submit(action = "addTodos", fields = listOf("calendarId" to cal.str("id").orEmpty(), "text" to text), onError = toast) { if (it.ok) text = "" }
        }, enabled = text.isNotBlank()) { Text(tr("advent.todo.addBtn")) }
    }
}

@Composable
private fun DayCard(
    page: PageModel, cal: JsonObject, d: JsonObject, day: Int, row: JsonObject,
    expanded: Boolean, onToggle: () -> Unit, toast: (String) -> Unit,
) {
    val ready = !row.str("code").isNullOrBlank() && (!row.str("hint").isNullOrBlank() || row.has("hintPhotoPath"))
    OutlinedCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().clickable(onClick = onToggle).padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text("$day", style = MaterialTheme.typography.titleLarge, modifier = Modifier.width(40.dp))
            Column(Modifier.weight(1f)) {
                Text((if (row.bool("isMain")) "✦ " else "") + (row.str("title") ?: tr("advent.ws.untitled")), style = MaterialTheme.typography.titleSmall)
                Text(
                    listOfNotNull(
                        if (row.str("code").isNullOrBlank()) tr("advent.ws.noCode") else null,
                        if (row.str("hint").isNullOrBlank() && !row.has("hintPhotoPath")) tr("advent.ws.noHint") else null,
                        if (row.str("patternId") == null) tr("advent.ws.noPattern") else null,
                        if (row.arr("yarns").size() == 0) tr("advent.ws.noYarn") else null,
                        row.str("openedAt")?.let { tr("advent.ws.openedOn", "date" to formatDate(it)) },
                    ).joinToString(" · ").ifEmpty { tr("advent.ws.ready") },
                    style = MaterialTheme.typography.bodySmall,
                    color = if (ready) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error,
                )
            }
            Icon(if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore, null)
        }
        if (expanded) DayEditor(page, cal, d, day, row, toast)
    }
}

@Composable
private fun DayEditor(page: PageModel, cal: JsonObject, d: JsonObject, day: Int, row: JsonObject, toast: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val key = row.toString()
    var title by remember(key) { mutableStateOf(row.str("title").orEmpty()) }
    var isMain by remember(key) { mutableStateOf(row.bool("isMain")) }
    var hint by remember(key) { mutableStateOf(row.str("hint").orEmpty()) }
    var code by remember(key) { mutableStateOf(row.str("code").orEmpty()) }
    var patternId by remember(key) { mutableStateOf(row.str("patternId").orEmpty()) }
    var message by remember(key) { mutableStateOf(row.str("message").orEmpty()) }
    var notifyTime by remember(key) { mutableStateOf(row.str("notifyTime").orEmpty()) }
    var removePhoto by remember(key) { mutableStateOf(false) }
    var photo by remember(key) { mutableStateOf<Uri?>(null) }
    val yarns = remember(key) {
        val list = row.objs("yarns")
        List(YARN_ROWS) { i -> mutableStateMapOf<String, String>().apply {
            list.getOrNull(i)?.let { y ->
                y.str("brand")?.let { put("brand", it) }; y.str("name")?.let { put("name", it) }
                y.str("colorway")?.let { put("colorway", it) }; y.str("colorHex")?.let { put("colorHex", it) }
                y.str("weightCategory")?.let { put("weight", it) }; y.str("fiber")?.let { put("fiber", it) }
                y.double("metersPerSkein")?.let { put("meters", it.toLong().toString()) }
                y.double("gramsPerSkein")?.let { put("grams", it.toLong().toString()) }
                y.double("skeins")?.let { put("skeins", if (it == Math.floor(it)) it.toLong().toString() else it.toString()) }
            }
        } }
    }
    val pick = rememberFilePicker { photo = it; removePhoto = false }
    val camera = rememberCamera(context) { photo = it; removePhoto = false }
    // Un même code pour deux portes ouvrirait la mauvaise : le site le signale aussi.
    val dup = code.isNotBlank() && d.objs("days").any { it.int("day") != day && normalize(it.str("code")) == normalize(code) }

    Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(title, { title = it }, label = { Text(tr("advent.ws.dayTitle")) }, placeholder = { Text(tr("advent.ws.dayTitlePh")) },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(isMain, { isMain = it }); Text("✦ " + tr("advent.main")) }
        OutlinedTextField(hint, { hint = it }, label = { Text(tr("advent.ws.hint")) }, placeholder = { Text(tr("advent.ws.hintPh")) }, minLines = 2, modifier = Modifier.fillMaxWidth())
        Text(tr("advent.ws.hintPhoto"), style = MaterialTheme.typography.labelLarge)
        val existing = row.str("hintPhotoPath")
        when {
            photo != null -> coil.compose.AsyncImage(photo, null, Modifier.size(120.dp).clip(RoundedCornerShape(8.dp)))
            existing != null && !removePhoto -> MediaImage(existing, Modifier.size(120.dp).clip(RoundedCornerShape(8.dp)), width = 400)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { pick(arrayOf("image/*")) }) { Text(tr("app.choosePhoto")) }
            OutlinedButton(onClick = camera) { Text(tr("app.takePhoto")) }
        }
        if (existing != null) Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(removePhoto, { removePhoto = it; if (it) photo = null }); Text(tr("advent.ws.removePhoto"))
        }
        OutlinedTextField(code, { code = it }, label = { Text(tr("advent.ws.code")) }, singleLine = true, modifier = Modifier.fillMaxWidth(),
            isError = dup, supportingText = { if (dup) Text(tr("advent.ws.dupCode")) })
        SelectField(tr("advent.ws.pattern"), patternId,
            listOf("" to "—") + d.objs("myPatterns").map { it.str("id").orEmpty() to it.str("title").orEmpty() + if (it.bool("isShared")) " " + tr("advent.ws.sharedMark") else "" },
            { patternId = it }, Modifier.fillMaxWidth())
        Text(tr("advent.ws.yarns"), style = MaterialTheme.typography.labelLarge)
        yarns.forEachIndexed { i, y ->
            if (i == 0 || yarns[i - 1].values.any { it.isNotBlank() } || y.values.any { it.isNotBlank() }) {
                OutlinedCard {
                    Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            OutlinedTextField(y["brand"].orEmpty(), { y["brand"] = it }, label = { Text(tr("advent.ws.y.brand")) }, singleLine = true, modifier = Modifier.weight(1f))
                            OutlinedTextField(y["name"].orEmpty(), { y["name"] = it }, label = { Text(tr("advent.ws.y.name")) }, singleLine = true, modifier = Modifier.weight(1f))
                        }
                        OutlinedTextField(y["colorway"].orEmpty(), { y["colorway"] = it }, label = { Text(tr("advent.ws.y.colorway")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        ColorPickerRow(tr("advent.ws.y.color"), y["colorHex"].orEmpty()) { y["colorHex"] = it }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            SelectField(tr("advent.ws.y.weight"), y["weight"].orEmpty(), listOf("" to "—") + YARN_WEIGHTS.map { it to it }, { y["weight"] = it }, Modifier.weight(1f))
                            OutlinedTextField(y["fiber"].orEmpty(), { y["fiber"] = it }, label = { Text(tr("advent.ws.y.fiber")) }, singleLine = true, modifier = Modifier.weight(1f))
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            NumberField(y["meters"].orEmpty(), { y["meters"] = it }, tr("advent.ws.y.meters"), Modifier.weight(1f))
                            NumberField(y["grams"].orEmpty(), { y["grams"] = it }, tr("advent.ws.y.grams"), Modifier.weight(1f))
                            NumberField(y["skeins"].orEmpty(), { y["skeins"] = it }, tr("advent.ws.y.skeins"), Modifier.weight(1f), decimal = true)
                        }
                    }
                }
            }
        }
        OutlinedTextField(message, { message = it }, label = { Text(tr("advent.ws.message")) }, placeholder = { Text(tr("advent.ws.messagePh")) },
            minLines = 2, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(notifyTime, { notifyTime = it }, label = { Text(tr("advent.ws.dayNotifyTime")) }, placeholder = { Text("08:00") },
            singleLine = true, modifier = Modifier.fillMaxWidth())
        Button(onClick = {
            scope.launch {
                val files = photo?.let { listOf(readPickedImage(context, it, "hintPhoto")) } ?: emptyList()
                val fields = mutableListOf(
                    "calendarId" to cal.str("id").orEmpty(), "day" to day.toString(), "title" to title, "hint" to hint,
                    "code" to code, "patternId" to patternId, "message" to message, "notifyTime" to notifyTime,
                )
                if (isMain) fields += "isMain" to "on"
                if (removePhoto) fields += "removePhoto" to "on"
                yarns.forEachIndexed { i, y ->
                    listOf("brand", "name", "colorway", "colorHex", "weight", "fiber", "meters", "grams", "skeins").forEach { k ->
                        fields += "y${i}_$k" to y[k].orEmpty()
                    }
                }
                page.submit(action = "saveDay", fields = fields, files = files, onError = toast) { if (it.ok) toast(t("app.saved")) }
            }
        }, modifier = Modifier.fillMaxWidth()) { Text(tr("advent.ws.save")) }
    }
}

private fun normalize(s: String?): String =
    java.text.Normalizer.normalize(s.orEmpty(), java.text.Normalizer.Form.NFD).replace(Regex("\\p{Mn}+"), "").lowercase().replace(Regex("[^a-z0-9]"), "")
