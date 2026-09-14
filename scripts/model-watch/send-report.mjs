#!/usr/bin/env node
/**
 * Emails (or, as a fallback, saves to disk) the monthly model-watch report.
 *
 * Runs on the HOST, not in a container -- plain Node built-ins (net/tls) for
 * SMTP, no dependency beyond a working `node` install, so it works without
 * ever touching the app's own node_modules. SMTP settings come from the
 * environment (see .env.example's "Surveillance mensuelle des modèles"
 * section) since check-model.sh sources .env before calling this.
 *
 * Usage:
 *   node send-report.mjs --old-model X --new-model Y [--error "message"]
 *   (the model-watch JSON result is read from stdin unless --error is set)
 */

import { connect as netConnect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { hostname } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPORTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'reports');

// --- report text -----------------------------------------------------------

function pad(s, n) {
	return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length);
}

function fmtScore(n) {
	return n.toFixed(1).padStart(5);
}

function buildBody({ oldModel, newModel, result, error }) {
	const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
	const lines = [`Vérification mensuelle des modèles Ollama — ${stamp} UTC`, ''];

	if (error) {
		lines.push(`ÉCHEC : ${error}`, '', `Modèle en place (inchangé) : ${oldModel}`);
		return lines.join('\n');
	}

	if (oldModel !== newModel) {
		lines.push(
			`CHANGEMENT APPLIQUÉ : ${oldModel}  →  ${newModel}`,
			'',
			'Pour revenir en arrière :',
			`  1. Dans .env, remettre OLLAMA_CHAT_MODEL=${oldModel}`,
			'  2. docker compose up -d --no-deps app',
			''
		);
	} else {
		lines.push(`Aucun changement — modèle actuel conservé : ${oldModel}`, '');
	}

	lines.push(`VRAM GPU : ${result.vramTotalGb} Go (budget candidats utilisé : ${result.vramBudgetGb} Go)`, '');

	const b = result.baseline;
	lines.push(`${pad(`Modèle actuel  ${b.model}`, 46)}score ${fmtScore(b.avgScore)}/100   latence moy. ${b.avgLatencyS}s`);
	for (const c of result.candidates) {
		const marker = c.model === newModel && oldModel !== newModel ? ' <-- retenu' : '';
		lines.push(
			`${pad(`Candidat       ${c.model}`, 46)}score ${fmtScore(c.avgScore)}/100   ` +
				`latence moy. ${c.avgLatencyS}s   ~${c.diskSizeGb} Go${marker}`
		);
	}

	if (result.warnings?.length) {
		lines.push('', 'Avertissements :');
		for (const w of result.warnings) lines.push(`  - ${w}`);
	}

	const detail = newModel === b.model ? b : (result.candidates.find((c) => c.model === newModel) ?? b);
	lines.push('', `Détail par cas de test (${detail.model}) :`);
	for (const c of detail.cases) {
		lines.push(`  [${c.case}] ${c.score}/100 (${c.latencyS}s)`);
		for (const note of c.notes) lines.push(`      ${note}`);
	}

	return lines.join('\n');
}

// --- minimal SMTP client (STARTTLS + AUTH LOGIN) ----------------------------

function readResponse(socket) {
	return new Promise((resolve, reject) => {
		let buf = '';
		const onData = (chunk) => {
			buf += chunk.toString('utf8');
			const lines = buf.split('\r\n').filter(Boolean);
			const last = lines[lines.length - 1];
			// A final response line is "NNN " (space); "NNN-" means more lines follow.
			if (last && /^\d{3} /.test(last)) {
				cleanup();
				resolve(buf);
			}
		};
		const onError = (err) => {
			cleanup();
			reject(err);
		};
		function cleanup() {
			socket.off('data', onData);
			socket.off('error', onError);
		}
		socket.on('data', onData);
		socket.on('error', onError);
	});
}

function sendCommand(socket, cmd) {
	socket.write(cmd + '\r\n');
	return readResponse(socket);
}

function upgradeToTls(socket, servername) {
	return new Promise((resolve, reject) => {
		const secure = tlsConnect({ socket, servername }, () => resolve(secure));
		secure.once('error', reject);
	});
}

function dotStuff(text) {
	return text
		.split(/\r\n|\r|\n/)
		.map((line) => (line.startsWith('.') ? '.' + line : line))
		.join('\r\n');
}

