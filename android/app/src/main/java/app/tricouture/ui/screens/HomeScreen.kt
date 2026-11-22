package app.tricouture.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.Routes
import app.tricouture.ui.components.*
import com.google.gson.JsonObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * Accueil : le projet en cours dans un grand bloc (gros bouton +1, mode
 * focus), des tuiles (Avent, stock, échéance, assistant), puis les projets
 * et patrons récents.
 */
@Composable
fun HomeScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/")
    val toast = rememberToast()
    val ai by Session.ai.collectAsState()
    val advent by Session.advent.collectAsState()
    val locale by Session.locale.collectAsState()
    val cs = MaterialTheme.colorScheme
    Scaffold(snackbarHost = { SnackbarHost(LocalSnackbar.current) }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            LocalDate.now().format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.forLanguageTag(locale)))
                                .replaceFirstChar { it.uppercase() },
                            style = MaterialTheme.typography.titleSmall, color = cs.onSurfaceVariant,
                        )
                        Text(tr("dash.hello", "name" to d.obj("user")?.str("displayName").orEmpty()),
                            style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black,
                            maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                    if (ai) FilledIconButton(
                        onClick = { nav.navigate("assistant?kind=&id=&title=&q=") },
                        modifier = Modifier.size(48.dp),
                        colors = IconButtonDefaults.filledIconButtonColors(containerColor = cs.inversePrimary, contentColor = cs.onPrimaryContainer),
                    ) { Icon(Icons.Default.AutoAwesome, tr("nav.assistant")) }
                    IconButton(onClick = { nav.navigate(Routes.SETTINGS) }, modifier = Modifier.size(48.dp)) {
                        Icon(Icons.Default.Settings, tr("app.settings"))
                    }
                }

                val resume = d.obj("resume")
                if (resume != null) ResumeHero(page, resume, toast)
                else EmptyHero(onNew = { nav.navigate("projects/new?pattern=") }, onPatterns = { nav.navigate(Routes.PATTERNS) })

                Tiles(d, advent, ai)

                val recent = d.objs("recentProjects")
                if (recent.isNotEmpty()) {
                    SectionHeader(tr("dash.recent"), tr("nav.projects") + " →") { nav.navigate(Routes.PROJECTS) }
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(recent) { p ->
                            MiniCard(p.str("title").orEmpty(), p.str("coverPath"), "🧶",
                                "${p.int("progressPct") ?: 0} %" + (p.str("deadline")?.let { " · " + tr("dash.deadline") + " " + formatDate(it) } ?: "")) {
                                nav.navigate("project/${p.str("id")}")
                            }
                        }
                    }
                }

                val patterns = d.objs("recentPatterns")
                if (patterns.isNotEmpty()) {
                    SectionHeader(tr("dash.recentPatterns"), tr("dash.allPatterns") + " →") { nav.navigate(Routes.PATTERNS) }
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        items(patterns) { p ->
                            MiniCard(p.str("title").orEmpty(), p.str("coverPath"), "📄", craftLabel(p.str("craft"))) {
                                nav.navigate("pattern/${p.str("id")}")
                            }
                        }
                    }
                }
                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String, action: String, onAction: () -> Unit) {
    Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
        TextButton(onClick = onAction) { Text(action, fontWeight = FontWeight.Bold) }
    }
}

/** Le projet en cours : rang, progression ondulée, gros +1 festonné. */
@Composable
private fun ResumeHero(page: PageModel, r: JsonObject, toast: (String) -> Unit) {
    val nav = LocalNav.current
    val hero = heroColors()
    val id = r.str("id")
    val row = r.int("currentRow") ?: 0
    val total = r.int("totalRows")?.takeIf { it > 0 }
    fun step(delta: Int) {
        // Affichage immédiat, le site confirme ensuite.
        page.patch { d ->
            d.obj("resume")?.let { pr ->
                val n = ((pr.int("currentRow") ?: 0) + delta).coerceAtLeast(0)
                pr.addProperty("currentRow", n)
                val t = pr.int("totalRows")
                if (t != null && t > 0) pr.addProperty("progressPct", (n * 100 / t).coerceIn(0, 100))
            }
        }
        page.submit(path = "/projects/$id", action = "row", fields = listOf("delta" to delta.toString()), onError = toast)
    }
    Surface(
        onClick = { nav.navigate("project/$id") },
        shape = RoundedCornerShape(36.dp),
        color = hero.container,
        contentColor = hero.content,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(start = 24.dp, end = 24.dp, top = 22.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Pill(tr("dash.resume"), container = hero.accent, content = hero.onAccent)
                Spacer(Modifier.weight(1f))
                TextButton(onClick = { nav.navigate("project/$id/focus") },
                    colors = ButtonDefaults.textButtonColors(contentColor = hero.content)) {
                    Text(tr("app.focus.open"), fontWeight = FontWeight.Bold)
                }
            }
            Text(r.str("title").orEmpty(), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            WavyProgress(((r.int("progressPct") ?: 0) / 100f), color = hero.accent, trackColor = hero.raised)
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text("$row", fontSize = 88.sp, lineHeight = 84.sp, fontWeight = FontWeight.Black)
                    Text(
                        if (total != null) tr("app.focus.ofRows", "total" to total) else tr("app.focus.rows"),
                        style = MaterialTheme.typography.titleSmall, color = hero.muted,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedIconButton(
                        onClick = { step(-1) }, enabled = row > 0,
                        border = BorderStroke(1.5.dp, hero.outline),
                        colors = IconButtonDefaults.outlinedIconButtonColors(contentColor = hero.content),
                        modifier = Modifier.size(52.dp),
                    ) { Icon(Icons.Default.Remove, tr("app.focus.removeRow")) }
                    Surface(
                        onClick = { step(1) },
                        shape = remember { CookieShape() },
                        color = hero.accent, contentColor = hero.onAccent,
                        modifier = Modifier.size(112.dp),
                    ) {
                        Box(contentAlignment = Alignment.Center) { Text("+1", fontSize = 28.sp, fontWeight = FontWeight.Black) }
                    }
                }
            }
        }
    }
}

