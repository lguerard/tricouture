package app.tricouture.ui.components

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color as AColor
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.calculatePan
import androidx.compose.foundation.gestures.calculateZoom
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import app.tricouture.data.Session
import app.tricouture.data.tr
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.Request
import java.io.File
import java.security.MessageDigest

/** Télécharge un fichier du site dans le cache (une fois), pour l'afficher ou le partager. */
suspend fun downloadMedia(context: Context, path: String, ext: String): File = withContext(Dispatchers.IO) {
    val url = Session.kit.media(path) ?: error("pas d'adresse")
    val name = MessageDigest.getInstance("SHA-1").digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
    val dir = File(context.cacheDir, "media").apply { mkdirs() }
    val file = File(dir, "$name.$ext")
    if (file.exists() && file.length() > 0) return@withContext file
    val res = Session.kit.raw(Request.Builder().url(url).get().build())
    res.use { r ->
        if (!r.isSuccessful) error("Erreur ${r.code}")
        val tmp = File(dir, "$name.part")
        r.body!!.byteStream().use { input -> tmp.outputStream().use { input.copyTo(it) } }
        tmp.renameTo(file)
    }
    file
}

/**
 * PDF d'un patron, page par page (rendu Android, sans bibliothèque) :
 * défilement vertical, pincer pour zoomer.
 */
@Composable
fun PdfPages(path: String, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var renderer by remember(path) { mutableStateOf<PdfRenderer?>(null) }
    var error by remember(path) { mutableStateOf<String?>(null) }
    val lock = remember { Mutex() }

    LaunchedEffect(path) {
        try {
            val file = downloadMedia(context, path, "pdf")
            renderer = withContext(Dispatchers.IO) {
                PdfRenderer(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY))
            }
        } catch (e: Exception) {
            error = e.message ?: e.toString()
        }
    }
    DisposableEffect(path) { onDispose { runCatching { renderer?.close() } } }

    val r = renderer
    when {
        error != null -> Text(error!!, color = MaterialTheme.colorScheme.error, modifier = modifier.padding(16.dp))
        r == null -> Box(modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        else -> {
            var scale by remember { mutableFloatStateOf(1f) }
            var offsetX by remember { mutableFloatStateOf(0f) }
            val state = rememberLazyListState()
            BoxWithConstraints(modifier) {
                val widthPx = constraints.maxWidth.coerceAtLeast(600)
                LazyColumn(
                    state = state,
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .pointerInput(Unit) {
                            // Pincer à deux doigts pour zoomer ; un doigt fait
                            // défiler (et glisser de côté une fois zoomé).
                            awaitEachGesture {
                                awaitFirstDown(requireUnconsumed = false)
                                do {
                                    val event = awaitPointerEvent()
                                    val pressed = event.changes.count { it.pressed }
                                    if (pressed >= 2) {
                                        scale = (scale * event.calculateZoom()).coerceIn(1f, 5f)
                                        val max = (scale - 1f) * size.width / 2f
                                        offsetX = (offsetX + event.calculatePan().x).coerceIn(-max, max)
                                        event.changes.forEach { it.consume() }
                                    } else if (pressed == 1 && scale > 1f) {
                                        val max = (scale - 1f) * size.width / 2f
                                        offsetX = (offsetX + event.calculatePan().x).coerceIn(-max, max)
                                    }
                                } while (event.changes.any { it.pressed })
                            }
                        }
                        .graphicsLayer(scaleX = scale, scaleY = scale, translationX = offsetX),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                    contentPadding = PaddingValues(6.dp),
                ) {
                    items(r.pageCount) { index ->
                        PdfPage(r, index, widthPx, lock)
                    }
                }
                Text(
                    tr("app.pdfPages", "n" to r.pageCount),
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(8.dp)
                        .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.8f)).padding(horizontal = 6.dp, vertical = 2.dp),
                )
            }
        }
    }
}

@Composable
private fun PdfPage(renderer: PdfRenderer, index: Int, widthPx: Int, lock: Mutex) {
    var bitmap by remember(index) { mutableStateOf<Bitmap?>(null) }
    var ratio by remember(index) { mutableFloatStateOf(1.414f) }
    LaunchedEffect(index, widthPx) {
        bitmap = withContext(Dispatchers.IO) {
            // Un seul rendu à la fois : PdfRenderer n'ouvre qu'une page à la fois.
            lock.withLock {
                renderer.openPage(index).use { page ->
                    ratio = page.height.toFloat() / page.width
                    // Résolution doublée : le zoom reste net.
                    val w = (widthPx * 2).coerceAtMost(2400)
                    val h = (w * ratio).toInt()
                    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
                    bmp.eraseColor(AColor.WHITE)
                    page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bmp
                }
            }
        }
    }
    val b = bitmap
    if (b == null) {
        Box(Modifier.fillMaxWidth().aspectRatio(1f / ratio).background(androidx.compose.ui.graphics.Color.White))
    } else {
        Image(b.asImageBitmap(), null, Modifier.fillMaxWidth().aspectRatio(b.width.toFloat() / b.height), contentScale = ContentScale.FillWidth)
    }
}
