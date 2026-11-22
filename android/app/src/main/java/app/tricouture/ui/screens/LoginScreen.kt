package app.tricouture.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.tricouture.data.KitException
import app.tricouture.data.Session
import app.tricouture.data.t
import app.tricouture.data.tr
import kotlinx.coroutines.launch

/** Connexion : adresse du serveur (aucune n'est intégrée à l'appli), e-mail, mot de passe. */
@Composable
fun LoginScreen(onRegister: (String) -> Unit, onForgot: (String) -> Unit) {
    val savedServer by Session.server.collectAsState()
    var server by remember { mutableStateOf(savedServer.removePrefix("https://")) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun submit() {
        if (busy) return
        if (server.isBlank()) { error = tr0("app.server"); return }
        if (email.isBlank() || password.isEmpty()) { error = t("auth.error.missing"); return }
        busy = true
        error = null
        scope.launch {
            try {
                val url = Session.normalize(server)
                if (!Session.kit.probe(url)) error = t("app.serverUnreachable")
                else Session.login(url, email, password)
            } catch (e: KitException) {
                error = e.message
            } catch (e: Exception) {
                error = e.message ?: e.toString()
            } finally {
                busy = false
            }
        }
    }

    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        ) {
            Text("🪡", style = MaterialTheme.typography.displayMedium)
            Text("Tricouture", style = MaterialTheme.typography.headlineMedium)
            Text(
                tr("auth.login.subtitle"),
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(
                server, { server = it },
                label = { Text(tr("app.server")) },
                placeholder = { Text(tr("app.serverHint")) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                email, { email = it },
                label = { Text(tr("auth.email")) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                password, { password = it },
                label = { Text(tr("auth.password")) },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { submit() }),
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center) }
            Button(onClick = { submit() }, enabled = !busy, modifier = Modifier.fillMaxWidth().height(48.dp)) {
                if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                else Text(tr("auth.signin"))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { onForgot(Session.normalize(server)) }, enabled = server.isNotBlank()) {
                    Text(tr("auth.forgotPassword"))
                }
                TextButton(onClick = { onRegister(Session.normalize(server)) }, enabled = server.isNotBlank()) {
                    Text(tr("auth.createAccount"))
                }
            }
        }
    }
}

private fun tr0(key: String) = t(key)
