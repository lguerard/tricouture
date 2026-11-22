package app.tricouture.ui

import androidx.compose.runtime.Composable
import androidx.navigation.NavGraphBuilder
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import app.tricouture.data.tr
import app.tricouture.ui.screens.*
import app.tricouture.ui.screens.patterns.*
import app.tricouture.ui.screens.projects.*

private fun str(name: String, default: String? = "") = navArgument(name) {
    type = NavType.StringType
    nullable = default == null
    if (default != null) defaultValue = default
}

/** Tous les écrans de l'appli. */
fun NavGraphBuilder.appGraph(nav: NavHostController) {
    val back: () -> Unit = { nav.popBackStack() }
    composable(Routes.HOME) { HomeScreen() }
    composable(Routes.MORE) { MoreScreen(advent = false) }
    composable(Routes.SETTINGS) { SettingsScreen(onBack = back) }

    // Patrons
    composable(Routes.PATTERNS) { PatternsScreen() }
    composable("patterns/tag/{tag}", listOf(str("tag"))) { PatternsScreen(presetTag = it.arg("tag"), onBack = back) }
    composable("pattern/{id}", listOf(str("id"))) { PatternDetailScreen(it.arg("id")) }
    composable("pattern/{id}/edit", listOf(str("id"))) { PatternFormScreen(it.arg("id")) }
    composable("patterns/new?craft={craft}&url={url}", listOf(str("craft"), str("url"))) {
        PatternFormScreen(null, presetCraft = it.arg("craft"), presetUrl = it.arg("url"))
    }
    composable("patterns/import") { PatternImportScreen() }
    composable("patterns/tags") { TagColorsScreen() }
    composable("pdf?path={path}&title={title}", listOf(str("path"), str("title"))) { PdfScreen(it.arg("path"), it.arg("title")) }

    // Projets
    composable(Routes.PROJECTS) { ProjectsBoardScreen() }
    composable("projects/new?pattern={pattern}", listOf(str("pattern"))) { ProjectNewScreen(it.arg("pattern")) }
    composable("project/{id}", listOf(str("id"))) { ProjectDetailScreen(it.arg("id")) }
    composable(Routes.STASH) { TodoScreen(tr0("nav.stash"), back) }

    // Pas encore réécrits en natif.
    composable("assistant?kind={kind}&id={id}&title={title}&q={q}", listOf(str("kind"), str("id"), str("title"), str("q"))) {
        TodoScreen(tr0("nav.assistant"), back)
    }
    for ((route, key) in listOf(
        "calendar" to "nav.calendar", "goals" to "nav.goals", "stats" to "nav.stats", "achievements" to "nav.achievements",
        "bins" to "nav.bins", "recipients" to "nav.recipients", "gallery" to "nav.gallery", "moodboards" to "nav.moodboards",
        "embroidery" to "nav.embroidery", "avent" to "nav.advent", "account" to "nav.account", "admin/users" to "nav.users",
    )) composable(route) { TodoScreen(tr0(key), back) }
}

private fun androidx.navigation.NavBackStackEntry.arg(name: String): String = arguments?.getString(name).orEmpty()

@Composable
private fun tr0(key: String) = tr(key)
