import type { Locale } from '$lib/i18n';

const INTL_LOCALE: Record<Locale, string> = { fr: 'fr-FR', en: 'en-US' };

// A `date` column arrives as "YYYY-MM-DD": parse it as a local calendar day,
// not UTC midnight (which shows the previous day west of Greenwich).
function toDate(value: string | Date): Date {
	return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

// "3 oct. 2026" / "Oct 3, 2026".
export function formatDate(locale: Locale, value: string | Date | null | undefined): string {
	if (!value) return '';
	return toDate(value).toLocaleDateString(INTL_LOCALE[locale], { day: 'numeric', month: 'short', year: 'numeric' });
}

// Whole days from today (negative = past), ignoring the time of day.
export function daysFromToday(value: string | Date): number {
	const d = toDate(value);
	const today = new Date();
	const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
	const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
	return Math.round((a - b) / 86_400_000);
}

// "aujourd'hui", "demain", "dans 5 jours", "il y a 2 jours".
export function formatRelativeDays(locale: Locale, value: string | Date): string {
	return new Intl.RelativeTimeFormat(INTL_LOCALE[locale], { numeric: 'auto' }).format(daysFromToday(value), 'day');
}

// "3 oct. 2026 · dans 5 jours" — for deadlines.
export function formatDeadline(locale: Locale, value: string | Date | null | undefined): string {
	if (!value) return '';
	return `${formatDate(locale, value)} · ${formatRelativeDays(locale, value)}`;
}
