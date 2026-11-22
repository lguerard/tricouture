package app.tricouture.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.core.content.FileProvider
import app.tricouture.data.FilePart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** Ouvre un fichier téléchargé dans une autre appli (lecteur PDF, galerie…). */
fun openExternally(context: Context, file: File, mime: String) {
    val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
    val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    try {
        context.startActivity(Intent.createChooser(intent, null))
    } catch (e: ActivityNotFoundException) {
    }
}

/** Ouvre une adresse web dans le navigateur. */
fun openUrl(context: Context, url: String) {
    try {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
    } catch (e: ActivityNotFoundException) {
    }
}

/** Lit un fichier choisi par la personne (sélecteur Android) pour l'envoyer au site. */
suspend fun readPicked(context: Context, uri: Uri, field: String = "file"): FilePart = withContext(Dispatchers.IO) {
    val resolver = context.contentResolver
    var name = "fichier"
    resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0)?.let { name = it }
    }
    val mime = resolver.getType(uri) ?: when {
        name.endsWith(".pdf", true) -> "application/pdf"
        name.endsWith(".png", true) -> "image/png"
        else -> "image/jpeg"
    }
    val bytes = resolver.openInputStream(uri)!!.use { it.readBytes() }
    FilePart(field, name, mime, bytes)
}

/** Sélecteur de fichiers (types MIME acceptés, ex. PDF ou images). */
@Composable
fun rememberFilePicker(onPicked: (Uri) -> Unit): (Array<String>) -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> if (uri != null) onPicked(uri) }
    return { types -> launcher.launch(types) }
}

/** Sélecteur de plusieurs fichiers. */
@Composable
fun rememberMultiFilePicker(onPicked: (List<Uri>) -> Unit): (Array<String>) -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> if (uris.isNotEmpty()) onPicked(uris) }
    return { types -> launcher.launch(types) }
}

/** Photo prise avec l'appareil, enregistrée dans le cache. */
@Composable
fun rememberCamera(context: Context, onShot: (Uri) -> Unit): () -> Unit {
    val pending = androidx.compose.runtime.saveable.rememberSaveable { arrayOf<String?>(null) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { ok ->
        if (ok) pending[0]?.let { onShot(Uri.parse(it)) }
    }
    return {
        val dir = File(context.cacheDir, "shared").apply { mkdirs() }
        val file = File(dir, "photo-${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
        pending[0] = uri.toString()
        launcher.launch(uri)
    }
}

/**
 * Photo choisie ou prise, réduite (côté le plus long ≤ `maxDim`) et
 * recompressée en JPEG avant l'envoi : une photo de téléphone pèse souvent
 * plusieurs Mo pour rien.
 */
suspend fun readPickedImage(context: Context, uri: Uri, field: String, maxDim: Int = 2048): FilePart = withContext(Dispatchers.IO) {
    val resolver = context.contentResolver
    val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)!!.use { android.graphics.BitmapFactory.decodeStream(it, null, bounds) }
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= maxDim || bounds.outHeight / (sample * 2) >= maxDim) sample *= 2
    val opts = android.graphics.BitmapFactory.Options().apply { inSampleSize = sample }
    val decoded = resolver.openInputStream(uri)!!.use { android.graphics.BitmapFactory.decodeStream(it, null, opts) }
        ?: return@withContext readPicked(context, uri, field)
    // Orientation EXIF : sans elle, une photo prise en portrait arrive couchée.
    val rotation = try {
        resolver.openInputStream(uri)!!.use { input ->
            when (androidx.exifinterface.media.ExifInterface(input).getAttributeInt(
                androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION, androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL)) {
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90 -> 90f
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180 -> 180f
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270 -> 270f
                else -> 0f
            }
        }
    } catch (e: Exception) { 0f }
    val scale = minOf(1f, maxDim.toFloat() / maxOf(decoded.width, decoded.height))
    val matrix = android.graphics.Matrix().apply { postScale(scale, scale); postRotate(rotation) }
    val bmp = android.graphics.Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true)
    val out = java.io.ByteArrayOutputStream()
    bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
    FilePart(field, "photo-${System.currentTimeMillis()}.jpg", "image/jpeg", out.toByteArray())
}

/** Dictée (reconnaissance vocale d'Android) : renvoie le texte entendu. */
@Composable
fun rememberSpeech(onText: (String) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val text = res.data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        onText(text.orEmpty())
    }
    return {
        val intent = Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, if (app.tricouture.data.Session.locale.value == "fr") "fr-FR" else "en-US")
        try { launcher.launch(intent) } catch (e: ActivityNotFoundException) { onText("") }
    }
}
