import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
