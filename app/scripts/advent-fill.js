// Fills an advent calendar from a JSON file, instead of typing the 24 doors
// one by one in the workshop.
//
//   docker compose exec -T app node scripts/advent-fill.js <recipient-email> < calendrier.json
//   docker compose exec -T app node scripts/advent-fill.js <recipient-email> --apply < calendrier.json
//
// Without --apply nothing is written: the script shows what it would do and
// what is wrong (unknown pattern, duplicate code...). Run inside the app
// container (it needs DATABASE_URL); `-T` lets the JSON come in on stdin.
//
// JSON shape (every field is optional; a field left out keeps its value, a
// field set to "" or null is cleared):
//
// {
//   "owner": "lutin@example.com",        // who prepares it (needed to create the calendar)
//   "year": 2026,
//   "title": "Le calendrier de …", "message": "…",
//   "revealEarly": false, "notify": "first" | "daily" | "off",
//   "notifyTimeWeek": "08:00", "notifyTimeWeekend": "09:00",
//   "days": [
//     { "day": 1, "title": "…", "isMain": true,
//       "pattern": ["Titre exact", "autre titre possible"],   // or a single string
//       "code": "flocon", "hint": "…", "message": "…", "notifyTime": "07:30",
//       "yarns": [{ "brand": "DROPS", "name": "Lima", "colorway": "bleu marine 9016",
//                   "colorHex": "#2f2c7e", "skeins": 4, "gramsPerSkein": 50,
//                   "metersPerSkein": 100, "weightCategory": "DK", "fiber": "…" }] }
//   ]
// }
//
// Patterns are looked up in the owner's library by title: exact match first
// (ignoring case, accents and punctuation), then a title containing the
// text. Ambiguous or missing patterns are reported and left unchanged.
import postgres from 'postgres';

const ADVENT_DAYS = 24;
const NOTIFY_MODES = ['off', 'first', 'daily'];

