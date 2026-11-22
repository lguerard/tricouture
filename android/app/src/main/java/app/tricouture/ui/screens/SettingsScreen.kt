package app.tricouture.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import app.tricouture.BuildConfig
import app.tricouture.data.*
import app.tricouture.ui.components.Screen
import app.tricouture.ui.theme.ThemeSwatches
import kotlinx.coroutines.launch

/** Réglages de l'appli : apparence, langue, serveur et déconnexion. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val server by Session.server.collectAsState()
    val locale by Session.locale.collectAsState()
    val me by Session.me.collectAsState()
    Screen(tr("app.settings"), onBack = onBack) { padding ->
        Column(
            Modifier.padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            AppearanceSection()
            HorizontalDivider()
            Text(tr("app.language"), style = MaterialTheme.typography.titleMedium)
            val langs = listOf("fr" to "Français", "en" to "English")
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                langs.forEachIndexed { i, (code, label) ->
                    SegmentedButton(
                        selected = locale == code,
                        onClick = { Session.setLocale(code) },
                        shape = SegmentedButtonDefaults.itemShape(i, langs.size),
                    ) { Text(label) }
                }
            }
            HorizontalDivider()
            me?.let { Text("${it.name} · ${it.email}", style = MaterialTheme.typography.bodyMedium) }
            Text(tr("app.connectedTo", "server" to server), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = { scope.launch { Session.logout() } }) { Text(tr("app.logout")) }
            Text(tr("app.version", "v" to BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Clair / sombre / système, et d'où viennent les couleurs (comme Popote). */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AppearanceSection() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val settingsFlow = remember(context) { context.themeSettings() }
    val settings by settingsFlow.collectAsState(initial = ThemeSettings())
    fun save(changed: ThemeSettings) {
        scope.launch { context.saveThemeSettings(changed) }
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(tr("app.appearance"), style = MaterialTheme.typography.titleMedium)
        Text(tr("app.theme"), style = MaterialTheme.typography.labelLarge)
        val modes = listOf(ThemeMode.SYSTEM to tr("app.theme.system"), ThemeMode.LIGHT to tr("app.theme.light"), ThemeMode.DARK to tr("app.theme.dark"))
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            modes.forEachIndexed { index, (mode, label) ->
                SegmentedButton(
                    selected = settings.mode == mode,
                    onClick = { save(settings.copy(mode = mode)) },
                    shape = SegmentedButtonDefaults.itemShape(index, modes.size),
                ) { Text(label) }
            }
        }

        Text(tr("app.colors"), style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 8.dp))
        if (dynamicColorAvailable) {
            ColorChoice(tr("app.colors.dynamic"), tr("app.colors.dynamicHint"), selected = settings.color == ColorSource.DYNAMIC) {
                save(settings.copy(color = ColorSource.DYNAMIC))
            }
        }
        ColorChoice(tr("app.colors.default"), null, selected = settings.color == ColorSource.DEFAULT) {
            save(settings.copy(color = ColorSource.DEFAULT))
        }
        ColorChoice(tr("app.colors.custom"), tr("app.colors.customHint"), selected = settings.color == ColorSource.CUSTOM) {
            save(settings.copy(color = ColorSource.CUSTOM))
        }
        if (settings.color == ColorSource.CUSTOM) {
            FlowRow(
                Modifier.fillMaxWidth().padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                ThemeSwatches.forEach { swatch ->
                    val chosen = settings.customColor == swatch
                    Box(
                        Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(Color(swatch))
                            .border(if (chosen) 3.dp else 0.dp, MaterialTheme.colorScheme.onSurface, CircleShape)
                            .clickable { save(settings.copy(customColor = swatch)) },
                        contentAlignment = Alignment.Center,
                    ) {
                        if (chosen) Icon(Icons.Default.Check, null, tint = Color.White)
                    }
                }
            }
        }
        if (!dynamicColorAvailable) {
            Text(tr("app.colors.needAndroid12"), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun ColorChoice(title: String, subtitle: String?, selected: Boolean, onSelect: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().selectable(selected = selected, onClick = onSelect, role = Role.RadioButton).padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = null)
        Column(Modifier.padding(start = 8.dp)) {
            Text(title, style = MaterialTheme.typography.bodyLarge)
            if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
