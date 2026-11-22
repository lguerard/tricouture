package app.tricouture

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import app.tricouture.data.Session
import app.tricouture.data.ThemeSettings
import app.tricouture.data.themeSettings
import app.tricouture.data.tr
import app.tricouture.ui.LocalNav
import app.tricouture.ui.Routes
import app.tricouture.ui.appGraph
import app.tricouture.ui.components.LocalSnackbar
import app.tricouture.ui.screens.ForgotPasswordDialog
import app.tricouture.ui.screens.LoginScreen
import app.tricouture.ui.screens.RegisterScreen
import app.tricouture.ui.theme.TricoutureTheme
import app.tricouture.ui.theme.isDark

// Voile de la barre de navigation à 3 boutons (mêmes valeurs qu'androidx.activity).
private val LIGHT_SCRIM = android.graphics.Color.argb(0xe6, 0xFF, 0xFF, 0xFF)
private val DARK_SCRIM = android.graphics.Color.argb(0x80, 0x1b, 0x1b, 0x1b)

class MainActivity : ComponentActivity() {
    /** Lien reçu via « Partager → Tricouture » (patron à importer). */
    private var sharedText by mutableStateOf<String?>(null)
    /** Page du site à ouvrir (notification touchée). */
    private var openPath by mutableStateOf<String?>(null)

    private fun readIntent(intent: Intent?) {
        if (intent == null) return
        if (intent.action == Intent.ACTION_SEND && intent.type?.startsWith("text/") == true) {
            sharedText = (intent.getStringExtra(Intent.EXTRA_TEXT) ?: intent.getStringExtra(Intent.EXTRA_SUBJECT))
                ?.takeIf { it.isNotBlank() }
        }
        intent.getStringExtra(EXTRA_OPEN_PATH)?.let { openPath = it }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        readIntent(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) readIntent(intent)

        setContent {
            val themeFlow = remember { applicationContext.themeSettings() }
            val theme by themeFlow.collectAsState(initial = ThemeSettings())
            val dark = theme.isDark()
            DisposableEffect(dark) {
                enableEdgeToEdge(
                    statusBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT) { dark },
                    navigationBarStyle = SystemBarStyle.auto(LIGHT_SCRIM, DARK_SCRIM) { dark },
                )
                onDispose {}
            }
            TricoutureTheme(theme) {
                val ready by Session.ready.collectAsState()
                val token by Session.token.collectAsState()
                val snackbar = remember { SnackbarHostState() }
                CompositionLocalProvider(LocalSnackbar provides snackbar) {
                    when {
                        !ready -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                        token == null -> SignedOut()
                        else -> SignedIn()
                    }
                }
            }
        }
    }

    @Composable
    private fun SignedOut() {
        var registerOn by rememberSaveable { mutableStateOf<String?>(null) }
        var forgot by rememberSaveable { mutableStateOf(false) }
        val server = registerOn
        if (server != null) {
            androidx.activity.compose.BackHandler { registerOn = null }
            RegisterScreen(server, onBack = { registerOn = null })
        } else {
            LoginScreen(onRegister = { registerOn = it }, onForgot = { forgot = true })
        }
        if (forgot) ForgotPasswordDialog(onDismiss = { forgot = false })
    }

    @Composable
    private fun SignedIn() {
        val nav = rememberNavController()
        val backStack by nav.currentBackStackEntryAsState()
        val route = backStack?.destination?.route

        LaunchedEffect(openPath) {
            val path = openPath ?: return@LaunchedEffect
            openPath = null
            Routes.fromSitePath(path)?.let { nav.navigate(it) }
        }
        LaunchedEffect(sharedText) {
            val text = sharedText ?: return@LaunchedEffect
            sharedText = null
            nav.navigate("patterns/new?url=" + android.net.Uri.encode(text))
        }

        val tabs = listOf(
            Triple(Routes.HOME, "nav.home", Icons.Default.Home),
            Triple(Routes.PATTERNS, "nav.patterns", Icons.Default.Description),
            Triple(Routes.PROJECTS, "nav.projects", Icons.Default.ViewKanban),
            Triple(Routes.STASH, "nav.stash", Icons.Default.Inventory2),
            Triple(Routes.MORE, "app.more", Icons.Default.Menu),
        )
        fun openTab(r: String) = nav.navigate(r) {
            popUpTo(nav.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }

        CompositionLocalProvider(LocalNav provides nav) {
            Scaffold(
                contentWindowInsets = WindowInsets(0, 0, 0, 0),
                bottomBar = {
                    if (route in tabs.map { it.first }) {
                        NavigationBar {
                            tabs.forEach { (r, key, icon) ->
                                NavigationBarItem(
                                    selected = route == r,
                                    onClick = { openTab(r) },
                                    icon = { Icon(icon, null) },
                                    label = { Text(tr(key), maxLines = 1) },
                                )
                            }
                        }
                    }
                },
            ) { inner ->
                NavHost(
                    nav, startDestination = Routes.HOME,
                    modifier = Modifier.padding(inner).consumeWindowInsets(inner),
                ) { appGraph(nav) }
            }
        }
    }

    companion object {
        const val EXTRA_OPEN_PATH = "open_path"
    }
}
