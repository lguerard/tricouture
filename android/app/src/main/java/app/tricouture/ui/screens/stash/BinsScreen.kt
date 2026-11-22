package app.tricouture.ui.screens.stash

import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*

/** Bacs de rangement, chacun avec son QR code à imprimer et coller dessus. */
@Composable
fun BinsScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/bins")
    val toast = rememberToast()
    var label by remember { mutableStateOf("") }
    var location by remember { mutableStateOf("") }
    var deleting by remember { mutableStateOf<String?>(null) }
    Screen(tr("bins.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                item {
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedTextField(label, { label = it }, label = { Text(tr("bins.labelName")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            OutlinedTextField(location, { location = it }, label = { Text(tr("bins.labelLocation")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                            Button(onClick = {
                                page.submit(action = "add", fields = listOf("label" to label.trim(), "location" to location.trim()), onError = toast) {
                                    if (it.ok) { label = ""; location = "" }
                                }
                            }, enabled = label.isNotBlank()) { Text(tr("bins.create")) }
                        }
                    }
                }
                val bins = d.objs("bins")
                if (bins.isEmpty()) item { EmptyState(tr("bins.subtitle"), emoji = "📦") }
                items(bins, key = { it.str("id").orEmpty() }) { b ->
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            val qr = b.str("qrDataUrl")?.substringAfter("base64,", "")?.let {
                                runCatching { Base64.decode(it, Base64.DEFAULT) }.getOrNull()
                            }?.let { android.graphics.BitmapFactory.decodeByteArray(it, 0, it.size) }
                            if (qr != null) Image(qr.asImageBitmap(), null, Modifier.size(88.dp))
                            Column(Modifier.weight(1f)) {
                                Text(b.str("label").orEmpty(), style = MaterialTheme.typography.titleMedium)
                                b.str("location")?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                Text(tr(if ((b.int("itemCount") ?: 0) > 1) "bins.itemsMany" else "bins.itemsOne", "n" to (b.int("itemCount") ?: 0)), style = MaterialTheme.typography.bodySmall)
                                Text(b.str("qrCode").orEmpty(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            IconButton(onClick = { deleting = b.str("id") }) { Icon(Icons.Default.Delete, tr("app.delete")) }
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
