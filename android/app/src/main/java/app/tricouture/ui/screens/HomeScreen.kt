package app.tricouture.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.Routes
import app.tricouture.ui.components.*
import com.google.gson.JsonObject

/** Tableau de bord : reprendre son tricot, chiffres, échéances, projets et patrons récents. */
@Composable
fun HomeScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/")
    val toast = rememberToast()
    val ai by Session.ai.collectAsState()
    val advent by Session.advent.collectAsState()
    Screen(
        tr("nav.home"),
        actions = {
            if (ai) IconButton(onClick = { nav.navigate("assistant?kind=&id=&title=&q=") }) { Icon(Icons.Default.AutoAwesome, tr("nav.assistant")) }
            IconButton(onClick = { nav.navigate(Routes.SETTINGS) }) { Icon(Icons.Default.Settings, tr("app.settings")) }
        },
    ) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(tr("dash.hello", "name" to d.obj("user")?.str("displayName").orEmpty()), style = MaterialTheme.typography.headlineSmall)

                // Une porte du calendrier de l'Avent attend d'être ouverte.
                advent?.int("waitingDoor")?.let { door ->
                    Card(
                        onClick = { nav.navigate("avent") },
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                if (door == 1) tr("advent.notif.firstTitle") else tr("advent.notif.dayTitle", "n" to door),
                                Modifier.weight(1f), style = MaterialTheme.typography.titleMedium,
                                color = MaterialTheme.colorScheme.onTertiaryContainer,
                            )
                            Text(tr("advent.notif.open"), color = MaterialTheme.colorScheme.onTertiaryContainer)
                        }
                    }
                }

                d.obj("resume")?.let { r -> Resume(page, r, toast) }

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat(d.int("patternCount") ?: 0, tr("dash.patterns"), Modifier.weight(1f)) { nav.navigate(Routes.PATTERNS) }
                    Stat(d.int("wip") ?: 0, tr("dash.wip"), Modifier.weight(1f)) { nav.navigate(Routes.PROJECTS) }
                    Stat(d.int("yarnCount") ?: 0, tr("dash.yarns"), Modifier.weight(1f)) { nav.navigate(Routes.STASH) }
                }

                val deadlines = d.objs("deadlines")
                if (deadlines.isNotEmpty()) {
                    Text(tr("dash.deadlines"), style = MaterialTheme.typography.titleMedium)
                    deadlines.forEach { p ->
                        Row(Modifier.fillMaxWidth().clickable { nav.navigate("project/${p.str("id")}") }.padding(vertical = 4.dp)) {
                            Text(p.str("title").orEmpty(), Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(formatDeadline(p.str("deadline")), style = MaterialTheme.typography.bodySmall,
                                color = if ((daysFromToday(p.str("deadline")) ?: 1) < 0) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }

                Text(tr("dash.recent"), style = MaterialTheme.typography.titleMedium)
                val recent = d.objs("recentProjects")
                if (recent.isEmpty() && d.obj("resume") == null) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("dash.none") + " ", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(tr("dash.create"), color = MaterialTheme.colorScheme.primary, modifier = Modifier.clickable { nav.navigate("projects/new") })
                    }
                }
                LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    items(recent) { p ->
                        MiniCard(p.str("title").orEmpty(), p.str("coverPath"), "🧶",
                            "${p.int("progressPct") ?: 0} %" + (p.str("deadline")?.let { " · " + tr("dash.deadline") + " " + formatDate(it) } ?: "")) {
                            nav.navigate("project/${p.str("id")}")
                        }
                    }
                }

                val patterns = d.objs("recentPatterns")
                if (patterns.isNotEmpty()) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(tr("dash.recentPatterns"), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                        TextButton(onClick = { nav.navigate(Routes.PATTERNS) }) { Text(tr("dash.allPatterns") + " →") }
                    }
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(patterns) { p ->
                            MiniCard(p.str("title").orEmpty(), p.str("coverPath"), "📄", craftLabel(p.str("craft"))) {
                                nav.navigate("pattern/${p.str("id")}")
                            }
                        }
                    }
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun Resume(page: PageModel, r: JsonObject, toast: (String) -> Unit) {
    val nav = LocalNav.current
    ElevatedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(tr("dash.resume"), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(r.str("title").orEmpty(), style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.clickable { nav.navigate("project/${r.str("id")}") })
            val row = r.int("currentRow") ?: 0
            val total = r.int("totalRows")
            Text(
                (if (total != null && total > 0) tr("dash.rowOf", "n" to row, "total" to total) else tr("dash.row", "n" to row)) +
                    " · ${r.int("progressPct") ?: 0} %",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = {
                    page.patch { d -> d.obj("resume")?.addProperty("currentRow", row + 1) }
                    page.submit(path = "/projects/${r.str("id")}", action = "row", fields = listOf("delta" to "1"), onError = toast)
                }) { Text(tr("projects.detail.addRow")) }
                OutlinedButton(onClick = { nav.navigate("project/${r.str("id")}") }) { Text(tr("dash.open")) }
            }
        }
    }
}

@Composable
private fun Stat(n: Int, label: String, modifier: Modifier, onClick: () -> Unit) {
    OutlinedCard(onClick = onClick, modifier = modifier) {
        Column(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("$n", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
        }
    }
}

@Composable
private fun MiniCard(title: String, cover: String?, emoji: String, sub: String, onClick: () -> Unit) {
    ElevatedCard(onClick = onClick, modifier = Modifier.width(150.dp)) {
        MediaImage(cover, Modifier.fillMaxWidth().height(110.dp).clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)), width = 400, placeholder = emoji)
        Column(Modifier.padding(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}
