package app.tricouture.ui.screens.advent

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import com.google.gson.JsonObject

/** Ordre des portes sur le plateau, le même que sur le site ($lib/advent.ts). */
private val DOOR_ORDER = listOf(17, 5, 22, 9, 1, 14, 11, 20, 3, 24, 7, 16, 2, 13, 19, 6, 21, 10, 23, 8, 15, 4, 12, 18)
private val NIGHT = Brush.verticalGradient(listOf(Color(0xFF1B1E44), Color(0xFF2A2060), Color(0xFF1B1E44)))
private val GOLD = Color(0xFFE5C07B)
private val DOOR_COLORS = listOf(
    Color(0xFFB4485A), Color(0xFF3F7F5E), Color(0xFF45518F), Color(0xFF7A4E8C), Color(0xFFC0703A), Color(0xFF2F7B82),
)

/**
 * Calendrier de l'Avent : 24 portes, chacune s'ouvre le jour venu avec le code
 * caché avec la laine. Pour le lutin, aperçu à une date choisie (`preview`).
 */
@Composable
fun AdventScreen(preview: String = "", date: String = "") {
    val nav = LocalNav.current
    val query = mapOf("preview" to preview, "date" to date)
    val page = rememberPage("/avent", query)
    var open by remember { mutableStateOf<Int?>(null) }
    var revealed by remember { mutableStateOf<Map<Int, JsonObject>>(emptyMap()) }
    Screen(tr("nav.advent"), onBack = { nav.popBackStack() }) { padding ->
        Box(Modifier.padding(padding).fillMaxSize().background(NIGHT)) {
            PageBody(page) { d ->
                val cal = d.obj("calendar")
                val doors = d.objs("doors").associateBy { it.int("day") ?: 0 }
                val opened = doors.values.count { it.str("state") == "open" }
                val main = doors.values.filter { it.bool("isMain") }
                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    contentPadding = PaddingValues(14.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                            if (d.bool("preview")) PreviewBar(cal?.str("id").orEmpty(), d.str("previewDate").orEmpty())
                            Text(tr("advent.eyebrow", "year" to (cal?.int("year") ?: "")).uppercase(), color = GOLD,
                                style = MaterialTheme.typography.labelMedium, letterSpacing = 2.sp)
                            Text(cal?.str("title").orEmpty(), color = Color.White, fontFamily = FontFamily.Serif,
                                fontWeight = FontWeight.Bold, fontSize = 30.sp, textAlign = TextAlign.Center)
                            cal?.str("message")?.let { Text(it, color = Color.White.copy(alpha = 0.85f), textAlign = TextAlign.Center) }
                            Text(tr("advent.progress", "n" to opened), color = Color.White.copy(alpha = 0.85f))
                            if (main.isNotEmpty()) Text("✦ " + tr("advent.mainProgress", "n" to main.count { it.str("state") == "open" }, "total" to main.size),
                                color = GOLD, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    items(DOOR_ORDER) { day ->
                        val door = revealed[day] ?: doors[day]
                        if (door != null) Door(day, door) { open = day }
                    }
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text("✦ " + tr("advent.mainHelp"), color = Color.White.copy(alpha = 0.7f), style = MaterialTheme.typography.bodySmall,
                            textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 24.dp))
                    }
                }
                val current = open?.let { revealed[it] ?: doors[it] }
                if (current != null) DoorSheet(page, current, d.bool("preview"), query, onRevealed = { door ->
                    revealed = revealed + ((door.int("day") ?: 0) to door)
                }, onClose = { open = null })
            }
        }
    }
}

