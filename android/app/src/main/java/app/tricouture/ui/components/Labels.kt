package app.tricouture.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.tricouture.data.str
import app.tricouture.data.tr
import com.google.gson.JsonObject

// Libellés et pastilles communs (équivalents de $lib/labels et $lib/tagColor).

val CRAFTS = listOf("couture", "tricot", "crochet")
val PROJECT_STATUSES = listOf("idee", "monte", "bloque", "fini")
val PIECE_STATUSES = listOf("a_couper", "coupe", "cousu", "fini")
val YARN_WEIGHTS = listOf("lace", "fingering", "sport", "dk", "worsted", "aran", "bulky", "super-bulky")
val MOTIFS = listOf("solid", "stripes", "floral", "dots", "chevron", "plaid", "jacquard", "animal", "geometric", "print", "other")
val TOOL_TYPES = listOf("aiguille_droite", "aiguille_circulaire", "aiguille_double_pointe", "crochet", "autre")

@Composable fun craftLabel(craft: String?) = if (craft.isNullOrEmpty()) "" else tr("craft.$craft")
@Composable fun statusLabel(status: String?) = if (status.isNullOrEmpty()) "" else tr("status.$status")
@Composable fun difficultyLabel(level: Int?) = if (level == null || level <= 0) "" else tr("difficulty.$level")
@Composable fun pieceStatusLabel(s: String?) = if (s.isNullOrEmpty()) "" else tr("pieceStatus.$s")

fun craftEmoji(craft: String?) = when (craft) {
    "couture" -> "🧵"
    "tricot" -> "🧶"
    "crochet" -> "🪝"
    else -> "📄"
}

/** Couleur d'un tag : celle attribuée par le site, ou la même règle de secours. */
data class TagColor(val bg: Color, val fg: Color)

private val PALETTE = listOf(
    "#ece1ef" to "#7e3597", "#efe1ee" to "#97358f", "#efe1e9" to "#97356e", "#efe1e4" to "#97354e",
    "#efe2e1" to "#973d35", "#efe7e1" to "#975e35", "#efece1" to "#977e35", "#eeefe1" to "#8f9735",
    "#e9efe1" to "#6e9735", "#e4efe1" to "#4e9735", "#e1efe2" to "#35973d", "#e1efe7" to "#35975e",
    "#e1efec" to "#35977e", "#e1eeef" to "#358f97", "#e1e9ef" to "#356e97", "#e1e4ef" to "#354e97",
    "#e2e1ef" to "#3d3597", "#e7e1ef" to "#5e3597", "#dec6e7" to "#68257e", "#e7c6e4" to "#7e2577",
    "#e7c6d9" to "#7e2559", "#e7c6ce" to "#7e253b", "#e7c9c6" to "#7e2c25", "#e7d3c6" to "#7e4a25",
    "#e7dec6" to "#7e6825", "#e4e7c6" to "#777e25", "#d9e7c6" to "#597e25", "#cee7c6" to "#3b7e25",
    "#c6e7c9" to "#257e2c", "#c6e7d3" to "#257e4a", "#c6e7de" to "#257e68", "#c6e4e7" to "#25777e",
    "#c6d9e7" to "#25597e", "#c6cee7" to "#253b7e", "#c9c6e7" to "#2c257e", "#d3c6e7" to "#4a257e",
)

fun hexColor(hex: String?, fallback: Color = Color.Gray): Color = try {
    val h = hex?.trim()?.removePrefix("#") ?: return fallback
    when (h.length) {
        6 -> Color(0xFF000000 or h.toLong(16))
        3 -> Color(0xFF000000 or "${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}".toLong(16))
        else -> fallback
    }
} catch (e: Exception) {
    fallback
}

private fun fnv1a(s: String): Long {
    var hash = 0x811c9dc5L
    for (ch in s) {
        hash = hash xor ch.code.toLong()
        hash = (hash * 0x01000193L) and 0xFFFFFFFFL
    }
    return hash
}

fun tagColor(tag: String, colors: JsonObject?): TagColor {
    val c = colors?.get(tag)?.takeIf { it.isJsonObject }?.asJsonObject
    if (c != null) return TagColor(hexColor(c.str("bg")), hexColor(c.str("fg")))
    val (bg, fg) = PALETTE[(fnv1a(tag) % PALETTE.size).toInt()]
    return TagColor(hexColor(bg), hexColor(fg))
}

/** Pastille de tag, aux couleurs du site. */
@Composable
fun TagChip(tag: String, colors: JsonObject?, onClick: (() -> Unit)? = null) {
    val c = tagColor(tag, colors)
    Text(
        tag,
        color = c.fg,
        style = MaterialTheme.typography.labelMedium,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(c.bg)
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/** Petite étiquette neutre (type de travail, statut…). */
@Composable
fun Pill(text: String, modifier: Modifier = Modifier, container: Color = MaterialTheme.colorScheme.secondaryContainer, content: Color = MaterialTheme.colorScheme.onSecondaryContainer) {
    Text(
        text,
        color = content,
        style = MaterialTheme.typography.labelMedium,
        maxLines = 1,
        modifier = modifier
            .clip(RoundedCornerShape(50))
            .background(container)
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/** Rangée de pastilles qui passe à la ligne. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ChipRow(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    FlowRow(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        content()
    }
}

/** Menu déroulant simple (valeur → libellé), comme un <select> du site. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelectField(
    label: String,
    value: String,
    options: List<Pair<String, String>>,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = open, onExpandedChange = { open = it }, modifier = modifier) {
        OutlinedTextField(
            value = options.firstOrNull { it.first == value }?.second ?: value,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(open) },
            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
            singleLine = true,
        )
        ExposedDropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            options.forEach { (v, l) ->
                DropdownMenuItem(text = { Text(l) }, onClick = { onChange(v); open = false })
            }
        }
    }
}
