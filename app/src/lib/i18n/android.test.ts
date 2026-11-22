import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dict } from './dict';

// L'appli Android native reprend les traductions du site, copiées dans ses
// ressources. Ce test échoue si la copie n'est plus à jour ; pour la
// régénérer : npm run i18n:android
const target = fileURLToPath(new URL('../../../../android/app/src/main/assets/i18n.json', import.meta.url));
const expected = JSON.stringify(dict, null, '\t') + '\n';

describe('traductions de l’appli Android', () => {
	it('sont à jour', () => {
		if (process.env.UPDATE_ANDROID_I18N) writeFileSync(target, expected);
		expect(existsSync(target)).toBe(true);
		expect(readFileSync(target, 'utf8')).toBe(expected);
	});
});

// Every text key the Kotlin code asks for (tr("…") / t("…")) must exist:
// in the site's dictionary, or among the app's own strings (AppStrings.kt).
const sources = fileURLToPath(new URL('../../../../android/app/src/main/java', import.meta.url));
function kotlinFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const p = join(dir, name);
		return statSync(p).isDirectory() ? kotlinFiles(p) : p.endsWith('.kt') ? [p] : [];
	});
}

describe('textes de l’appli Android', () => {
	it('existent tous', () => {
		const files = kotlinFiles(sources);
		const appStrings = readFileSync(files.find((f) => f.endsWith('AppStrings.kt'))!, 'utf8');
		const missing: string[] = [];
		for (const file of files) {
			for (const m of readFileSync(file, 'utf8').matchAll(/\b(?:tr0?|t)\("([a-zA-Z0-9_.]+)"/g)) {
				const key = m[1];
				const known = key.startsWith('app.') ? appStrings.includes(`"${key}" to`) : key in dict.fr;
				if (!known) missing.push(`${file.split('/').pop()}: ${key}`);
			}
		}
		expect(missing).toEqual([]);
	});
});
