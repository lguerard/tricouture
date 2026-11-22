package app.tricouture.ui.components

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Event
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import app.tricouture.data.formatDate
import app.tricouture.data.tr
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/** Champ date (« AAAA-MM-JJ » comme les formulaires du site), avec calendrier. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateField(label: String, value: String, onChange: (String) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    LaunchedEffect(pressed) { if (pressed) open = true }
    OutlinedTextField(
        value = formatDate(value.ifBlank { null }),
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        leadingIcon = { Icon(Icons.Default.Event, null) },
        trailingIcon = { if (value.isNotBlank()) IconButton(onClick = { onChange("") }) { Icon(Icons.Default.Close, null) } },
        interactionSource = source,
        singleLine = true,
        modifier = modifier,
    )
    if (open) {
        val initial = runCatching { LocalDate.parse(value) }.getOrNull()
        val state = rememberDatePickerState(
            initialSelectedDateMillis = initial?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli(),
        )
        DatePickerDialog(
            onDismissRequest = { open = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        onChange(Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate().toString())
                    }
                    open = false
                }) { Text("OK") }
            },
            dismissButton = { TextButton(onClick = { open = false }) { Text(tr("app.cancel")) } },
        ) { DatePicker(state) }
    }
}
