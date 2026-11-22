package app.tricouture.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.components.PageBody
import app.tricouture.ui.components.Screen
import app.tricouture.ui.components.rememberPage

/** Tableau de bord (provisoire : réécrit à l'étape « Accueil »). */
@Composable
fun HomeScreen() {
    val page = rememberPage("/")
    Screen(tr("nav.home")) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(d.obj("user")?.str("displayName").orEmpty(), style = MaterialTheme.typography.headlineSmall)
                Text("${tr("nav.patterns")} : ${d.int("patternCount") ?: 0}")
            }
        }
    }
}
