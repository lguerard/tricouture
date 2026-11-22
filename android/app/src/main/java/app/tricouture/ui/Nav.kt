package app.tricouture.ui

import android.net.Uri
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.navigation.NavHostController

/** Navigation entre écrans, accessible partout. */
val LocalNav = staticCompositionLocalOf<NavHostController> { error("pas de NavHost") }

/** Chemins des écrans (ceux du site, quand il y en a un). */
object Routes {
    const val HOME = "home"
    const val PATTERNS = "patterns"
    const val PROJECTS = "projects"
    const val STASH = "stash"
    const val MORE = "more"
    const val SETTINGS = "settings"

    /** Écran correspondant à une adresse du site (lien interne, notification…). */
    fun fromSitePath(path: String): String? {
        val p = path.substringBefore('?').trimEnd('/')
        return when {
            p.isEmpty() || p == "/" -> HOME
            p == "/patterns" -> PATTERNS
            p.startsWith("/patterns/") -> "pattern/" + Uri.encode(p.removePrefix("/patterns/").substringBefore('/'))
            p == "/projects/board" || p == "/projects" -> PROJECTS
            p.startsWith("/projects/") -> "project/" + Uri.encode(p.removePrefix("/projects/").substringBefore('/'))
            p == "/stash" -> STASH
            else -> p.trimStart('/').takeIf { it.isNotEmpty() }
        }
    }
}
