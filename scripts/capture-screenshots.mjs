/**
 * Capture automatique des captures d'écran de Tricouture (Playwright).
 *
 * Prérequis :
 *   1. L'application tourne (ex. `docker compose up -d` -> http://localhost:3000)
 *   2. Node installé, puis :  npm i -D playwright && npx playwright install chromium
 *
 * Usage :
 *   BASE_URL=http://localhost:3000 node scripts/capture-screenshots.mjs
 *
 * Le script crée un compte de démonstration, parcourt les écrans clés et
 * enregistre les PNG dans docs/screenshots/.
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'screenshots');

const PAGES = [
	{ path: '/', name: 'dashboard' },
	{ path: '/patterns', name: 'patterns' },
	{ path: '/projects/board', name: 'kanban' },
	{ path: '/stash', name: 'stash' },
	{ path: '/calendar', name: 'calendar' },
	{ path: '/goals', name: 'goals' },
	{ path: '/stats', name: 'stats' },
	{ path: '/achievements', name: 'achievements' },
	{ path: '/assistant', name: 'assistant' },
	{ path: '/bins', name: 'bins' }
];

async function main() {
	await mkdir(OUT, { recursive: true });
	const browser = await chromium.launch();
	const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const page = await ctx.newPage();

	// Crée un compte de démo (premier compte = admin). Ignore si déjà créé.
	const email = `demo+${Date.now()}@tricouture.local`;
	await page.goto(`${BASE_URL}/register`);
	await page.fill('#displayName', 'Démo');
	await page.fill('#email', email);
	await page.fill('#password', 'demodemodemo');
	await page.click('button[type="submit"]');
	await page.waitForURL(`${BASE_URL}/`);

	for (const p of PAGES) {
		await page.goto(`${BASE_URL}${p.path}`);
		await page.waitForLoadState('networkidle');
		await page.screenshot({ path: join(OUT, `${p.name}.png`), fullPage: true });
		console.log(`✓ ${p.name}.png`);
	}

	await browser.close();
	console.log(`\nCaptures enregistrées dans ${OUT}`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
