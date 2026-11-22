package app.tricouture.ui.screens.projects

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.Routes
import app.tricouture.ui.components.*
import app.tricouture.ui.theme.LocalStatusColors
import com.google.gson.JsonArray
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

/**
 * Tableau des projets : une colonne par statut (onglets qu'on fait glisser).
 * Le glisser-déposer du site devient un menu « Déplacer vers » sur chaque carte.
 */
@Composable
fun ProjectsBoardScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/projects/board")
    val toast = rememberToast()
    val scope = rememberCoroutineScope()
    val pager = rememberPagerState { PROJECT_STATUSES.size }

    fun move(columns: JsonObject, card: JsonObject, to: String, position: Int? = null) {
        val target = columns.objs(to).map { it.str("id").orEmpty() }.filter { it != card.str("id") }.toMutableList()
        val id = card.str("id").orEmpty()
        if (position == null) target.add(id) else target.add(position.coerceIn(0, target.size), id)
        page.run(onError = toast) {
            val ids = JsonArray().apply { target.forEach { add(it) } }
            Session.kit.api("POST", "/api/projects/reorder", JsonObject().apply { addProperty("status", to); add("ids", ids) })
        }
    }

    Screen(
        tr("projects.board.title"),
        fab = {
            ExtendedFloatingActionButton(
                onClick = { nav.navigate("projects/new") },
                icon = { Icon(Icons.Default.Add, null) },
                text = { Text(tr("projects.board.newProject").removePrefix("+ ")) },
            )
        },
    ) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val columns = d.obj("columns") ?: JsonObject()
            Column(Modifier.fillMaxSize()) {
                ScrollableTabRow(selectedTabIndex = pager.currentPage, edgePadding = 8.dp) {
                    PROJECT_STATUSES.forEachIndexed { i, s ->
                        Tab(
                            selected = pager.currentPage == i,
                            onClick = { scope.launch { pager.animateScrollToPage(i) } },
                            text = { Text("${statusLabel(s)} (${columns.objs(s).size})") },
                        )
                    }
                }
                HorizontalPager(pager, Modifier.fillMaxSize()) { i ->
                    val status = PROJECT_STATUSES[i]
                    val cards = columns.objs(status)
                    LazyColumn(
                        Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(12.dp, 12.dp, 12.dp, 96.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        if (cards.isEmpty()) item { EmptyState(tr("projects.board.emptyColumn"), emoji = "🧶") }
                        items(cards, key = { it.str("id").orEmpty() }) { card ->
                            val index = cards.indexOf(card)
                            ProjectCard(
                                card,
                                onOpen = { nav.navigate("project/${card.str("id")}") },
                                onMove = { to -> move(columns, card, to) },
                                onUp = if (index > 0) ({ move(columns, card, status, index - 1) }) else null,
                                onDown = if (index < cards.size - 1) ({ move(columns, card, status, index + 1) }) else null,
                                current = status,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProjectCard(
    card: JsonObject,
    current: String,
    onOpen: () -> Unit,
    onMove: (String) -> Unit,
    onUp: (() -> Unit)?,
    onDown: (() -> Unit)?,
) {
    var menu by remember { mutableStateOf(false) }
    val status = LocalStatusColors.current
    ElevatedCard(onClick = onOpen, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(card.str("title").orEmpty(), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium,
                    maxLines = 2, overflow = TextOverflow.Ellipsis)
                Box {
                    IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, null) }
                    DropdownMenu(menu, onDismissRequest = { menu = false }) {
                        PROJECT_STATUSES.filter { it != current }.forEach { s ->
                            DropdownMenuItem(text = { Text("→ " + statusLabel(s)) }, onClick = { menu = false; onMove(s) })
                        }
                        if (onUp != null) DropdownMenuItem(text = { Text("↑") }, onClick = { menu = false; onUp() })
                        if (onDown != null) DropdownMenuItem(text = { Text("↓") }, onClick = { menu = false; onDown() })
                    }
                }
            }
            val pct = card.int("progressPct") ?: 0
            LinearProgressIndicator(progress = { pct / 100f }, Modifier.fillMaxWidth())
            Row(verticalAlignment = Alignment.CenterVertically) {
                val total = card.int("totalRows")
                Text(
                    "$pct %" + if (total != null && total > 0) " · " + tr("projects.board.rowsShort", "current" to (card.int("currentRow") ?: 0), "total" to total) else "",
                    Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                daysFromToday(card.str("deadline"))?.let { dl ->
                    if (dl < 0) Pill(tr("projects.board.lateDays", "n" to -dl), container = status.dangerSoft, content = status.danger)
                    else Pill(tr("projects.board.dueIn", "n" to dl),
                        container = if (dl <= 7) status.warnSoft else MaterialTheme.colorScheme.secondaryContainer,
                        content = if (dl <= 7) status.warn else MaterialTheme.colorScheme.onSecondaryContainer)
                }
            }
        }
    }
}

/** Nouveau projet, à partir d'un patron ou non. */
@Composable
fun ProjectNewScreen(presetPattern: String) {
    val nav = LocalNav.current
    val page = rememberPage("/projects/new", mapOf("pattern" to presetPattern))
    val toast = rememberToast()
    var title by remember { mutableStateOf("") }
    var patternId by remember { mutableStateOf(presetPattern) }
    var status by remember { mutableStateOf("idee") }
    var deadline by remember { mutableStateOf("") }
    var totalRows by remember { mutableStateOf("") }
    val busy by page.busy.collectAsState()
    Screen(tr("projects.new.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val options = d.objs("patternOptions")
            LaunchedEffect(options, presetPattern) {
                if (title.isBlank()) options.firstOrNull { it.str("id") == presetPattern }?.str("title")?.let { title = it }
            }
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding().padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(title, { title = it }, label = { Text(tr("projects.new.titleField")) }, singleLine = true,
                    modifier = Modifier.fillMaxWidth())
                SelectField(tr("projects.new.linkedPattern"), patternId,
                    listOf("" to tr("projects.new.none")) + options.map { it.str("id").orEmpty() to it.str("title").orEmpty() },
                    { id ->
                        patternId = id
                        if (title.isBlank()) options.firstOrNull { it.str("id") == id }?.str("title")?.let { title = it }
                    }, Modifier.fillMaxWidth())
                SelectField(tr("projects.new.column"), status, PROJECT_STATUSES.map { it to statusLabel(it) }, { status = it },
                    Modifier.fillMaxWidth())
                DateField(tr("projects.new.deadline"), deadline, { deadline = it }, Modifier.fillMaxWidth())
                OutlinedTextField(totalRows, { v -> totalRows = v.filter { it.isDigit() } }, label = { Text(tr("projects.new.totalRows")) },
                    singleLine = true, keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = androidx.compose.ui.text.input.KeyboardType.Number), modifier = Modifier.fillMaxWidth())
                Button(
                    onClick = {
                        page.submit(
                            action = null,
                            fields = listOf("title" to title.trim(), "patternId" to patternId, "status" to status,
                                "deadline" to deadline, "totalRows" to totalRows),
                            onError = toast,
                        ) { res ->
                            if (res is ActionResult.Redirect) {
                                nav.popBackStack()
                                Routes.fromSitePath(res.location)?.let { nav.navigate(it) }
                            }
                        }
                    },
                    enabled = title.isNotBlank() && !busy,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                ) { Text(tr("projects.new.submit")) }
            }
        }
    }
}