@Composable
private fun EmptyHero(onNew: () -> Unit, onPatterns: () -> Unit) {
    val hero = heroColors()
    Surface(shape = RoundedCornerShape(36.dp), color = hero.container, contentColor = hero.content, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(tr("dash.none"), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
            Text(tr("app.home.emptyHint"), style = MaterialTheme.typography.bodyLarge, color = hero.muted)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onNew, colors = ButtonDefaults.buttonColors(containerColor = hero.accent, contentColor = hero.onAccent),
                    modifier = Modifier.height(52.dp)) { Text(tr("dash.create"), fontWeight = FontWeight.ExtraBold) }
                OutlinedButton(onClick = onPatterns, border = BorderStroke(1.5.dp, hero.outline),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = hero.content),
                    modifier = Modifier.height(52.dp)) { Text(tr("nav.patterns"), fontWeight = FontWeight.Bold) }
            }
        }
    }
}

/** Les tuiles : Avent (si le calendrier concerne la personne), stock, échéance, assistant. */
@Composable
private fun Tiles(d: JsonObject, advent: JsonObject?, ai: Boolean) {
    val nav = LocalNav.current
    val cs = MaterialTheme.colorScheme
    val tiles = mutableListOf<@Composable (Modifier) -> Unit>()
    if (advent != null) tiles += { m ->
        BentoTile(cs.tertiaryContainer, cs.onTertiaryContainer, onClick = { nav.navigate("avent") }, m) {
            Text(tr("nav.advent"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1)
            val door = advent.int("waitingDoor")
            val today = LocalDate.now()
            // En novembre : le compte à rebours jusqu'à la première porte.
            val daysToFirst = if (today.monthValue == 11) 31 - today.dayOfMonth else null
            when {
                door != null -> Text(
                    if (door == 1) tr("app.home.adventFirst") else tr("app.home.adventDoor", "n" to door),
                    style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black, maxLines = 2,
                )
                daysToFirst != null -> Column {
                    Text(tr("app.home.adventIn", "n" to daysToFirst), style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Black)
                    Text(tr("app.home.adventUntil"), style = MaterialTheme.typography.bodyMedium)
                }
                else -> Text(tr("advent.notif.open"), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
            }
        }
    }
    tiles += { m ->
        BentoTile(cs.secondaryContainer, cs.onSecondaryContainer, onClick = { nav.navigate(Routes.STASH) }, m,
            shape = RoundedCornerShape(28.dp, 28.dp, 28.dp, 8.dp)) {
            Text(tr("nav.stash"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Column {
                Text("${d.int("yarnCount") ?: 0}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
                Text(tr("dash.yarns"), style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
    val deadline = d.objs("deadlines").firstOrNull()
    tiles += { m ->
        if (deadline != null) {
            BentoTile(cs.surfaceContainerHigh, cs.onSurface, onClick = { nav.navigate("project/${deadline.str("id")}") }, m,
                shape = RoundedCornerShape(28.dp, 8.dp, 28.dp, 28.dp)) {
                Text(tr("projects.detail.deadline"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1)
                Column {
                    Text(deadline.str("title").orEmpty(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val late = (daysFromToday(deadline.str("deadline")) ?: 1) < 0
                    Text(formatDeadline(deadline.str("deadline")), style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold, color = if (late) cs.error else cs.onSurfaceVariant, maxLines = 1)
                }
            }
        } else {
            BentoTile(cs.surfaceContainerHigh, cs.onSurface, onClick = { nav.navigate(Routes.PROJECTS) }, m,
                shape = RoundedCornerShape(28.dp, 8.dp, 28.dp, 28.dp)) {
                Text(tr("nav.projects"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Column {
                    Text("${d.int("wip") ?: 0}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
                    Text(tr("dash.wip"), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
    tiles += { m ->
        if (ai) {
            BentoTile(cs.primaryContainer, cs.onPrimaryContainer, onClick = { nav.navigate("assistant?kind=&id=&title=&q=") }, m) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Default.AutoAwesome, null, Modifier.size(16.dp))
                    Text(tr("nav.assistant"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, maxLines = 1)
                }
                Surface(shape = RoundedCornerShape(16.dp), color = cs.surface, contentColor = cs.onSurface) {
                    Text(tr("app.home.ask"), Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold, maxLines = 2)
                }
            }
        } else {
            BentoTile(cs.primaryContainer, cs.onPrimaryContainer, onClick = { nav.navigate(Routes.PATTERNS) }, m) {
                Text(tr("nav.patterns"), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Column {
                    Text("${d.int("patternCount") ?: 0}", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
                    Text(tr("dash.patterns"), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        tiles.chunked(2).forEach { pair ->
            Row(Modifier.height(124.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                pair.forEach { tile -> tile(Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun MiniCard(title: String, cover: String?, emoji: String, sub: String, onClick: () -> Unit) {
    Column(
        Modifier.width(156.dp).clip(RoundedCornerShape(24.dp)).clickable(onClick = onClick).padding(bottom = 4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        MediaImage(cover, Modifier.fillMaxWidth().height(132.dp).clip(RoundedCornerShape(22.dp)), width = 400, placeholder = emoji)
        Column(Modifier.padding(horizontal = 4.dp)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}