async function sendEmail({ host, port, user, password, from, to, useTls, subject, body }) {
	let socket = netConnect({ host, port });
	socket.setTimeout(30_000);
	socket.on('timeout', () => socket.destroy(new Error('délai SMTP dépassé')));

	await new Promise((resolve, reject) => {
		socket.once('connect', resolve);
		socket.once('error', reject);
	});

	const greeting = await readResponse(socket);
	if (!greeting.startsWith('220')) throw new Error(`accueil SMTP inattendu : ${greeting.trim()}`);

	const ehloName = hostname() || 'localhost';
	let resp = await sendCommand(socket, `EHLO ${ehloName}`);
	if (!resp.startsWith('250')) throw new Error(`EHLO refusé : ${resp.trim()}`);

	if (useTls) {
		resp = await sendCommand(socket, 'STARTTLS');
		if (!resp.startsWith('220')) throw new Error(`STARTTLS refusé : ${resp.trim()}`);
		socket = await upgradeToTls(socket, host);
		resp = await sendCommand(socket, `EHLO ${ehloName}`);
		if (!resp.startsWith('250')) throw new Error(`EHLO (TLS) refusé : ${resp.trim()}`);
	}

	if (user && password) {
		resp = await sendCommand(socket, 'AUTH LOGIN');
		if (!resp.startsWith('334')) throw new Error(`AUTH LOGIN refusé : ${resp.trim()}`);
		resp = await sendCommand(socket, Buffer.from(user, 'utf8').toString('base64'));
		if (!resp.startsWith('334')) throw new Error(`utilisateur SMTP refusé : ${resp.trim()}`);
		resp = await sendCommand(socket, Buffer.from(password, 'utf8').toString('base64'));
		if (!resp.startsWith('235')) throw new Error(`mot de passe SMTP refusé : ${resp.trim()}`);
	}

	resp = await sendCommand(socket, `MAIL FROM:<${from}>`);
	if (!resp.startsWith('250')) throw new Error(`MAIL FROM refusé : ${resp.trim()}`);
	resp = await sendCommand(socket, `RCPT TO:<${to}>`);
	if (!resp.startsWith('250') && !resp.startsWith('251')) throw new Error(`RCPT TO refusé : ${resp.trim()}`);
	resp = await sendCommand(socket, 'DATA');
	if (!resp.startsWith('354')) throw new Error(`DATA refusé : ${resp.trim()}`);

	const message =
		`From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nDate: ${new Date().toUTCString()}\r\n` +
		`Content-Type: text/plain; charset=utf-8\r\nMIME-Version: 1.0\r\n\r\n${dotStuff(body)}\r\n.`;
	resp = await sendCommand(socket, message);
	if (!resp.startsWith('250')) throw new Error(`envoi refusé : ${resp.trim()}`);

	await sendCommand(socket, 'QUIT').catch(() => {});
	socket.end();
}

async function sendEmailIfConfigured(subject, body) {
	const host = process.env.MODEL_WATCH_SMTP_HOST;
	const to = process.env.MODEL_WATCH_SMTP_TO;
	if (!host || !to) {
		console.error('model-watch: MODEL_WATCH_SMTP_HOST/MODEL_WATCH_SMTP_TO absents — email non envoyé.');
		return false;
	}
	const port = parseInt(process.env.MODEL_WATCH_SMTP_PORT || '587', 10);
	const user = process.env.MODEL_WATCH_SMTP_USER || '';
	const password = process.env.MODEL_WATCH_SMTP_PASSWORD || '';
	const from = process.env.MODEL_WATCH_SMTP_FROM || user || to;
	const useTls = (process.env.MODEL_WATCH_SMTP_USE_TLS ?? 'true').toLowerCase() !== 'false';
	try {
		await sendEmail({ host, port, user, password, from, to, useTls, subject, body });
		return true;
	} catch (e) {
		console.error(`model-watch: échec de l'envoi de l'email : ${e.message}`);
		return false;
	}
}

// --- CLI ---------------------------------------------------------------

function parseArgs(argv) {
	const out = { oldModel: null, newModel: null, error: null };
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--old-model') out.oldModel = argv[++i];
		else if (argv[i] === '--new-model') out.newModel = argv[++i];
		else if (argv[i] === '--error') out.error = argv[++i];
	}
	if (!out.oldModel || !out.newModel) {
		console.error('Usage: send-report.mjs --old-model X --new-model Y [--error "message"]');
		process.exit(2);
	}
	return out;
}

async function readStdin() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8');
}

function saveLocalCopy(subject, body) {
	mkdirSync(REPORTS_DIR, { recursive: true });
	const date = new Date().toISOString().slice(0, 10);
	const path = join(REPORTS_DIR, `${date}.txt`);
	writeFileSync(path, `${subject}\n\n${body}\n`, 'utf8');
	return path;
}

async function main() {
	const { oldModel, newModel, error } = parseArgs(process.argv.slice(2));

	let result = null;
	if (!error) {
		const raw = await readStdin();
		result = raw.trim() ? JSON.parse(raw) : null;
	}

	const body = buildBody({ oldModel, newModel, result, error });
	const subject = error
		? '[Tricouture] Échec de la vérification mensuelle des modèles'
		: oldModel !== newModel
			? `[Tricouture] Modèle changé : ${oldModel} → ${newModel}`
			: '[Tricouture] Vérification mensuelle des modèles — rien de nouveau';

	const sent = await sendEmailIfConfigured(subject, body);
	const localPath = saveLocalCopy(subject, body);
	console.log(
		`model-watch: rapport ${sent ? 'envoyé par email et ' : 'NON envoyé par email (voir ci-dessus), '}enregistré dans ${localPath}`
	);
}

main().catch((e) => {
	console.error(`model-watch: erreur inattendue : ${e.message}`);
	process.exit(1);
});
