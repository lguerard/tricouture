package app.tricouture.ui.screens.more

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Brush
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.FileProvider
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import com.google.gson.JsonObject
import kotlinx.coroutines.launch
import java.io.File

/**
 * Écussons brodés : la bibliothèque est native (aperçu, envoi du .pes vers
 * Artspira, renommer, supprimer). L'éditeur, qui transforme une image ou un
 * texte en points de broderie dans le navigateur, s'ouvre dans une vue web
 * intégrée, déjà connectée ; chaque écusson y est enregistré dans la
 * bibliothèque automatiquement.
 */
@Composable
fun EmbroideryScreen() {
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val page = rememberPage("/embroidery")
    val toast = rememberToast()
    var renaming by remember { mutableStateOf<JsonObject?>(null) }
    var deleting by remember { mutableStateOf<JsonObject?>(null) }

    fun sharePes(d: JsonObject) {
        scope.launch {
            try {
                val cached = downloadMedia(context, d.str("pesPath").orEmpty(), "pes")
                // Nom lisible pour la machine et Artspira : ASCII, sans espaces.
                val name = java.text.Normalizer.normalize(d.str("title").orEmpty(), java.text.Normalizer.Form.NFD)
                    .replace(Regex("[^A-Za-z0-9_-]+"), "_").trim('_').take(40).ifEmpty { "ecusson" }
                val dir = File(context.cacheDir, "shared").apply { mkdirs() }
                val file = File(dir, "$name.pes").also { cached.copyTo(it, overwrite = true) }
                val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
                val send = Intent(Intent.ACTION_SEND).setType("application/octet-stream").putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                context.startActivity(Intent.createChooser(send, d.str("title")))
            } catch (e: Exception) {
                toast(t("embroidery.errorShare"))
            }
        }
    }

    Screen(tr("embroidery.title"), onBack = { nav.popBackStack() }, fab = {
        ExtendedFloatingActionButton(onClick = { nav.navigate("embroidery/editor") }, icon = { Icon(Icons.Default.Brush, null) },
            text = { Text(tr("embroidery.title")) })
    }) { padding ->
        PageBody(page, Modifier.padding(padding)) { data ->
            val designs = data.objs("designs")
            LazyColumn(contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item { Text(tr("embroidery.library"), style = MaterialTheme.typography.titleMedium) }
                if (designs.isEmpty()) item { EmptyState(tr("embroidery.libraryEmpty"), emoji = "🪡") }
                items(designs, key = { it.str("id").orEmpty() }) { d ->
                    var menu by remember { mutableStateOf(false) }
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            MediaImage(d.str("previewPath"), Modifier.size(84.dp).clip(RoundedCornerShape(8.dp)), width = 200, placeholder = "🪡")
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(d.str("title").orEmpty(), style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                Text(tr("embroidery.libraryMeta", "w" to Math.round(d.double("widthMm") ?: 0.0), "h" to Math.round(d.double("heightMm") ?: 0.0),
                                    "n" to (d.int("stitchCount") ?: 0), "date" to formatDate(d.str("updatedAt"))),
                                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                                    d.arr("threads").mapNotNull { runCatching { it.asInt }.getOrNull() }.distinct().take(12).forEach { i ->
                                        Box(Modifier.size(12.dp).clip(CircleShape).background(Color(PEC_THREAD_COLORS[i] ?: 0xFF888888)))
                                    }
                                }
                                FilledTonalButton(onClick = { sharePes(d) }) { Text("📤 " + tr("embroidery.share")) }
                            }
                            Box {
                                IconButton(onClick = { menu = true }) { Icon(Icons.Default.MoreVert, null) }
                                DropdownMenu(menu, onDismissRequest = { menu = false }) {
                                    // Un écusson importé (.pes fait ailleurs) n'a pas d'image à retravailler.
                                    if (d.str("source") != "import") DropdownMenuItem(text = { Text(tr("embroidery.edit")) }, onClick = {
                                        menu = false; nav.navigate("embroidery/editor?edit=${d.str("id")}")
                                    })
                                    DropdownMenuItem(text = { Text(tr("embroidery.rename")) }, onClick = { menu = false; renaming = d })
                                    DropdownMenuItem(text = { Text(tr("embroidery.delete"), color = MaterialTheme.colorScheme.error) },
                                        onClick = { menu = false; deleting = d })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    renaming?.let { d ->
        var title by remember(d) { mutableStateOf(d.str("title").orEmpty()) }
        AlertDialog(
            onDismissRequest = { renaming = null },
            title = { Text(tr("embroidery.rename")) },
            text = { OutlinedTextField(title, { title = it.take(200) }, label = { Text(tr("embroidery.renamePrompt")) }, singleLine = true) },
            confirmButton = {
                TextButton(onClick = {
                    renaming = null
                    page.run(onError = toast) {
                        Session.kit.api("PATCH", "/api/embroidery/${d.str("id")}", JsonObject().apply { addProperty("title", title.trim()) })
                    }
                }, enabled = title.isNotBlank()) { Text(tr("app.save")) }
            },
            dismissButton = { TextButton(onClick = { renaming = null }) { Text(tr("app.cancel")) } },
        )
    }
    deleting?.let { d ->
        ConfirmDialog(tr("embroidery.confirmDelete", "title" to d.str("title")), onConfirm = {
            page.run(onError = toast) {
                Session.kit.api("DELETE", "/api/embroidery/${d.str("id")}")
                toast(t("embroidery.deleted"))
            }
        }, onDismiss = { deleting = null })
    }
}

/** L'éditeur d'écussons du site, dans une vue web connectée avec la session de l'appli. */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun EmbroideryEditorScreen(edit: String) {
    val nav = LocalNav.current
    val server by Session.server.collectAsState()
    val token by Session.token.collectAsState()
    val locale by Session.locale.collectAsState()
    var pending by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    val chooser = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        pending?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res.resultCode, res.data))
        pending = null
    }
    DisposableEffect(Unit) { onDispose { Session.changed() } } // la bibliothèque se recharge en revenant
    Screen(tr("embroidery.title"), onBack = { nav.popBackStack() }) { padding ->
        AndroidView(
            modifier = Modifier.padding(padding).fillMaxSize(),
            factory = { ctx ->
                val cookies = CookieManager.getInstance()
                cookies.setAcceptCookie(true)
                cookies.setCookie(server, "session=$token; path=/")
                cookies.setCookie(server, "locale=$locale; path=/")
                cookies.flush()
                WebView(ctx).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    webViewClient = object : WebViewClient() {
                        // Les liens qui sortent de l'éditeur s'ouvrent dans le navigateur.
                        override fun shouldOverrideUrlLoading(view: WebView, request: android.webkit.WebResourceRequest): Boolean {
                            val url = request.url
                            if (url.toString().startsWith(server) && url.path?.startsWith("/embroidery") == true) return false
                            if (url.toString().startsWith(server)) { nav.popBackStack(); return true }
                            openUrl(ctx, url.toString())
                            return true
                        }
                    }
                    webChromeClient = object : WebChromeClient() {
                        override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                            pending?.onReceiveValue(null)
                            pending = callback
                            return try { chooser.launch(params.createIntent()); true } catch (e: Exception) { pending = null; false }
                        }
                    }
                    loadUrl("$server/embroidery" + if (edit.isNotEmpty()) "?edit=$edit" else "")
                }
            },
        )
    }
}
