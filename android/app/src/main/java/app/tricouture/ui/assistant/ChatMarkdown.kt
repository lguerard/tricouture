package app.tricouture.ui.assistant

import androidx.compose.foundation.layout.height
import androidx.compose.ui.unit.dp
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle

// Markdown simple des réponses de l'assistant : listes, titres, **gras** et
// liens. Pas de HTML, rien d'exécuté : seuls les liens vers une page du site
// (/patterns/…, /projects/…) et les liens http(s) restent cliquables, comme
// sur le site ($lib/assistant/markdown.ts).

sealed class Inline {
    data class Plain(val text: String) : Inline()
    data class Bold(val text: String) : Inline()
    /** Lien vers une page du site (ouverte dans l'appli). */
    data class SiteLink(val text: String, val path: String) : Inline()
    data class WebLink(val text: String, val url: String) : Inline()
}

data class MdLine(val prefix: String, val inlines: List<Inline>, val heading: Boolean = false)

private val INLINE = Regex("""\*\*(.+?)\*\*|\[([^\]]+)]\(([^)\s]+)\)""")
private val SITE_PATH = Regex("""^/[a-z]""")
private val BULLET = Regex("""^\s*[-*•]\s+""")
private val NUMBERED = Regex("""^\s*(\d+)[.)]\s+""")
private val HEADING = Regex("""^\s*#{1,6}\s+""")

fun parseInline(text: String): List<Inline> {
    val out = mutableListOf<Inline>()
    var last = 0
    for (match in INLINE.findAll(text)) {
        if (match.range.first > last) out.add(Inline.Plain(text.substring(last, match.range.first)))
        val bold = match.groups[1]
        if (bold != null) {
            out.add(Inline.Bold(bold.value))
        } else {
            val label = match.groupValues[2]
            val target = match.groupValues[3]
            out.add(when {
                SITE_PATH.containsMatchIn(target) -> Inline.SiteLink(label, target)
                target.startsWith("http://") || target.startsWith("https://") -> Inline.WebLink(label, target)
                else -> Inline.Plain(label)  // autre lien : texte seul
            })
        }
        last = match.range.last + 1
    }
    if (last < text.length) out.add(Inline.Plain(text.substring(last)))
    return out
}

/** Lignes du message, puces et numéros normalisés, lignes vides conservées. */
fun parseMarkdown(text: String): List<MdLine> = text.lines().map { line ->
    when {
        HEADING.containsMatchIn(line) -> MdLine("", parseInline(line.replace(HEADING, "")), heading = true)
        BULLET.containsMatchIn(line) -> MdLine("•  ", parseInline(line.replace(BULLET, "")))
        NUMBERED.containsMatchIn(line) -> {
            val n = NUMBERED.find(line)!!.groupValues[1]
            MdLine("$n.  ", parseInline(line.replace(NUMBERED, "")))
        }
        else -> MdLine("", parseInline(line))
    }
}

/** Affiche un message de l'assistant ; un lien interne appelle `onOpen` avec son chemin. */
@androidx.compose.runtime.Composable
fun ChatMarkdown(text: String, onOpen: (String) -> Unit, onWeb: (String) -> Unit) {
    val primary = androidx.compose.material3.MaterialTheme.colorScheme.primary
    androidx.compose.foundation.layout.Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(2.dp)) {
        for (line in parseMarkdown(text)) {
            if (line.inlines.isEmpty() && line.prefix.isEmpty()) {
                androidx.compose.foundation.layout.Spacer(androidx.compose.ui.Modifier.height(4.dp))
                continue
            }
            val annotated = androidx.compose.ui.text.buildAnnotatedString {
                append(line.prefix)
                for (inl in line.inlines) when (inl) {
                    is Inline.Plain -> append(inl.text)
                    is Inline.Bold -> withStyle(androidx.compose.ui.text.SpanStyle(fontWeight = androidx.compose.ui.text.font.FontWeight.Bold)) { append(inl.text) }
                    is Inline.SiteLink -> withLink(androidx.compose.ui.text.LinkAnnotation.Clickable(inl.path,
                        androidx.compose.ui.text.TextLinkStyles(androidx.compose.ui.text.SpanStyle(color = primary,
                            textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline))) { onOpen(inl.path) }) { append(inl.text) }
                    is Inline.WebLink -> withLink(androidx.compose.ui.text.LinkAnnotation.Clickable(inl.url,
                        androidx.compose.ui.text.TextLinkStyles(androidx.compose.ui.text.SpanStyle(color = primary,
                            textDecoration = androidx.compose.ui.text.style.TextDecoration.Underline))) { onWeb(inl.url) }) { append(inl.text) }
                }
            }
            androidx.compose.material3.Text(
                annotated,
                style = if (line.heading) androidx.compose.material3.MaterialTheme.typography.titleSmall
                else androidx.compose.material3.MaterialTheme.typography.bodyMedium,
            )
        }
    }
}
