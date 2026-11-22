import { systemColors } from '$lib/capacitor';
import { THEME_SWATCHES, themeCss, themeVars } from '$lib/palette';

export type Theme = 'auto' | 'light' | 'dark';
/** D'où viennent les couleurs : violet d'origine, Material You, ou une couleur choisie. */
export type ThemeColors = 'default' | 'system' | 'custom';

const STYLE_ID = 'theme-colors';

// One shared value, so every theme switch on screen (sidebar, account page)
// shows the same choice. Initialised from <html data-theme>, which app.html
// sets from localStorage before first paint.
class ThemeState {
	value = $state<Theme>('auto');
	colors = $state<ThemeColors>('default');
	custom = $state<string>(THEME_SWATCHES[1]);
	/** Couleur du fond d'écran (app Android 12+), null ailleurs. */
	systemAccent = $state<string | null>(null);
	/** Pourquoi Material You manque : navigateur, app à mettre à jour, Android < 12. */
	systemMissing = $state<'web' | 'app' | 'android' | null>('web');
	private started = false;

	init() {
		const saved = document.documentElement.dataset.theme;
		this.value = saved === 'dark' || saved === 'light' ? saved : 'auto';
		if (this.started) return;
		this.started = true;
		try {
			const colors = localStorage.getItem('themeColors');
			if (colors === 'system' || colors === 'custom') this.colors = colors;
			this.custom = localStorage.getItem('themeColor') || this.custom;
		} catch {
			// storage blocked: default colors
		}
		void this.refreshSystemAccent();
		// Fond d'écran changé pendant que l'app était en arrière-plan.
		document.addEventListener('visibilitychange', () => {
			if (document.visibilityState === 'visible') void this.refreshSystemAccent();
		});
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

	private async refreshSystemAccent() {
		const found = await systemColors();
		this.systemAccent = found.accent;
		this.systemMissing = 'missing' in found ? found.missing : null;
		// Material You choisi sur un appareil qui ne le propose plus : retour au violet.
		this.apply();
	}

	/** Couleur d'où le thème est tiré, ou null pour la palette d'origine (app.css). */
	get seed(): string | null {
		if (this.colors === 'custom') return this.custom;
		if (this.colors === 'system') return this.systemAccent;
		return null;
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
