package app.tricouture.ui.screens.projects

import android.app.Activity
import android.view.WindowManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import java.util.Locale

/**
 * Mode focus du compteur : plein écran sombre, le rang en très gros dans un
 * anneau de progression, la moitié basse est un seul bouton « +1 rang ».
 * L'écran reste allumé.
 */
@Composable
fun ProjectFocusScreen(id: String) {
    val nav = LocalNav.current
    val page = rememberPage("/projects/$id")
    val data by page.data.collectAsState()
    val toast = rememberToast()
    val hero = heroColors()
    val context = LocalContext.current

    DisposableEffect(Unit) {
        val window = (context as? Activity)?.window
        window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose { window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    val p = data?.obj("project")
    val readOnly = data?.str("access") == "view"
    fun step(delta: Int) {
        if (readOnly) return
        // Affichage immédiat, le site confirme ensuite.
        page.patch { d ->
            d.obj("project")?.let { pr ->
                val row = ((pr.int("currentRow") ?: 0) + delta).coerceAtLeast(0)
                pr.addProperty("currentRow", row)
                val total = pr.int("totalRows")
                if (total != null && total > 0) pr.addProperty("progressPct", (row * 100 / total).coerceIn(0, 100))
            }
        }
        page.submit(action = "row", fields = listOf("delta" to delta.toString()), onError = toast)
    }
    var heard by remember { mutableStateOf<String?>(null) }
    val speech = rememberSpeech { text ->
        val t0 = text.lowercase(Locale.ROOT)
        heard = if (t0.isBlank()) t("projects.detail.heardNothing") else t("projects.detail.heardQuote", "text" to t0)
        if (Regex("""suivant|plus un|rang|incr|\bun\b|\+|next|plus one|row""").containsMatchIn(t0)) step(1)
    }

    Surface(Modifier.fillMaxSize(), color = hero.container, contentColor = hero.content) {
        Column(
            Modifier.fillMaxSize().systemBarsPadding().padding(horizontal = 20.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                FilledIconButton(onClick = { nav.popBackStack() }, modifier = Modifier.size(48.dp),
                    colors = IconButtonDefaults.filledIconButtonColors(containerColor = hero.raised, contentColor = hero.content)) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("app.back"))
                }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(p?.str("title").orEmpty(), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold,
                        maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(tr("app.focus.screenOn"), style = MaterialTheme.typography.labelMedium, color = hero.muted)
                }
                Spacer(Modifier.size(48.dp))
            }

            if (p == null) {
                Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = hero.accent)
                }
                return@Column
            }

            val row = p.int("currentRow") ?: 0
            val total = p.int("totalRows")?.takeIf { it > 0 }
            val pct = (p.int("progressPct") ?: 0) / 100f
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(Modifier.size(300.dp), contentAlignment = Alignment.Center) {
                    Canvas(Modifier.fillMaxSize()) {
                        val stroke = 18.dp.toPx()
                        val inset = stroke / 2
                        val arcSize = Size(size.width - stroke, size.height - stroke)
                        drawArc(hero.raised, 0f, 360f, false, Offset(inset, inset), arcSize, style = Stroke(stroke))
                        if (pct > 0f) drawArc(hero.accent, -90f, 360f * pct.coerceIn(0f, 1f), false, Offset(inset, inset), arcSize,
                            style = Stroke(stroke, cap = StrokeCap.Round))
                    }
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(tr("app.focus.row").uppercase(), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold,
                            letterSpacing = 1.5.sp, color = hero.muted)
                        Text("$row", fontSize = 112.sp, lineHeight = 108.sp, fontWeight = FontWeight.Black)
                        Text(if (total != null) tr("app.focus.ofRows", "total" to total) else tr("app.focus.rows"),
                            style = MaterialTheme.typography.titleMedium, color = hero.muted)
                    }
                }
            }
            heard?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = hero.muted,
                modifier = Modifier.align(Alignment.CenterHorizontally)) }

            if (!readOnly) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedButton(
                        onClick = { step(-1) }, enabled = row > 0,
                        shape = RoundedCornerShape(24.dp),
                        border = BorderStroke(1.5.dp, hero.outline),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = hero.content),
                        contentPadding = PaddingValues(0.dp),
                        modifier = Modifier.width(76.dp).height(65.dp),
                    ) { Icon(Icons.Default.Remove, tr("app.focus.removeRow")) }
                    FilledTonalButton(
                        onClick = speech,
                        shape = RoundedCornerShape(24.dp),
                        colors = ButtonDefaults.filledTonalButtonColors(containerColor = hero.raised, contentColor = hero.accent),
                        contentPadding = PaddingValues(0.dp),
                        modifier = Modifier.width(76.dp).height(65.dp),
                    ) { Icon(Icons.Default.Mic, tr("projects.detail.micStart")) }
                }
                Button(
                    onClick = { step(1) },
                    shape = RoundedCornerShape(40.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = hero.accent, contentColor = hero.onAccent),
                    modifier = Modifier.weight(1f).height(140.dp),
                ) { Text(tr("projects.detail.addRow"), fontSize = 44.sp, fontWeight = FontWeight.Black) }
            }
        }
    }
}
