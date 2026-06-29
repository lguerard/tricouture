import type { CapacitorConfig } from '@capacitor/cli';

// URL du serveur self-host, injectée au build (GitHub Actions variable SERVER_URL).
// Ex : https://tricouture.mondomaine.fr
const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
	appId: 'app.tricouture',
	appName: 'Tricouture',
	webDir: 'www',
	// Si une URL est fournie, l'app charge directement le serveur (bridge Capacitor injecté).
	// Sinon, la coque affiche www/index.html (page de configuration / fallback).
	server: serverUrl
		? {
				url: serverUrl,
				cleartext: serverUrl.startsWith('http://'),
				androidScheme: serverUrl.startsWith('http://') ? 'http' : 'https'
			}
		: undefined,
	android: {
		allowMixedContent: true
	}
};

export default config;
