package app.tricouture.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import app.tricouture.data.ActionResult
import app.tricouture.data.FilePart
import app.tricouture.data.KitException
import app.tricouture.data.Session
import app.tricouture.data.UnauthorizedException
import app.tricouture.data.tr
import com.google.gson.JsonObject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Données d'une page du site, gardées le temps que l'écran existe (rotation
 * comprise). `reload()` les relit, par exemple après un formulaire.
 */
class PageModel : ViewModel() {
    private val _data = MutableStateFlow<JsonObject?>(null)
    val data: StateFlow<JsonObject?> = _data.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()
    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()
    private val _busy = MutableStateFlow(false)
    /** Un formulaire est en cours d'envoi. */
    val busy: StateFlow<Boolean> = _busy.asStateFlow()

    private var path = ""
    private var query: Map<String, String?> = emptyMap()
    private var version = -1
    private var job: Job? = null

    /** Charge la page ; la recharge si elle a changé, ou si des données ont été modifiées depuis. */
    fun bind(path: String, query: Map<String, String?>, version: Int) {
        val same = path == this.path && query == this.query && version == this.version
        if (same && (_data.value != null || _loading.value)) return
        this.path = path
        this.query = query
        this.version = version
        reload()
    }

    fun reload() {
        job?.cancel()
        job = viewModelScope.launch {
            _loading.value = true
            try {
                val d = Session.kit.load(path, query)
                Session.absorbLayout(d)
                _data.value = d
                _error.value = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: UnauthorizedException) {
                // L'appli repasse sur l'écran de connexion.
            } catch (e: KitException) {
                _error.value = e.message
            } catch (e: Exception) {
                _error.value = e.message ?: e.toString()
            } finally {
                _loading.value = false
            }
        }
    }

    /** Remplace les données affichées (mise à jour locale, sans recharger). */
    fun patch(change: (JsonObject) -> Unit) {
        val d = _data.value ?: return
        val copy = d.deepCopy()
        change(copy)
        _data.value = copy
    }

    /**
     * Envoie un formulaire du site puis recharge la page. `onDone` reçoit le
     * résultat (sauf erreur réseau, signalée par `onError`).
     */
    fun submit(
        path: String = this.path,
        action: String? = null,
        fields: List<Pair<String, String>> = emptyList(),
        files: List<FilePart> = emptyList(),
        reload: Boolean = true,
        onError: (String) -> Unit = {},
        onDone: (ActionResult) -> Unit = {},
    ) {
        viewModelScope.launch {
            _busy.value = true
            try {
                // Un formulaire réussi fait recharger les pages affichées (Session.changes).
                val res = Session.kit.action(path, action, fields, files)
                if (res is ActionResult.Failure) onError(res.error ?: "Erreur")
                onDone(res)
            } catch (e: CancellationException) {
                throw e
            } catch (e: UnauthorizedException) {
            } catch (e: Exception) {
                onError(e.message ?: e.toString())
            } finally {
                _busy.value = false
            }
        }
    }

    /** Tâche quelconque avec l'indicateur « occupé » et les erreurs gérées. */
    fun run(onError: (String) -> Unit = {}, block: suspend () -> Unit) {
        viewModelScope.launch {
            _busy.value = true
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (e: UnauthorizedException) {
            } catch (e: Exception) {
                onError(e.message ?: e.toString())
            } finally {
                _busy.value = false
            }
        }
    }
}

/** Les données de la page `path` du site, chargées à l'affichage. */
@Composable
fun rememberPage(path: String, query: Map<String, String?> = emptyMap(), key: String = path): PageModel {
    val model: PageModel = viewModel(key = "page:$key")
    val version by Session.changes.collectAsState()
    LaunchedEffect(path, query, version) { model.bind(path, query, version) }
    return model
}

/** Message éphémère en bas de l'écran (erreurs de formulaire, confirmations). */
val LocalSnackbar = staticCompositionLocalOf<SnackbarHostState> { error("pas de SnackbarHost") }

/** Affiche un message dans la barre du bas, depuis un rappel non composable. */
@Composable
fun rememberToast(): (String) -> Unit {
    val host = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    return remember(host) { { msg: String -> scope.launch { host.showSnackbar(msg) } } }
}

/**
 * Corps d'une page chargée depuis le site : indicateur pendant le premier
 * chargement, message et bouton « Réessayer » en cas d'erreur, et
 * « tirer pour actualiser ».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PageBody(
    page: PageModel,
    modifier: Modifier = Modifier,
    content: @Composable (JsonObject) -> Unit,
) {
    val data by page.data.collectAsState()
    val error by page.error.collectAsState()
    val loading by page.loading.collectAsState()
    val d = data
    when {
        d != null -> PullToRefreshBox(isRefreshing = loading, onRefresh = { page.reload() }, modifier = modifier.fillMaxSize()) {
            content(d)
        }
        error != null -> ErrorBox(error!!, onRetry = { page.reload() }, modifier = modifier)
        else -> LoadingBox(modifier)
    }
}

@Composable
fun LoadingBox(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
fun ErrorBox(message: String, onRetry: (() -> Unit)?, modifier: Modifier = Modifier) {
    Column(
        modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.CloudOff, null, Modifier.size(48.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(12.dp))
        Text(message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (onRetry != null) {
            Spacer(Modifier.height(16.dp))
            Button(onClick = onRetry) { Text(tr("app.retry")) }
        }
    }
}

@Composable
fun EmptyState(text: String, modifier: Modifier = Modifier, emoji: String? = null) {
    Column(
        modifier.fillMaxWidth().padding(vertical = 48.dp, horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        if (emoji != null) Text(emoji, style = MaterialTheme.typography.displaySmall)
        Spacer(Modifier.height(8.dp))
        Text(text, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Écran avec barre de titre : retour (si `onBack`), actions, bouton flottant. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Screen(
    title: String,
    onBack: (() -> Unit)? = null,
    actions: @Composable RowScope.() -> Unit = {},
    fab: @Composable () -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    content: @Composable (PaddingValues) -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis) },
                navigationIcon = {
                    if (onBack != null) IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, tr("app.back"))
                    }
                },
                actions = actions,
            )
        },
        floatingActionButton = fab,
        bottomBar = bottomBar,
        snackbarHost = { SnackbarHost(LocalSnackbar.current) },
    ) { padding -> content(padding) }
}

/** Confirmation avant une action destructrice. */
@Composable
fun ConfirmDialog(
    text: String,
    confirm: String = tr("app.delete"),
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        text = { Text(text) },
        confirmButton = {
            TextButton(onClick = { onDismiss(); onConfirm() }) {
                Text(confirm, color = MaterialTheme.colorScheme.error)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(tr("app.cancel")) } },
    )
}