// --- Kept in step with src/lib/advent.ts -------------------------------------
function normalizeCode(s) {
	return String(s ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}
function normalizeHex(v) {
	const s = String(v ?? '').trim();
	const hex = s.startsWith('#') ? s : '#' + s;
	return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : '';
}
function cleanTime(v) {
	const m = /^\s*(\d{1,2})\s*[:hH]\s*(\d{1,2})?\s*$/.exec(String(v ?? ''));
	if (!m) return null;
	const h = Number(m[1]), min = Number(m[2] ?? 0);
	if (h > 23 || min > 59) return null;
	return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
function cleanYarn(raw) {
	const str = (v, max) => String(v ?? '').trim().slice(0, max);
	const num = (v) => {
		const n = Number(String(v ?? '').replace(',', '.'));
		return Number.isFinite(n) && n > 0 ? n : null;
	};
	const y = {
		brand: str(raw.brand, 160),
		name: str(raw.name, 160),
		colorway: str(raw.colorway, 160),
		colorHex: normalizeHex(str(raw.colorHex, 8)),
		weightCategory: str(raw.weightCategory, 40),
		fiber: str(raw.fiber, 160),
		metersPerSkein: num(raw.metersPerSkein),
		gramsPerSkein: num(raw.gramsPerSkein),
		skeins: num(raw.skeins) ?? 1
	};
	return y.brand || y.name || y.colorway ? y : null;
}
// -----------------------------------------------------------------------------

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL manquant : lance ce script dans le conteneur app.');
	process.exit(1);
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
if (!email) {
	console.error('Usage: node scripts/advent-fill.js <recipient-email> [--apply] < calendrier.json');
	process.exit(1);
}

async function readStdin() {
	if (process.stdin.isTTY) return '';
	let s = '';
	for await (const chunk of process.stdin) s += chunk;
	return s;
}

let input;
try {
	input = JSON.parse(await readStdin());
} catch (e) {
	console.error('Impossible de lire le JSON sur l’entrée standard : ' + e.message);
	console.error('Example: docker compose exec -T app node scripts/advent-fill.js ' + email + ' < calendrier.json');
	process.exit(1);
}

const sql = postgres(url, { max: 1 });
const problems = [];
const say = (s) => console.log(s);

try {
	const recipient = (await sql`SELECT id, display_name FROM users WHERE lower(email) = ${email} LIMIT 1`)[0];
	if (!recipient) throw new Error(`Aucun compte avec l’e-mail ${email}.`);
	const year = Number(input.year) || new Date().getFullYear();

	let cal = (await sql`SELECT * FROM advent_calendars WHERE recipient_id = ${recipient.id} AND year = ${year} LIMIT 1`)[0];
	let ownerId = cal?.owner_id;
	if (!cal) {
		const ownerEmail = String(input.owner ?? '').trim().toLowerCase();
		const owner = ownerEmail ? (await sql`SELECT id FROM users WHERE lower(email) = ${ownerEmail} LIMIT 1`)[0] : null;
		if (!owner) throw new Error(`Pas encore de calendrier ${year} pour ${email}, et pas d’e-mail « owner » valide dans le JSON pour le créer.`);
		ownerId = owner.id;
		say(`Calendrier ${year} de ${recipient.display_name} : il sera créé (lutin ${ownerEmail}).`);
	} else {
		say(`Calendrier ${year} de ${recipient.display_name} : « ${cal.title} ».`);
	}

	// --- Calendar settings
	const calSet = {};
	if ('title' in input) calSet.title = String(input.title ?? '').trim().slice(0, 160) || cal?.title || 'Calendrier de l’Avent';
	if ('message' in input) calSet.message = String(input.message ?? '').trim().slice(0, 2000) || null;
	if ('revealEarly' in input) calSet.reveal_early = !!input.revealEarly;
	if ('notify' in input) {
		if (NOTIFY_MODES.includes(input.notify)) calSet.notify = input.notify;
		else problems.push(`notify « ${input.notify} » inconnu (off, first ou daily).`);
	}
	for (const [key, col] of [['notifyTimeWeek', 'notify_time_week'], ['notifyTimeWeekend', 'notify_time_weekend']]) {
		if (key in input) {
			const t = cleanTime(input[key]);
			if (t) calSet[col] = t;
			else problems.push(`${key} « ${input[key]} » n’est pas une heure (HH:MM).`);
		}
	}

	// --- Patterns of the owner
	const library = await sql`SELECT id, title, is_shared FROM patterns WHERE owner_id = ${ownerId}`;
	const key = (s) => normalizeCode(s);
	function findPattern(wanted) {
		const names = (Array.isArray(wanted) ? wanted : [wanted]).filter((x) => String(x ?? '').trim());
		for (const name of names) {
			const exact = library.filter((p) => key(p.title) === key(name));
			if (exact.length === 1) return { pattern: exact[0] };
			if (exact.length > 1) return { error: `plusieurs patrons s’appellent « ${name} »` };
		}
		for (const name of names) {
			const partial = library.filter((p) => key(p.title).includes(key(name)));
			if (partial.length === 1) return { pattern: partial[0] };
			if (partial.length > 1) return { error: `« ${name} » correspond à ${partial.length} patrons : ${partial.map((p) => p.title).join(' / ')}` };
		}
		return { error: `aucun patron ne correspond à ${names.map((n) => `« ${n} »`).join(' ou ')}` };
	}

	// --- Days
	const existing = cal ? await sql`SELECT * FROM advent_days WHERE calendar_id = ${cal.id}` : [];
	const byDay = new Map(existing.map((d) => [d.day, d]));
	const plans = [];
	const codes = new Map();
	for (const raw of input.days ?? []) {
		const dayNo = Number(raw.day);
		if (!Number.isInteger(dayNo) || dayNo < 1 || dayNo > ADVENT_DAYS) {
			problems.push(`jour « ${raw.day} » : il doit être entre 1 et 24.`);
			continue;
		}
		const current = byDay.get(dayNo);
		if (current?.opened_at) {
			problems.push(`jour ${dayNo} : porte déjà ouverte, laissée telle quelle.`);
			continue;
		}
		const set = {};
		const notes = [];
		if ('title' in raw) set.title = String(raw.title ?? '').trim().slice(0, 160) || null;
		if ('isMain' in raw) set.is_main = !!raw.isMain;
		if ('hint' in raw) set.hint = String(raw.hint ?? '').trim().slice(0, 4000) || null;
		if ('message' in raw) set.message = String(raw.message ?? '').trim().slice(0, 4000) || null;
		if ('notifyTime' in raw) {
			const t = raw.notifyTime ? cleanTime(raw.notifyTime) : null;
			if (raw.notifyTime && !t) problems.push(`jour ${dayNo} : notifyTime « ${raw.notifyTime} » n’est pas une heure.`);
			else set.notify_time = t;
		}
		if ('code' in raw) {
			const c = String(raw.code ?? '').trim().slice(0, 80);
			if (c && !normalizeCode(c)) problems.push(`jour ${dayNo} : le code « ${c} » n’a ni lettre ni chiffre.`);
			else {
				set.code = c || null;
				const n = normalizeCode(c);
				if (n) {
					if (codes.has(n)) problems.push(`jour ${dayNo} : même code que le jour ${codes.get(n)} (« ${c} »).`);
					codes.set(n, dayNo);
				}
			}
		}
		if ('pattern' in raw) {
			if (!raw.pattern || (Array.isArray(raw.pattern) && raw.pattern.length === 0)) set.pattern_id = null;
			else {
				const found = findPattern(raw.pattern);
				if (found.pattern) {
					set.pattern_id = found.pattern.id;
					notes.push(`patron « ${found.pattern.title} »`);
					if (found.pattern.is_shared) problems.push(`jour ${dayNo} : « ${found.pattern.title} » est partagé, elle peut déjà le voir.`);
				} else problems.push(`jour ${dayNo} : ${found.error} ; patron laissé tel quel.`);
			}
		}
		if ('yarns' in raw) {
			set.yarns = (raw.yarns ?? []).map(cleanYarn).filter(Boolean);
			notes.push(`${set.yarns.length} laine(s)`);
		}
		plans.push({ day: dayNo, set, notes });
	}
	// Codes already set on days the file does not touch.
	for (const d of existing) {
		if (plans.some((p) => p.day === d.day)) continue;
		const n = normalizeCode(d.code);
		if (n && codes.has(n)) problems.push(`jour ${codes.get(n)} : même code que le jour ${d.day}, déjà dans le calendrier.`);
	}

	say('');
	for (const p of plans.sort((a, b) => a.day - b.day)) {
		const s = p.set;
		const parts = [
			s.title !== undefined ? `« ${s.title ?? ''} »` : null,
			s.is_main ? '✦ fil rouge' : null,
			s.code !== undefined ? `code ${s.code ?? '—'}` : null,
			...p.notes,
			s.hint !== undefined ? (s.hint ? 'indice' : 'indice vidé') : null,
			s.notify_time ? `notif ${s.notify_time}` : null
		].filter(Boolean);
		say(`  ${String(p.day).padStart(2)} · ${parts.join(' · ')}`);
	}
	if (Object.keys(calSet).length) say(`\n  Réglages du calendrier : ${Object.keys(calSet).join(', ')}`);

	if (problems.length) {
		say('\nÀ vérifier :');
		for (const p of problems) say('  ⚠ ' + p);
	}

	if (!apply) {
		say('\nRien n’a été écrit. Relance avec --apply pour remplir le calendrier.');
		process.exit(0);
	}

	await sql.begin(async (tx) => {
		if (!cal) {
			[cal] = await tx`
				INSERT INTO advent_calendars (owner_id, recipient_id, year, title)
				VALUES (${ownerId}, ${recipient.id}, ${year}, ${calSet.title ?? 'Calendrier de l’Avent'})
				RETURNING *`;
			for (let d = 1; d <= ADVENT_DAYS; d++) await tx`INSERT INTO advent_days (calendar_id, day) VALUES (${cal.id}, ${d})`;
		}
		if (Object.keys(calSet).length) await tx`UPDATE advent_calendars SET ${tx(calSet)} WHERE id = ${cal.id}`;
		for (const p of plans) {
			if (!Object.keys(p.set).length) continue;
			const set = { ...p.set };
			if (set.yarns) set.yarns = tx.json(set.yarns);
			await tx`UPDATE advent_days SET ${tx(set)} WHERE calendar_id = ${cal.id} AND day = ${p.day}`;
		}
	});
	say(`\nCalendrier rempli : ${plans.length} jour(s) mis à jour.`);
} catch (e) {
	console.error(e.message ?? e);
	process.exitCode = 1;
} finally {
	await sql.end();
}
