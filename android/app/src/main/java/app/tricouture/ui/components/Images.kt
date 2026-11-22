package app.tricouture.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import app.tricouture.data.Session
import coil.compose.SubcomposeAsyncImage

/** Image du site (chemin de /media), ou un emoji à la place s'il n'y en a pas. */
@Composable
fun MediaImage(
    path: String?,
    modifier: Modifier = Modifier,
    width: Int? = 480,
    placeholder: String = "🧶",
    contentScale: ContentScale = ContentScale.Crop,
    contentDescription: String? = null,
) {
    val url = Session.kit.media(path, width)
    if (url == null) {
        Box(modifier.background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            Text(placeholder, style = MaterialTheme.typography.headlineMedium)
        }
        return
    }
    SubcomposeAsyncImage(
        model = url,
        contentDescription = contentDescription,
        contentScale = contentScale,
        modifier = modifier,
        error = {
            Box(Modifier.background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
                Text(placeholder, style = MaterialTheme.typography.headlineMedium)
            }
        },
    )
}
