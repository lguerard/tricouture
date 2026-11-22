package app.tricouture.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.compose.composable
import app.tricouture.data.tr
import app.tricouture.ui.screens.*

/** Tous les écrans de l'appli. */
fun NavGraphBuilder.appGraph(nav: NavHostController) {
    val back: () -> Unit = { nav.popBackStack() }
    composable(Routes.HOME) { HomeScreen() }
    composable(Routes.PATTERNS) { TodoScreen(tr0("nav.patterns"), back) }
    composable(Routes.PROJECTS) { TodoScreen(tr0("nav.projects"), back) }
    composable(Routes.STASH) { TodoScreen(tr0("nav.stash"), back) }
    composable(Routes.MORE) { MoreScreen(advent = false) }
    composable(Routes.SETTINGS) { SettingsScreen(onBack = back) }
}

@Composable
private fun tr0(key: String) = tr(key)
