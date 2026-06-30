import type { CapacitorConfig } from '@capacitor/cli';

// Self-host server URL, injected at build time (GitHub Actions variable SERVER_URL).
// Example: https://tricouture.mydomain.com
const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
	appId: 'app.tricouture',
	appName: 'Tricouture',
	webDir: 'www',
	// If a URL is provided, the app loads directly from the server (Capacitor bridge injected).
	// Otherwise, the shell displays www/index.html (configuration page / fallback).
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
