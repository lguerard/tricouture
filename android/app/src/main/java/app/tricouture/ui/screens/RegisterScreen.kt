package app.tricouture.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.tricouture.data.Session
import app.tricouture.data.t
import app.tricouture.data.tr
import kotlinx.coroutines.launch

/** Création de compte sur le serveur choisi (le premier compte est administrateur). */
@Composable
fun RegisterScreen(server: String, onBack: () -> Unit) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Surface(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().systemBarsPadding().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        ) {
            Text("🪡", style = MaterialTheme.typography.displayMedium)
            Text(tr("auth.register.title"), style = MaterialTheme.typography.headlineSmall)
            Text(server, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(tr("auth.register.note"), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(name, { name = it }, label = { Text(tr("auth.displayName")) }, singleLine = true,
                modifier = Modifier.fillMaxWidth())
            OutlinedTextField(email, { email = it }, label = { Text(tr("auth.email")) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
            OutlinedTextField(password, { password = it }, label = { Text(tr("auth.passwordHint")) }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password), modifier = Modifier.fillMaxWidth())
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, textAlign = TextAlign.Center) }
            Button(
                onClick = {
                    busy = true
                    error = null
                    scope.launch {
                        try {
                            Session.register(server, email, name, password)
                        } catch (e: Exception) {
                            error = e.message ?: t("auth.error.allFieldsRequired")
                        } finally {
                            busy = false
                        }
                    }
                },
                enabled = !busy && name.isNotBlank() && email.isNotBlank() && password.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().height(48.dp),
            ) {
                if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text(tr("auth.create"))
            }
            TextButton(onClick = onBack) { Text(tr("auth.haveAccount")) }
        }
    }
}

/** « Mot de passe oublié » : le site n'envoie pas d'e-mail, il explique comment faire. */
@Composable
fun ForgotPasswordDialog(onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(tr("forgot.title")) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(tr("forgot.intro"))
                Text("1. " + tr("forgot.step.admin"))
                Text("2. " + tr("forgot.step.cli"))
                Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = MaterialTheme.shapes.small) {
                    Text(
                        "docker compose exec app node scripts/reset-password.js toi@exemple.fr",
                        style = MaterialTheme.typography.bodySmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
                        modifier = Modifier.padding(8.dp),
                    )
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(tr("app.close")) } },
    )
}
