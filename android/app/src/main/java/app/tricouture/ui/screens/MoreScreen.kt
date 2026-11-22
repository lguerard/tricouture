package app.tricouture.ui.screens

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.tricouture.data.Session
import app.tricouture.data.tr
import app.tricouture.ui.LocalNav
import app.tricouture.ui.Routes
import app.tricouture.ui.components.Screen

/** Une entrée du menu « Plus » : les rubriques du site hors des onglets du bas. */
data class MoreItem(val route: String, val key: String, val emoji: String)

/** Rubriques du menu, dans l'ordre du site ; l'Avent n'apparaît que pour qui est concerné. */
@Composable
fun moreItems(advent: Boolean): List<MoreItem> {
    val me by Session.me.collectAsState()
    return buildList {
        add(MoreItem("calendar", "nav.calendar", "📅"))
        add(MoreItem("goals", "nav.goals", "🎯"))
        add(MoreItem("stats", "nav.stats", "📊"))
        add(MoreItem("achievements", "nav.achievements", "🏅"))
        add(MoreItem("bins", "nav.bins", "📦"))
        add(MoreItem("recipients", "nav.recipients", "🎁"))
        add(MoreItem("assistant", "nav.assistant", "🤖"))
        add(MoreItem("gallery", "nav.gallery", "🖼️"))
        add(MoreItem("moodboards", "nav.moodboards", "🎨"))
        add(MoreItem("embroidery", "nav.embroidery", "🪡"))
        if (advent) add(MoreItem("avent", "nav.advent", "✨"))
        add(MoreItem("account", "nav.account", "👤"))
        if (me?.isAdmin == true) add(MoreItem("admin/users", "nav.users", "🔐"))
    }
}

@Composable
fun MoreScreen(advent: Boolean) {
    val nav = LocalNav.current
    val items = moreItems(advent)
    Screen(tr("app.more"), actions = {
        IconButton(onClick = { nav.navigate(Routes.SETTINGS) }) { Icon(Icons.Default.Settings, tr("app.settings")) }
    }) { padding ->
        LazyColumn(Modifier.padding(padding)) {
            items(items) { item ->
                ListItem(
                    headlineContent = { Text(tr(item.key)) },
                    leadingContent = { Text(item.emoji, style = MaterialTheme.typography.titleLarge) },
                    modifier = Modifier.clickable { nav.navigate(item.route) },
                )
            }
            item {
                ListItem(
                    headlineContent = { Text(tr("app.settings")) },
                    leadingContent = { Icon(Icons.Default.Settings, null, Modifier.size(28.dp)) },
                    modifier = Modifier.clickable { nav.navigate(Routes.SETTINGS) },
                )
            }
        }
    }
}

/** Écran pas encore réécrit en natif (étape suivante du chantier). */
@Composable
fun TodoScreen(title: String, onBack: () -> Unit) {
    Screen(title, onBack = onBack) { padding ->
        Box(Modifier.padding(padding).fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("🚧", style = MaterialTheme.typography.displayMedium)
        }
    }
}
