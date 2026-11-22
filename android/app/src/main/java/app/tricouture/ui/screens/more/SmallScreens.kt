package app.tricouture.ui.screens.more

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import app.tricouture.ui.screens.patterns.NumberField
import app.tricouture.ui.screens.projects.SectionCard
import app.tricouture.ui.theme.LocalStatusColors

/** Calendrier des échéances : projets pas finis, par date. */
@Composable
fun CalendarScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/calendar")
    val status = LocalStatusColors.current
    Screen(tr("calendar.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val rows = d.objs("rows")
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (rows.isEmpty()) item { EmptyState(tr("calendar.empty"), emoji = "📅") }
                // Groupées par mois, comme un agenda.
                rows.groupBy { parseDay(it.str("deadline"))?.withDayOfMonth(1) }.forEach { (month, list) ->
                    item {
                        Text(month?.let { m ->
                            java.time.format.DateTimeFormatter.ofPattern("LLLL yyyy", if (Session.locale.value == "fr") java.util.Locale.FRANCE else java.util.Locale.US).format(m)
                                .replaceFirstChar { it.uppercase() }
                        }.orEmpty(), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp))
                    }
                    items(list) { p ->
                        val dl = daysFromToday(p.str("deadline")) ?: 0
                        ElevatedCard(onClick = { nav.navigate("project/${p.str("id")}") }, modifier = Modifier.fillMaxWidth()) {
                            Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(52.dp)) {
                                    Text(parseDay(p.str("deadline"))?.dayOfMonth?.toString().orEmpty(), style = MaterialTheme.typography.headlineSmall)
                                }
                                Column(Modifier.weight(1f)) {
                                    Text(p.str("title").orEmpty(), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text("${statusLabel(p.str("status"))} · ${p.int("progressPct") ?: 0} %", style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                if (dl < 0) Pill(tr("calendar.daysLate", "n" to -dl), container = status.dangerSoft, content = status.danger)
                                else Pill(tr("calendar.daysLeft", "n" to dl), container = if (dl <= 7) status.warnSoft else MaterialTheme.colorScheme.secondaryContainer,
                                    content = if (dl <= 7) status.warn else MaterialTheme.colorScheme.onSecondaryContainer)
                            }
                        }
                    }
                }
            }
        }
    }
}

private val GOAL_KINDS = listOf("projets_an", "stash_busting", "defi_mensuel", "autre")

