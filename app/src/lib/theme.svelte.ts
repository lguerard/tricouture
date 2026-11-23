import { THEME_SWATCHES, themeCss, themeVars } from '$lib/palette';

export type Theme = 'auto' | 'light' | 'dark';
/** D'où viennent les couleurs : violet d'origine ou une couleur choisie.
 *  (Material You est réglé dans l'appli Android elle-même.) */
export type ThemeColors = 'default' | 'custom';

const STYLE_ID = 'theme-colors';

// One shared value, so every theme switch on screen (sidebar, account page)
// shows the same choice. Initialised from <html data-theme>, which app.html
// sets from localStorage before first paint.
class ThemeState {
	value = $state<Theme>('auto');
	colors = $state<ThemeColors>('default');
	custom = $state<string>(THEME_SWATCHES[1]);
	private started = false;

	init() {
		const saved = document.documentElement.dataset.theme;
		this.value = saved === 'dark' || saved === 'light' ? saved : 'auto';
		if (this.started) return;
		this.started = true;
		try {
			const colors = localStorage.getItem('themeColors');
			// 'system' (Material You de l'ancienne appli) : retour au violet.
			if (colors === 'custom') this.colors = colors;
			this.custom = localStorage.getItem('themeColor') || this.custom;
		} catch {
			// storage blocked: default colors
		}
		this.apply();
	}

	set(value: Theme) {
		this.value = value;
		const root = document.documentElement;
		try {
			if (value === 'auto') {
				delete root.dataset.theme;
				localStorage.removeItem('theme');
			} else {
				root.dataset.theme = value;
				localStorage.setItem('theme', value);
			}
		} catch {
			// storage blocked (private mode): the choice still applies for this visit
		}
	}

	setColors(colors: ThemeColors, custom?: string) {
		this.colors = colors;
		if (custom) this.custom = custom;
		try {
			localStorage.setItem('themeColors', colors);
			localStorage.setItem('themeColor', this.custom);
		} catch {
			// storage blocked: applies for this visit
		}
		this.apply();
	}

	/** Couleur d'où le thème est tiré, ou null pour la palette d'origine (app.css). */
	get seed(): string | null {
		return this.colors === 'custom' ? this.custom : null;
	}

	private apply() {
		const seed = this.seed;
		const css = seed ? themeCss(seed) : '';
		let style = document.getElementById(STYLE_ID);
		if (css) {
			if (!style) {
				style = document.createElement('style');
				style.id = STYLE_ID;
				document.head.appendChild(style);
			}
			style.textContent = css;
		} else {
			style?.remove();
		}
		const meta = document.querySelector('meta[name="theme-color"]');
		if (meta) meta.setAttribute('content', seed ? themeVars(seed, false)['--accent'] : '#7c4d8b');
		try {
			// Repris tel quel par app.html avant le premier affichage.
			if (css) localStorage.setItem('themeCss', css);
			else localStorage.removeItem('themeCss');
		} catch {
			// storage blocked
		}
	}
}

export const theme = new ThemeState();
