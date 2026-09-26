export type Theme = 'auto' | 'light' | 'dark';

// One shared value, so every theme switch on screen (sidebar, account page)
// shows the same choice. Initialised from <html data-theme>, which app.html
// sets from localStorage before first paint.
class ThemeState {
	value = $state<Theme>('auto');

	init() {
		const saved = document.documentElement.dataset.theme;
		this.value = saved === 'dark' || saved === 'light' ? saved : 'auto';
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
}

export const theme = new ThemeState();