@Composable
private fun Door(day: Int, door: JsonObject, onClick: () -> Unit) {
    val state = door.str("state")
    val color = DOOR_COLORS[day % DOOR_COLORS.size]
    Box(
        Modifier.aspectRatio(1f).clip(RoundedCornerShape(10.dp))
            .background(if (state == "open") Color(0xFF2B2418) else color)
            .border(if (state == "available") BorderStroke(3.dp, GOLD) else BorderStroke(1.5.dp, GOLD.copy(alpha = 0.7f)), RoundedCornerShape(10.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        if (state == "open") {
            val cover = door.str("coverPath")
            if (cover != null) MediaImage(cover, Modifier.fillMaxSize(), width = 200, contentScale = ContentScale.Crop)
            Text(door.str("title") ?: tr("advent.opened"), color = Color.White, style = MaterialTheme.typography.labelSmall,
                maxLines = 2, textAlign = TextAlign.Center,
                modifier = Modifier.align(Alignment.BottomCenter).background(Color.Black.copy(alpha = 0.5f)).padding(2.dp))
        } else {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text("$day", color = GOLD, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold, fontSize = 22.sp)
                val left = door.int("daysLeft") ?: 0
                Text(
                    if (state == "available") tr("advent.ready") else if (left == 1) tr("advent.tomorrow") else tr("advent.inDays", "n" to left),
                    color = Color.White.copy(alpha = 0.9f), style = MaterialTheme.typography.labelSmall, textAlign = TextAlign.Center, maxLines = 1,
                )
            }
        }
        if (door.bool("isMain")) Text("✦", color = GOLD, modifier = Modifier.align(Alignment.TopEnd).padding(4.dp))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DoorSheet(
    page: PageModel,
    door: JsonObject,
    preview: Boolean,
    query: Map<String, String>,
    onRevealed: (JsonObject) -> Unit,
    onClose: () -> Unit,
) {
    val nav = LocalNav.current
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val busy by page.busy.collectAsState()
    val day = door.int("day") ?: 0
    fun tryOpen() {
        error = null
        val q = if (preview) "&preview=${query["preview"]}&date=${query["date"]}" else ""
        page.submit(action = "open$q", fields = listOf("day" to day.toString(), "code" to code), onError = {}) { res ->
            when (res) {
                is ActionResult.Failure -> error = when (res.data.str("reason")) {
                    "wrong" -> t("advent.wrong")
                    "wait" -> t("advent.wait", "n" to (res.data.int("minutes") ?: 0))
                    "notYet" -> t("advent.notYet")
                    else -> t("advent.error")
                }
                is ActionResult.Success -> res.data.obj("door")?.let(onRevealed)
                else -> {}
            }
        }
    }
    ModalBottomSheet(onDismissRequest = onClose) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp, 0.dp, 20.dp, 32.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(tr("advent.doorLabel", "n" to day), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                if (door.bool("isMain")) Pill("✦ " + tr("advent.main"))
            }
            when (door.str("state")) {
                "locked" -> Text("❄️ " + tr("advent.lockedMsg"), style = MaterialTheme.typography.titleMedium)
                "available" -> {
                    Text(tr("advent.hintTitle"), style = MaterialTheme.typography.titleMedium)
                    Text(door.str("hint") ?: tr("advent.noHint"))
                    door.str("hintPhoto")?.let { MediaImage(it, Modifier.fillMaxWidth().heightIn(max = 360.dp).clip(RoundedCornerShape(10.dp)), width = 800, contentScale = ContentScale.Fit) }
                    OutlinedTextField(
                        code, { code = it }, label = { Text(tr("advent.codeLabel")) }, placeholder = { Text("✶ ✶ ✶") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { if (code.isNotBlank()) tryOpen() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Button(onClick = { tryOpen() }, enabled = !busy && code.isNotBlank(), modifier = Modifier.fillMaxWidth().height(52.dp)) {
                        Text("✨ " + tr("advent.open"))
                    }
                }
                else -> {
                    Text(door.str("title") ?: tr("advent.opened"), style = MaterialTheme.typography.headlineSmall)
                    door.str("coverPath")?.let { MediaImage(it, Modifier.fillMaxWidth().heightIn(max = 320.dp).clip(RoundedCornerShape(10.dp)), width = 400, contentScale = ContentScale.Fit) }
                    door.str("message")?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
                    val yarns = door.objs("yarns")
                    if (yarns.isNotEmpty()) {
                        Text(tr("advent.yarnTitle"), style = MaterialTheme.typography.titleMedium)
                        yarns.forEach { y ->
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Box(Modifier.size(20.dp).clip(CircleShape).background(hexColor(y.str("colorHex"), Color.LightGray)))
                                Text(listOfNotNull(y.str("brand"), y.str("name")).filter { it.isNotBlank() }.joinToString(" ") +
                                    (y.str("colorway")?.takeIf { it.isNotBlank() }?.let { " · $it" } ?: ""))
                            }
                        }
                        if (!preview) Text(tr("advent.inStash"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    val pid = door.str("patternId")
                    if (pid != null && !preview) {
                        Button(onClick = { onClose(); nav.navigate("pattern/$pid") }, modifier = Modifier.fillMaxWidth()) { Text("📜 " + tr("advent.seePattern")) }
                        OutlinedButton(onClick = { onClose(); nav.navigate("projects/new?pattern=$pid") }, modifier = Modifier.fillMaxWidth()) {
                            Text("🧶 " + tr("advent.startProject"))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PreviewBar(calendarId: String, date: String) {
    val nav = LocalNav.current
    var pick by remember { mutableStateOf(date) }
    Surface(color = GOLD.copy(alpha = 0.18f), shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 10.dp)) {
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("👁️ " + tr("advent.preview.banner"), color = Color.White)
            DateField(tr("advent.preview.date"), pick, { pick = it }, Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { nav.navigate("avent?preview=$calendarId&date=$pick") { popUpTo("avent?preview={preview}&date={date}") { inclusive = true } } }) {
                    Text(tr("advent.preview.go"))
                }
                OutlinedButton(onClick = { nav.popBackStack() }) { Text(tr("advent.preview.back"), color = Color.White) }
            }
        }
    }
}
