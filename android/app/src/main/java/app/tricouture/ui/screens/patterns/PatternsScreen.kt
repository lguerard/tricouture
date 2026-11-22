package app.tricouture.ui.screens.patterns

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import com.google.gson.JsonObject
import kotlinx.coroutines.launch

/** Bibliothèque de patrons : recherche, filtres (type, propriétaire, tag), pages. */
@Composable
fun PatternsScreen(presetTag: String = "", onBack: (() -> Unit)? = null) {
    val nav = LocalNav.current
    var q by rememberSaveable { mutableStateOf("") }
    var typed by rememberSaveable { mutableStateOf("") }
    var craft by rememberSaveable { mutableStateOf("") }
    var scope by rememberSaveable { mutableStateOf("") }
    var tag by rememberSaveable { mutableStateOf(presetTag) }
    var pageNum by rememberSaveable { mutableIntStateOf(1) }
    val query = mapOf("q" to q, "craft" to craft, "scope" to scope, "tag" to tag, "page" to pageNum.toString())
    val page = rememberPage("/patterns", query)
    val data by page.data.collectAsState()
    var menu by remember { mutableStateOf(false) }
    var covers by remember { mutableStateOf<Pair<Int, Int>?>(null) }
    val toast = rememberToast()
    val scopeCo = rememberCoroutineScope()

    fun findCovers(ids: List<String>) {
        scopeCo.launch {
            var found = 0
            covers = 0 to ids.size
            for ((i, id) in ids.withIndex()) {
                try {
                    val res = Session.kit.api("POST", "/api/patterns/$id/auto-cover")
                    if (res.objOrNull()?.str("coverPath") != null) found++
                } catch (e: Exception) { }
                covers = (i + 1) to ids.size
            }
            covers = null

            toast(t("patterns.list.coversFound", "found" to found, "n" to ids.size))
        }
    }

    Screen(
        tr("patterns.list.title"),
        onBack = onBack,
        actions = {
            IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, null) }
            DropdownMenu(menu, onDismissRequest = { menu = false }) {
                DropdownMenuItem(text = { Text(tr("patterns.list.import")) }, leadingIcon = { Icon(Icons.Default.UploadFile, null) },
                    onClick = { menu = false; nav.navigate("patterns/import") })
                DropdownMenuItem(text = { Text(tr("patterns.list.tagColors")) }, onClick = { menu = false; nav.navigate("patterns/tags") })
                val missing = data?.strs("missingCovers").orEmpty()
                if (missing.isNotEmpty() && covers == null) {
                    DropdownMenuItem(text = { Text(tr("patterns.list.findCovers", "n" to missing.size)) },
                        onClick = { menu = false; findCovers(missing) })
                }
            }
        },
        fab = {
            ExtendedFloatingActionButton(
                onClick = { nav.navigate("patterns/new" + if (craft.isNotEmpty()) "?craft=$craft" else "") },
                icon = { Icon(Icons.Default.Add, null) },
                text = { Text(tr("patterns.list.new").removePrefix("+ ")) },
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding)) {
            PillSearchField(
                typed, { typed = it },
                placeholder = tr("patterns.list.searchPlaceholder"),
                trailing = {
                    if (typed.isNotEmpty()) IconButton(onClick = { typed = ""; q = ""; pageNum = 1 }) { Icon(Icons.Default.Close, null) }
                },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { q = typed.trim(); pageNum = 1 }),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
            // Type de travail : en pilules, un toucher suffit.
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                RoundChip(tr("patterns.list.allTypes"), craft.isEmpty(), onClick = { craft = ""; pageNum = 1 })
                CRAFTS.forEach { c -> RoundChip(craftLabel(c), craft == c, onClick = { craft = c; pageNum = 1 }) }
            }
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterMenu(
                    when (scope) { "mine" -> tr("patterns.list.mine"); "shared" -> tr("patterns.list.sharedWithMe"); else -> tr("patterns.list.allScope") },
                    scope.isNotEmpty(),
                    listOf("" to tr("patterns.list.allScope"), "mine" to tr("patterns.list.mine"), "shared" to tr("patterns.list.sharedWithMe")),
                ) { scope = it; pageNum = 1 }
                FilterMenu(
                    tag.ifEmpty { tr("patterns.list.allTags") },
                    tag.isNotEmpty(),
                    listOf("" to tr("patterns.list.allTags")) + data?.strs("allTags").orEmpty().map { it to it },
                ) { tag = it; pageNum = 1 }
            }
            covers?.let { (i, n) ->
                LinearProgressIndicator(progress = { if (n == 0) 0f else i / n.toFloat() }, Modifier.fillMaxWidth().padding(16.dp, 4.dp))
                Text(tr("patterns.list.findingCovers", "i" to i, "n" to n), Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.bodySmall)
            }
            PageBody(page) { d ->
                val rows = d.objs("rows")
                val colors = d.obj("tagColors")
                if (rows.isEmpty()) {
                    EmptyState(tr("patterns.list.empty"), emoji = "📄")
                    return@PageBody
                }
                LazyVerticalGrid(
                    columns = GridCells.Adaptive(160.dp),
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    modifier = Modifier.fillMaxSize(),
                ) {
                    item(span = { GridItemSpan(maxLineSpan) }) {
                        Text(tr("patterns.list.count", "n" to (d.int("total") ?: rows.size)),
                            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    items(rows, key = { it.str("id").orEmpty() }) { p ->
                        PatternCard(p, colors, onTag = { tag = it; pageNum = 1 }) { nav.navigate("pattern/${p.str("id")}") }
                    }
                    val pages = d.int("pageCount") ?: 1
                    if (pages > 1) item(span = { GridItemSpan(maxLineSpan) }) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                            TextButton(onClick = { pageNum-- }, enabled = pageNum > 1) { Text("← " + tr("pager.prev")) }
                            Text(tr("pager.status", "page" to pageNum, "pages" to pages), style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = { pageNum++ }, enabled = pageNum < pages) { Text(tr("pager.next") + " →") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun FilterMenu(label: String, active: Boolean, options: List<Pair<String, String>>, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        FilterChip(
            selected = active,
            onClick = { open = true },
            label = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 180.dp)) },
            trailingIcon = { Icon(Icons.Default.ArrowDropDown, null) },
        )
        DropdownMenu(open, onDismissRequest = { open = false }) {
            options.forEach { (v, l) -> DropdownMenuItem(text = { Text(l) }, onClick = { open = false; onPick(v) }) }
        }
    }
}

/** Carte d'un patron : grande couverture arrondie (type, PDF), titre, créatrice, tags. */
@Composable
private fun PatternCard(p: JsonObject, colors: JsonObject?, onTag: (String) -> Unit, onClick: () -> Unit) {
    val cs = MaterialTheme.colorScheme
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).clickable(onClick = onClick).padding(bottom = 4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Box {
            MediaImage(p.str("coverPath"), Modifier.fillMaxWidth().aspectRatio(0.85f).clip(RoundedCornerShape(22.dp)),
                width = 400, placeholder = "📄")
            Row(Modifier.align(Alignment.TopStart).padding(8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                if (p.bool("hasFile")) Pill(tr("patterns.list.hasPdf"), container = cs.inverseSurface, content = cs.inverseOnSurface)
                if (p.bool("hasLink")) Pill(tr("patterns.list.hasLink"), container = cs.inverseSurface, content = cs.inverseOnSurface)
            }
            Pill(craftLabel(p.str("craft")), Modifier.align(Alignment.BottomStart).padding(8.dp),
                container = cs.surface.copy(alpha = 0.92f), content = cs.onSurface)
        }
        Column(Modifier.padding(horizontal = 4.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(p.str("title").orEmpty(), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.ExtraBold,
                maxLines = 2, overflow = TextOverflow.Ellipsis)
            val sub = listOfNotNull(p.str("designer"), p.str("garmentType"), difficultyLabel(p.int("difficulty")).ifEmpty { null })
                .filter { it.isNotBlank() }.joinToString(" · ")
            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.labelMedium, color = cs.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (!p.bool("mine")) Text(tr("patterns.list.sharedBy", "name" to p.str("ownerName")), style = MaterialTheme.typography.labelSmall,
                color = cs.primary, fontWeight = FontWeight.Bold)
            else if (p.bool("isShared")) Text(tr("patterns.list.shared"), style = MaterialTheme.typography.labelSmall,
                color = cs.primary, fontWeight = FontWeight.Bold)
            val tags = p.strs("tags")
            if (tags.isNotEmpty()) ChipRow { tags.take(3).forEach { TagChip(it, colors) { onTag(it) } } }
        }
    }
}
