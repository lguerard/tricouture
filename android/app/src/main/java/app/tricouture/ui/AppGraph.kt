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
import app.tricouture.ui.screens.stash.*
import app.tricouture.ui.screens.advent.*

private fun str(name: String, default: String? = "") = navArgument(name) {
    type = NavType.StringType
    nullable = default == null
    if (default != null) defaultValue = default
}

/** Tous les écrans de l'appli. */
fun NavGraphBuilder.appGraph(nav: NavHostController) {
    val back: () -> Unit = { nav.popBackStack() }
    composable(Routes.HOME) { HomeScreen() }
    composable(Routes.MORE) { MoreScreen() }
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
    // Stock
    composable(Routes.STASH) { StashScreen() }
    composable("stash/{tab}?q={q}", listOf(str("tab"), str("q"))) { StashScreen(it.arg("tab"), it.arg("q")) }

    // Pas encore réécrits en natif.
    composable("assistant?kind={kind}&id={id}&title={title}&q={q}", listOf(str("kind"), str("id"), str("title"), str("q"))) {
        app.tricouture.ui.assistant.AssistantScreen(it.arg("kind"), it.arg("id"), it.arg("title"), it.arg("q"))
    }
    composable("bins") { BinsScreen() }
    composable("account") { AccountScreen() }

    // Calendrier de l'Avent
    composable("avent?preview={preview}&date={date}", listOf(str("preview"), str("date"))) { AdventScreen(it.arg("preview"), it.arg("date")) }
    composable("avent/atelier?c={c}", listOf(str("c"))) { AtelierScreen(it.arg("c")) }
    for ((route, key) in listOf(
        "calendar" to "nav.calendar", "goals" to "nav.goals", "stats" to "nav.stats", "achievements" to "nav.achievements",
        "recipients" to "nav.recipients", "gallery" to "nav.gallery", "moodboards" to "nav.moodboards",
        "embroidery" to "nav.embroidery", "admin/users" to "nav.users",
    )) composable(route) { TodoScreen(tr0(key), back) }
}

private fun androidx.navigation.NavBackStackEntry.arg(name: String): String = arguments?.getString(name).orEmpty()

@Composable
private fun tr0(key: String) = tr(key)
