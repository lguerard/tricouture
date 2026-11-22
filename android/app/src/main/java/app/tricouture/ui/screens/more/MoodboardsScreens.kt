package app.tricouture.ui.screens.more

import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.Routes
import app.tricouture.ui.components.*
import app.tricouture.ui.screens.projects.PhotoViewer
import app.tricouture.ui.screens.projects.SectionCard
import kotlinx.coroutines.launch

/** Planches d'inspiration : mosaïque des dernières images de chaque planche. */
@Composable
fun MoodboardsScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/moodboards")
    val toast = rememberToast()
    var title by remember { mutableStateOf("") }
    Screen(tr("moodboards.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            LazyVerticalGrid(
                columns = GridCells.Adaptive(160.dp),
                contentPadding = PaddingValues(12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                item(span = { GridItemSpan(maxLineSpan) }) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(tr("moodboards.subtitle"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(title, { title = it }, placeholder = { Text(tr("moodboards.newPlaceholder")) }, singleLine = true,
                                modifier = Modifier.weight(1f))
                            Button(onClick = {
                                page.submit(action = "create", fields = listOf("title" to title.trim()), onError = toast) { res ->
                                    title = ""
                                    if (res is ActionResult.Redirect) Routes.fromSitePath(res.location)?.let { nav.navigate(it) }
                                }
                            }, enabled = title.isNotBlank()) { Text(tr("moodboards.create")) }
                        }
                    }
                }
                val boards = d.objs("boards")
                if (boards.isEmpty()) item(span = { GridItemSpan(maxLineSpan) }) { EmptyState(tr("moodboards.empty"), emoji = "🎨") }
                items(boards) { b ->
                    ElevatedCard(onClick = { nav.navigate("moodboards/${b.str("id")}") }) {
                        val previews = b.strs("previews")
                        Box(Modifier.fillMaxWidth().aspectRatio(1f).background(MaterialTheme.colorScheme.surfaceVariant)) {
                            if (previews.isEmpty()) Text("🎨", Modifier.align(Alignment.Center), style = MaterialTheme.typography.headlineMedium)
                            else Column {
                                previews.chunked(2).forEach { row ->
                                    Row(Modifier.weight(1f)) {
                                        row.forEach { p -> MediaImage(p, Modifier.weight(1f).fillMaxHeight(), width = 200) }
                                        if (row.size == 1 && previews.size > 1) Spacer(Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                        Column(Modifier.padding(8.dp)) {
                            Text(b.str("title").orEmpty(), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(tr("moodboards.itemCount", "n" to (b.int("itemCount") ?: 0)), style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

/** Une planche : images, liens et notes, avec la palette extraite de chaque image. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun MoodboardScreen(id: String) {
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val clipboard = LocalClipboardManager.current
    val page = rememberPage("/moodboards/$id")
    val data by page.data.collectAsState()
    val toast = rememberToast()
    var renaming by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var viewing by remember { mutableStateOf<String?>(null) }
    val board = data?.obj("board")
    Screen(board?.str("title") ?: tr("moodboards.title"), onBack = { nav.popBackStack() }, actions = {
        IconButton(onClick = { renaming = true }) { Icon(Icons.Default.Edit, tr("moodboards.rename")) }
        IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Default.Delete, tr("moodboards.delete")) }
    }, fab = {
        if (!adding) FloatingActionButton(onClick = { adding = true }) { Icon(Icons.Default.Add, tr("moodboards.add")) }
    }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            LazyVerticalGrid(
                columns = GridCells.Adaptive(160.dp),
                contentPadding = PaddingValues(12.dp, 12.dp, 12.dp, 96.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (renaming) item(span = { GridItemSpan(maxLineSpan) }) {
                    var title by remember { mutableStateOf(d.obj("board")?.str("title").orEmpty()) }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(title, { title = it.take(200) }, singleLine = true, modifier = Modifier.weight(1f))
                        Button(onClick = {
                            page.submit(action = "rename", fields = listOf("title" to title.trim()), onError = toast) { if (it.ok) renaming = false }
                        }, enabled = title.isNotBlank()) { Text(tr("moodboards.save")) }
                    }
                }
                if (adding) item(span = { GridItemSpan(maxLineSpan) }) {
                    var images by remember { mutableStateOf<List<Uri>>(emptyList()) }
                    var link by remember { mutableStateOf("") }
                    var note by remember { mutableStateOf("") }
                    val pick = rememberMultiFilePicker { images = images + it }
                    val camera = rememberCamera(context) { images = images + it }
                    SectionCard(tr("moodboards.addTitle")) {
                        Text(tr("moodboards.images"), style = MaterialTheme.typography.labelLarge)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            images.forEach { u ->
                                Box {
                                    coil.compose.AsyncImage(u, null, Modifier.size(72.dp).clip(RoundedCornerShape(6.dp)),
                                        contentScale = androidx.compose.ui.layout.ContentScale.Crop)
                                    Icon(Icons.Default.Close, null, Modifier.align(Alignment.TopEnd).clickable { images = images - u }
                                        .background(MaterialTheme.colorScheme.surface, CircleShape))
                                }
                            }
                        }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { pick(arrayOf("image/*")) }) { Text(tr("app.choosePhoto")) }
                            OutlinedButton(onClick = camera) { Text(tr("app.takePhoto")) }
                        }
                        OutlinedTextField(link, { link = it }, label = { Text(tr("moodboards.link")) }, placeholder = { Text("https://…") },
                            singleLine = true, modifier = Modifier.fillMaxWidth())
                        OutlinedTextField(note, { note = it.take(2000) }, label = { Text(tr("moodboards.note")) },
                            placeholder = { Text(tr("moodboards.notePlaceholder")) }, minLines = 2, modifier = Modifier.fillMaxWidth())
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = { adding = false }) { Text(tr("moodboards.cancel")) }
                            Button(onClick = {
                                scope.launch {
                                    val files = images.map { readPickedImage(context, it, "images") }
                                    page.submit(action = "addItem", fields = listOf("sourceUrl" to link.trim(), "note" to note.trim()), files = files,
                                        onError = toast) { if (it.ok) adding = false }
                                }
                            }, enabled = images.isNotEmpty() || link.isNotBlank() || note.isNotBlank()) { Text(tr("moodboards.add")) }
                        }
                    }
                }
                val items = d.objs("items")
                if (items.isEmpty() && !adding) item(span = { GridItemSpan(maxLineSpan) }) { EmptyState(tr("moodboards.emptyBoard"), emoji = "🎨") }
                items(items) { item ->
                    OutlinedCard {
                        item.str("imagePath")?.let { path ->
                            MediaImage(path, Modifier.fillMaxWidth().aspectRatio(1f).clickable { viewing = path }, width = 400)
                        }
                        Column(Modifier.padding(8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            val palette = item.strs("palette")
                            if (palette.isNotEmpty()) Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                palette.forEach { hex ->
                                    Box(Modifier.size(22.dp).clip(CircleShape).background(hexColor(hex)).clickable {
                                        clipboard.setText(AnnotatedString(hex)); toast(t("moodboards.copied", "hex" to hex))
                                    })
                                }
                            }
                            item.str("note")?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
                            item.str("sourceUrl")?.let { url ->
                                Text(Uri.parse(url).host ?: url, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodySmall,
                                    maxLines = 1, modifier = Modifier.clickable { openUrl(context, url) })
                            }
                            TextButton(onClick = {
                                page.submit(action = "deleteItem", fields = listOf("itemId" to item.str("id").orEmpty()), onError = toast)
                            }) { Text(tr("moodboards.deleteItem"), color = MaterialTheme.colorScheme.error) }
                        }
                    }
                }
            }
        }
    }
    if (confirmDelete) ConfirmDialog(tr("app.confirmDelete"), onConfirm = {
        page.submit(path = "/moodboards", action = "delete", fields = listOf("id" to id), onError = toast) { if (it.ok) nav.popBackStack() }
    }, onDismiss = { confirmDelete = false })
    viewing?.let { PhotoViewer(it) { viewing = null } }
}
