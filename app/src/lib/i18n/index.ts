import { dict, type Locale } from './dict';

export { LOCALES } from './dict';
export type { Locale } from './dict';

export const DEFAULT_LOCALE: Locale = 'fr';

export function isLocale(v: unknown): v is Locale {
	return v === 'fr' || v === 'en';
}

// Traducteur pur (sans état partagé) : sûr en SSR.
// Usage : t($page.data.locale, 'nav.patterns')
export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
	const table = dict[locale] ?? dict[DEFAULT_LOCALE];
	let s = table[key] ?? dict[DEFAULT_LOCALE][key] ?? key;
	if (vars) {
		for (const k of Object.keys(vars)) {
			s = s.split(`{${k}}`).join(String(vars[k]));
		}
	}
	return s;
}
