package app.tricouture.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import app.tricouture.data.ColorSource
import app.tricouture.data.ThemeMode
import app.tricouture.data.ThemeSettings

/** Le violet de Tricouture (app.css). */
const val TRICOUTURE_PURPLE = 0xFF7C4D8B

/** Couleurs proposées dans les paramètres (« Couleur au choix »), comme sur le site. */
val ThemeSwatches = listOf(
    0xFF7C4D8B, 0xFFC2185B, 0xFFD32F2F, 0xFFE65100, 0xFF827717,
    0xFF2E7D32, 0xFF00838F, 0xFF1565C0, 0xFF3949AB, 0xFF6D4C41,
)

/** Couleurs d'état du site (succès, attention, danger), hors du thème Material. */
data class StatusColors(val ok: Color, val okSoft: Color, val warn: Color, val warnSoft: Color, val danger: Color, val dangerSoft: Color)

private val LightStatus = StatusColors(
    Color(0xFF3F9B6D), Color(0xFFE7F4EC), Color(0xFFC98A2B), Color(0xFFFCECCB), Color(0xFFC0473F), Color(0xFFF6D6D3),
)
private val DarkStatus = StatusColors(
    Color(0xFF5FC08E), Color(0xFF1B3326), Color(0xFFE0A54A), Color(0xFF3B2F17), Color(0xFFEC7A70), Color(0xFF45221F),
)
val LocalStatusColors = staticCompositionLocalOf { LightStatus }

private fun c(argb: Int) = Color(argb)

/** Thème complet tiré d'une seule couleur, en clair ou en sombre (rôles Material 3). */
fun seedColorScheme(seed: Long, dark: Boolean): ColorScheme {
    val p = SeedPalettes(seed.toInt())
    return if (!dark) lightColorScheme(
        primary = c(p.primary[40]), onPrimary = c(p.primary[100]),
        primaryContainer = c(p.primary[90]), onPrimaryContainer = c(p.primary[10]),
        inversePrimary = c(p.primary[80]),
        secondary = c(p.secondary[40]), onSecondary = c(p.secondary[100]),
        secondaryContainer = c(p.secondary[90]), onSecondaryContainer = c(p.secondary[10]),
        tertiary = c(p.tertiary[40]), onTertiary = c(p.tertiary[100]),
        tertiaryContainer = c(p.tertiary[90]), onTertiaryContainer = c(p.tertiary[10]),
        background = c(p.neutral[98]), onBackground = c(p.neutral[10]),
        surface = c(p.neutral[98]), onSurface = c(p.neutral[10]),
        surfaceVariant = c(p.neutralVariant[90]), onSurfaceVariant = c(p.neutralVariant[30]),
        surfaceTint = c(p.primary[40]),
        inverseSurface = c(p.neutral[20]), inverseOnSurface = c(p.neutral[95]),
        outline = c(p.neutralVariant[50]), outlineVariant = c(p.neutralVariant[80]),
        surfaceBright = c(p.neutral[98]), surfaceDim = c(p.neutral[87]),
        surfaceContainerLowest = c(p.neutral[100]), surfaceContainerLow = c(p.neutral[96]),
        surfaceContainer = c(p.neutral[94]), surfaceContainerHigh = c(p.neutral[92]),
        surfaceContainerHighest = c(p.neutral[90]),
    ) else darkColorScheme(
        primary = c(p.primary[80]), onPrimary = c(p.primary[20]),
        primaryContainer = c(p.primary[30]), onPrimaryContainer = c(p.primary[90]),
        inversePrimary = c(p.primary[40]),
        secondary = c(p.secondary[80]), onSecondary = c(p.secondary[20]),
        secondaryContainer = c(p.secondary[30]), onSecondaryContainer = c(p.secondary[90]),
        tertiary = c(p.tertiary[80]), onTertiary = c(p.tertiary[20]),
        tertiaryContainer = c(p.tertiary[30]), onTertiaryContainer = c(p.tertiary[90]),
        background = c(p.neutral[6]), onBackground = c(p.neutral[90]),
        surface = c(p.neutral[6]), onSurface = c(p.neutral[90]),
        surfaceVariant = c(p.neutralVariant[30]), onSurfaceVariant = c(p.neutralVariant[80]),
        surfaceTint = c(p.primary[80]),
        inverseSurface = c(p.neutral[90]), inverseOnSurface = c(p.neutral[20]),
        outline = c(p.neutralVariant[60]), outlineVariant = c(p.neutralVariant[30]),
        surfaceBright = c(p.neutral[24]), surfaceDim = c(p.neutral[6]),
        surfaceContainerLowest = c(p.neutral[4]), surfaceContainerLow = c(p.neutral[10]),
        surfaceContainer = c(p.neutral[12]), surfaceContainerHigh = c(p.neutral[17]),
        surfaceContainerHighest = c(p.neutral[22]),
    )
}

/** Le violet de Tricouture : en clair, les couleurs exactes du site. */
private fun tricoutureColorScheme(dark: Boolean): ColorScheme {
    val base = seedColorScheme(TRICOUTURE_PURPLE, dark)
    return if (dark) base.copy(
        primary = Color(0xFFC49AD4), onPrimary = Color(0xFF1B1320),
        background = Color(0xFF17131A), surface = Color(0xFF17131A),
    ) else base.copy(
        primary = Color(0xFF7C4D8B), onPrimary = Color.White,
        primaryContainer = Color(0xFFEFE6F3), onPrimaryContainer = Color(0xFF693F76),
        background = Color(0xFFFAF7FB), surface = Color(0xFFFAF7FB),
        onBackground = Color(0xFF2B2330), onSurface = Color(0xFF2B2330),
    )
}

/** L'appli est-elle en sombre (choix de l'utilisateur, ou celui du téléphone) ? */
@Composable
fun ThemeSettings.isDark(): Boolean = when (mode) {
    ThemeMode.LIGHT -> false
    ThemeMode.DARK -> true
    ThemeMode.SYSTEM -> isSystemInDarkTheme()
}

@Composable
fun TricoutureTheme(settings: ThemeSettings = ThemeSettings(), content: @Composable () -> Unit) {
    val dark = settings.isDark()
    val context = LocalContext.current
    val colors = when {
        settings.color == ColorSource.DYNAMIC && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        settings.color == ColorSource.CUSTOM -> seedColorScheme(settings.customColor, dark)
        else -> tricoutureColorScheme(dark)
    }
    androidx.compose.runtime.CompositionLocalProvider(LocalStatusColors provides if (dark) DarkStatus else LightStatus) {
        MaterialTheme(colorScheme = colors, typography = Typography(), content = content)
    }
}
