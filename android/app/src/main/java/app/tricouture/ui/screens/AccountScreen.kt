package app.tricouture.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import app.tricouture.ui.screens.projects.SectionCard
import kotlinx.coroutines.launch

/** Mon compte : identité, préférences (apparence, langue), IA, recherche, mot de passe. */
@Composable
fun AccountScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/account")
    val toast = rememberToast()
    val ai by Session.ai.collectAsState()
    val scope = rememberCoroutineScope()
    Screen(tr("account.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val acc = d.obj("account")
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Text(tr("account.subtitle"), color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row { Text(tr("auth.displayName"), Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant); Text(acc?.str("displayName").orEmpty()) }
                        Row { Text(tr("auth.email"), Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant); Text(acc?.str("email").orEmpty()) }
                    }
                }
                SectionCard(tr("account.prefs.title")) {
                    AppearanceSection()
                    HorizontalDivider()
                    LanguageChoice()
                }
                if (ai) SectionCard(tr("account.aiAutoFill.title")) {
                    Text(tr("account.aiAutoFill.hint"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val on = acc?.bool("aiAutoFillEnabled") == true
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(if (on) tr("account.aiAutoFill.on") else tr("account.aiAutoFill.off"), Modifier.weight(1f))
                        Switch(on, { page.submit(action = "toggleAiAutoFill", onError = toast) })
                    }
                }
                d.obj("unindexed")?.let { u ->
                    SectionCard(tr("account.search.title")) {
                        val pats = u.int("patterns") ?: 0
                        val yarns = u.int("yarns") ?: 0
                        Text(if (pats + yarns == 0) tr("account.search.allIndexed") else tr("account.search.pending", "patterns" to pats, "yarns" to yarns),
                            style = MaterialTheme.typography.bodySmall)
                        if (pats + yarns > 0) Button(onClick = { page.submit(action = "indexLibrary", onError = toast) }) { Text(tr("account.search.index")) }
                    }
                }
                PasswordSection(page, toast)
                OutlinedButton(onClick = { scope.launch { Session.logout() } }) { Text(tr("app.logout")) }
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LanguageChoice() {
    val locale by Session.locale.collectAsState()
    Text(tr("app.language"), style = MaterialTheme.typography.labelLarge)
    val langs = listOf("fr" to "Français", "en" to "English")
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        langs.forEachIndexed { i, (code, label) ->
            SegmentedButton(selected = locale == code, onClick = { Session.setLocale(code) },
                shape = SegmentedButtonDefaults.itemShape(i, langs.size)) { Text(label) }
        }
    }
}

@Composable
private fun PasswordSection(page: PageModel, toast: (String) -> Unit) {
    var current by remember { mutableStateOf("") }
    var next by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    SectionCard(tr("account.changePassword")) {
        listOf(
            Triple(tr("account.currentPassword"), current) { v: String -> current = v },
            Triple(tr("auth.passwordHint"), next) { v: String -> next = v },
            Triple(tr("account.confirmPassword"), confirm) { v: String -> confirm = v },
        ).forEach { (label, value, set) ->
            OutlinedTextField(value, set, label = { Text(label) }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
        }
        Button(onClick = {
            page.submit(action = "changePassword",
                fields = listOf("currentPassword" to current, "newPassword" to next, "confirmPassword" to confirm),
                onError = toast) { res ->
                if (res.ok) {
                    current = ""; next = ""; confirm = ""
                    (res as? ActionResult.Success)?.data?.str("success")?.let(toast)
                }
            }
        }, enabled = current.isNotEmpty() && next.isNotEmpty()) { Text(tr("account.changePassword")) }
        Text(tr("account.logoutNote"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
