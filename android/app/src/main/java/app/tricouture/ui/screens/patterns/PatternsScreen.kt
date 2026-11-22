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
            OutlinedTextField(
                typed, { typed = it },
                placeholder = { Text(tr("patterns.list.searchPlaceholder"), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                leadingIcon = { Icon(Icons.Default.Search, null) },
                trailingIcon = {
                    if (typed.isNotEmpty()) IconButton(onClick = { typed = ""; q = ""; pageNum = 1 }) { Icon(Icons.Default.Close, null) }
                },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { q = typed.trim(); pageNum = 1 }),
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
            )
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterMenu(
                    if (craft.isEmpty()) tr("patterns.list.allTypes") else craftLabel(craft),
                    craft.isNotEmpty(),
                    listOf("" to tr("patterns.list.allTypes")) + CRAFTS.map { it to craftLabel(it) },
                ) { craft = it; pageNum = 1 }
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
                    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 8.dp, bottom = 96.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
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

@Composable
private fun PatternCard(p: JsonObject, colors: JsonObject?, onTag: (String) -> Unit, onClick: () -> Unit) {
    ElevatedCard(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        MediaImage(p.str("coverPath"), Modifier.fillMaxWidth().aspectRatio(0.8f), width = 400, placeholder = "📄")
        Column(Modifier.padding(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(p.str("title").orEmpty(), style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
            ChipRow {
                Pill(craftLabel(p.str("craft")))
                if (p.bool("hasFile")) Pill(tr("patterns.list.hasPdf"), container = MaterialTheme.colorScheme.tertiaryContainer,
                    content = MaterialTheme.colorScheme.onTertiaryContainer)
                if (p.bool("hasLink")) Pill(tr("patterns.list.hasLink"), container = MaterialTheme.colorScheme.tertiaryContainer,
                    content = MaterialTheme.colorScheme.onTertiaryContainer)
            }
            if (!p.bool("mine")) Text(tr("patterns.list.sharedBy", "name" to p.str("ownerName")), style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary)
            else if (p.bool("isShared")) Text(tr("patterns.list.shared"), style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary)
            val sub = listOfNotNull(p.str("garmentType"), p.str("designer")).filter { it.isNotBlank() }.joinToString(" · ")
            if (sub.isNotEmpty()) Text(sub, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1, overflow = TextOverflow.Ellipsis)
            val diff = difficultyLabel(p.int("difficulty"))
            if (diff.isNotEmpty()) Text(diff, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            val tags = p.strs("tags")
            if (tags.isNotEmpty()) ChipRow { tags.forEach { TagChip(it, colors) { onTag(it) } } }
        }
    }
}
