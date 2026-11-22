package app.tricouture.ui.screens.more

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import app.tricouture.data.*
import app.tricouture.ui.LocalNav
import app.tricouture.ui.components.*
import app.tricouture.ui.screens.projects.SectionCard
import app.tricouture.ui.theme.LocalStatusColors

private val TIER_COLOR = mapOf(
    "bronze" to Color(0xFFA9712F), "argent" to Color(0xFF8A8F98), "or" to Color(0xFFC9A227), "platine" to Color(0xFF5BB6C9),
)

/** Mon année en mailles : chiffres de l'année et compteurs à vie. */
@Composable
fun StatsScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/stats")
    Screen(tr("nav.stats"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val s = d.obj("stats") ?: return@PageBody
            val ach = d.obj("ach")
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(tr("stats.title", "year" to (s.int("year") ?: "")), style = MaterialTheme.typography.headlineSmall)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Big(s.str("finishedThisYear").orEmpty(), tr("stats.finishedThisYear"), Modifier.weight(1f))
                    Big(s.str("metersThisYear").orEmpty(), tr("stats.metersThisYear"), Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Big(s.str("hoursThisYear").orEmpty(), tr("stats.hoursThisYear"), Modifier.weight(1f))
                    Big((s.str("savingsThisYearEur") ?: "0") + " €", tr("stats.savingsThisYear"), Modifier.weight(1f), LocalStatusColors.current.ok)
                }
                Text(tr("stats.lifetimeCounters"), style = MaterialTheme.typography.titleMedium)
                listOf(
                    s.str("finishedLifetime") to tr("stats.finishedLifetime"),
                    s.str("patternCount") to tr("dash.patterns"),
                    s.str("yarnCount") to tr("dash.yarns"),
                    s.str("activeWip") to tr("dash.wip"),
                ).forEach { (n, label) ->
                    Row { Text(n.orEmpty(), style = MaterialTheme.typography.titleMedium, modifier = Modifier.width(64.dp)); Text(label) }
                }
                if (ach != null) {
                    Text(tr("nav.achievements"), style = MaterialTheme.typography.titleMedium)
                    OutlinedCard(onClick = { nav.navigate("achievements") }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text("${ach.int("earnedPoints") ?: 0} / ${ach.int("totalPoints") ?: 0} pts", style = MaterialTheme.typography.titleLarge)
                            val total = (ach.int("totalCount") ?: 1).coerceAtLeast(1)
                            LinearProgressIndicator(progress = { (ach.int("unlockedCount") ?: 0).toFloat() / total }, Modifier.fillMaxWidth())
                            Text(tr("stats.achUnlockedLine", "unlocked" to (ach.int("unlockedCount") ?: 0), "total" to total),
                                style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Big(n: String, label: String, modifier: Modifier, color: Color = MaterialTheme.colorScheme.primary) {
    ElevatedCard(modifier) {
        Column(Modifier.fillMaxWidth().padding(vertical = 16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(n, style = MaterialTheme.typography.headlineMedium, color = color)
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Succès : par catégorie, avec leur progression. */
@Composable
fun AchievementsScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/achievements")
    val toast = rememberToast()
    Screen(tr("achievements.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            val list = d.objs("list")
            LaunchedEffect(d.arr("newlyUnlocked").size()) {
                d.objs("newlyUnlocked").firstOrNull()?.let { a ->
                    toast(t("achievements.toastUnlocked", "points" to (a.int("points") ?: 0)) + " · " + t("achv.${a.str("code")}.label"))
                }
            }
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    val unlocked = d.int("unlockedCount") ?: 0
                    val total = (d.int("totalCount") ?: 1).coerceAtLeast(1)
                    SectionCard("${d.int("earnedPoints") ?: 0} / ${d.int("totalPoints") ?: 0} pts") {
                        LinearProgressIndicator(progress = { unlocked.toFloat() / total }, Modifier.fillMaxWidth())
                        Text(tr("achievements.progressLabel", "unlocked" to unlocked, "total" to total, "completion" to unlocked * 100 / total))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("bronze", "argent", "or", "platine").forEach { tier ->
                                val all = list.filter { it.str("tier") == tier }
                                Pill("${tr("tier.$tier")} ${all.count { it.bool("unlocked") }}/${all.size}",
                                    container = TIER_COLOR[tier]!!.copy(alpha = 0.2f), content = MaterialTheme.colorScheme.onSurface)
                            }
                        }
                    }
                }
                list.groupBy { it.str("category").orEmpty() }.forEach { (cat, items) ->
                    item { Text(tr("achv.cat.$cat"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
                    items(items) { a ->
                        val unlocked = a.bool("unlocked")
                        OutlinedCard(Modifier.fillMaxWidth().alpha(if (unlocked) 1f else 0.7f)) {
                            Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(a.str("icon").orEmpty(), style = MaterialTheme.typography.headlineSmall)
                                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(tr("achv.${a.str("code")}.label"), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
                                        Pill("${tr("tier.${a.str("tier")}")} · ${a.int("points") ?: 0}",
                                            container = (TIER_COLOR[a.str("tier")] ?: Color.Gray).copy(alpha = 0.2f), content = MaterialTheme.colorScheme.onSurface)
                                    }
                                    Text(tr("achv.${a.str("code")}.description"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    if (unlocked) Text(tr("achievements.unlockedOn", "date" to formatDate(a.str("unlockedAt"))),
                                        style = MaterialTheme.typography.bodySmall, color = LocalStatusColors.current.ok)
                                    else {
                                        val cur = a.double("current") ?: 0.0
                                        val target = (a.double("target") ?: 1.0).coerceAtLeast(1.0)
                                        LinearProgressIndicator(progress = { (cur / target).toFloat().coerceIn(0f, 1f) }, Modifier.fillMaxWidth())
                                        Text("${cur.toLong()} / ${target.toLong()}", style = MaterialTheme.typography.bodySmall)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Administration : comptes, rôle, lien de réinitialisation du mot de passe. */
@Composable
fun AdminUsersScreen() {
    val nav = LocalNav.current
    val page = rememberPage("/admin/users")
    val toast = rememberToast()
    val clipboard = LocalClipboardManager.current
    var link by remember { mutableStateOf<Pair<String, String>?>(null) }
    Screen(tr("admin.title"), onBack = { nav.popBackStack() }) { padding ->
        PageBody(page, Modifier.padding(padding)) { d ->
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Text(tr("admin.subtitle"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                link?.let { (email, url) ->
                    item {
                        SectionCard(tr("admin.linkFor", "email" to email)) {
                            androidx.compose.foundation.text.selection.SelectionContainer { Text(url, style = MaterialTheme.typography.bodySmall) }
                            Button(onClick = { clipboard.setText(AnnotatedString(url)); toast(t("admin.copied")) }) { Text(tr("admin.copy")) }
                            Text(tr("admin.linkNote"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                items(d.objs("users")) { u ->
                    ElevatedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Text(u.str("displayName").orEmpty(), style = MaterialTheme.typography.titleMedium)
                            Text(u.str("email").orEmpty(), style = MaterialTheme.typography.bodySmall)
                            Text(tr("admin.role") + " : " + if (u.bool("isAdmin")) tr("admin.admin") else tr("admin.member"))
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = {
                                    page.submit(action = "toggleAdmin", fields = listOf("id" to u.str("id").orEmpty(),
                                        "makeAdmin" to (!u.bool("isAdmin")).toString()), onError = toast)
                                }) { Text(if (u.bool("isAdmin")) tr("admin.demote") else tr("admin.promote")) }
                                OutlinedButton(onClick = {
                                    page.submit(action = "resetLink", fields = listOf("id" to u.str("id").orEmpty()), onError = toast) { res ->
                                        (res as? ActionResult.Success)?.data?.let { link = it.str("resetFor").orEmpty() to it.str("resetUrl").orEmpty() }
                                    }
                                }) { Text(tr("admin.generateLink")) }
                            }
                        }
                    }
                }
            }
        }
    }
}