/** Objectifs & défis : une cible, un compteur qu'on fait avancer. */
@Composable
fun GoalsScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/goals")
    val toast = rememberToast()
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<String?>(null) }
    Screen(tr("goals.title"), onBack = { nav.popBackStack() }, fab = {
        if (!adding) FloatingActionButton(onClick = { adding = true }) { Icon(Icons.Default.Add, tr("goals.addBtn")) }
    }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val list = d.objs("list")
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (adding) item { NewGoal(page, toast) { adding = false } }
                if (list.isEmpty() && !adding) item { EmptyState(tr("goals.empty"), emoji = "🎯") }
                items(list) { g ->
                    val cur = g.int("currentValue") ?: 0
                    val target = (g.int("targetValue") ?: 1).coerceAtLeast(1)
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(g.str("title").orEmpty(), style = MaterialTheme.typography.titleMedium)
                                    val kind = g.str("kind").orEmpty()
                                    Pill(if (kind in GOAL_KINDS) tr("goals.kind.$kind") else kind)
                                }
                                IconButton(onClick = { deleting = g.str("id") }) { Icon(Icons.Default.Delete, tr("app.delete")) }
                            }
                            LinearProgressIndicator(progress = { (cur.toFloat() / target).coerceIn(0f, 1f) }, Modifier.fillMaxWidth())
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text("$cur / $target" + if (cur >= target) " 🎉" else "", Modifier.weight(1f))
                                val period = listOfNotNull(g.str("periodStart")?.let(::formatDate), g.str("periodEnd")?.let(::formatDate)).joinToString(" → ")
                                if (period.isNotEmpty()) Text(period, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                IconButton(onClick = { page.submit(action = "step", fields = listOf("id" to g.str("id").orEmpty(), "delta" to "-1"), onError = toast) }) {
                                    Icon(Icons.Default.Remove, null)
                                }
                                FilledIconButton(onClick = { page.submit(action = "step", fields = listOf("id" to g.str("id").orEmpty(), "delta" to "1"), onError = toast) }) {
                                    Icon(Icons.Default.Add, null)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    deleting?.let { id ->
        ConfirmDialog(tr("app.confirmDelete"), onConfirm = { page.submit(action = "delete", fields = listOf("id" to id), onError = toast) },
            onDismiss = { deleting = null })
    }
}

@Composable
private fun NewGoal(page: PageModel, toast: (String) -> Unit, onDone: () -> Unit) {
    var title by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("projets_an") }
    var target by remember { mutableStateOf("1") }
    var start by remember { mutableStateOf("") }
    var end by remember { mutableStateOf("") }
    SectionCard(tr("goals.addBtn").removePrefix("+ ")) {
        OutlinedTextField(title, { title = it }, label = { Text(tr("goals.labelTitle")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        SelectField(tr("goals.labelType"), kind, GOAL_KINDS.map { it to tr("goals.kind.$it") }, { kind = it }, Modifier.fillMaxWidth())
        NumberField(target, { target = it }, tr("goals.labelTarget"), Modifier.fillMaxWidth())
        DateField(tr("goals.labelStart"), start, { start = it }, Modifier.fillMaxWidth())
        DateField(tr("goals.labelEnd"), end, { end = it }, Modifier.fillMaxWidth())
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onDone) { Text(tr("goals.close")) }
            Button(onClick = {
                page.submit(action = "add", fields = listOf("title" to title, "kind" to kind, "targetValue" to target,
                    "periodStart" to start, "periodEnd" to end), onError = toast) { if (it.ok) onDone() }
            }, enabled = title.isNotBlank()) { Text(tr("goals.create")) }
        }
    }
}

/** Les personnes pour qui l'on tricote : couleurs préférées, allergies, notes. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RecipientsScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/recipients")
    val toast = rememberToast()
    var adding by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf<String?>(null) }
    Screen(tr("recipients.title"), onBack = { nav.popBackStack() }, fab = {
        if (!adding) FloatingActionButton(onClick = { adding = true }) { Icon(Icons.Default.Add, tr("recipients.addPerson")) }
    }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { Text(tr("recipients.subtitle"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                if (adding) item {
                    var name by remember { mutableStateOf("") }
                    var colors by remember { mutableStateOf("") }
                    var allergies by remember { mutableStateOf("") }
                    var notes by remember { mutableStateOf("") }
                    SectionCard(tr("recipients.addPerson")) {
                        OutlinedTextField(name, { name = it }, label = { Text(tr("recipients.name")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(colors, { colors = it }, label = { Text(tr("recipients.favoriteColors")) },
                            placeholder = { Text(tr("recipients.favoriteColorsPlaceholder")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(allergies, { allergies = it }, label = { Text(tr("recipients.fiberAllergies")) },
                            placeholder = { Text(tr("recipients.fiberAllergiesPlaceholder")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(notes, { notes = it }, label = { Text(tr("recipients.notes")) }, minLines = 2, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { adding = false }) { Text(tr("recipients.close")) }
                            Button(onClick = {
                                page.submit(action = "add", fields = listOf("name" to name, "favoriteColors" to colors,
                                    "fiberAllergies" to allergies, "notes" to notes), onError = toast) { if (it.ok) adding = false }
                            }, enabled = name.isNotBlank()) { Text(tr("recipients.add")) }
                        }
                    }
                }
                items(d.objs("list")) { r ->
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(r.str("name").orEmpty(), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                                IconButton(onClick = { deleting = r.str("id") }) { Icon(Icons.Default.Delete, tr("recipients.delete")) }
                            }
                            val colors = r.strs("favoriteColors")
                            if (colors.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                colors.forEach { c ->
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                        if (c.startsWith("#")) Box(Modifier.size(14.dp).clip(CircleShape).background(hexColor(c)))
                                        Pill(c)
                                    }
                                }
                            }
                            r.str("fiberAllergies")?.let { Text(tr("recipients.allergyLabel") + " " + it, color = MaterialTheme.colorScheme.error) }
                            r.str("notes")?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                        }
                    }
                }
            }
        }
    }
    deleting?.let { id ->
        ConfirmDialog(tr("app.confirmDelete"), onConfirm = { page.submit(action = "delete", fields = listOf("id" to id), onError = toast) },
            onDismiss = { deleting = null })
    }
}

/** Galerie des réalisations : projets terminés, avec leur photo la plus récente. */
@Composable
fun GalleryScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/gallery")
    Screen(tr("gallery.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val items = d.objs("items")
            LazyVerticalGrid(
                columns = GridCells.Adaptive(160.dp),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Text(if (items.isEmpty()) tr("gallery.empty") else tr("gallery.count", "n" to items.size),
                        color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                items(items) { fo ->
                    ElevatedCard(onClick = { nav.navigate("project/${fo.str("id")}") }) {
                        MediaImage(fo.str("image"), Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)),
                            width = 400, placeholder = craftEmoji(fo.str("craft")))
                        Column(Modifier.padding(8.dp)) {
                            Text(fo.str("title").orEmpty(), style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                            Text(listOfNotNull(fo.str("finishedAt")?.let(::formatDate), (fo.int("photoCount") ?: 0).takeIf { it > 0 }?.let { tr("gallery.photos", "n" to it) })
                                .joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
