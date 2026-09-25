import type { CapacitorConfig } from '@capacitor/cli';

// Self-host server URL, injected at build time (GitHub Actions variable SERVER_URL).
// Example: https://tricouture.mydomain.com
const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
	appId: 'app.tricouture',
	appName: 'Tricouture',
	webDir: 'www',
	// If a URL is provided, the app loads directly from the server (Capacitor bridge injected).
	// Otherwise, the shell displays www/index.html, which asks for the server
	// address at runtime and navigates to it. Capacitor hands any navigation to
	// a host outside `allowNavigation` to the system browser, and that host is
	// only known at runtime -- hence '*', or the app just opens a browser.
	// (Native plugins are only injected with a build-time URL; the site itself
	// works either way.) Cleartext lets a LAN server on plain http:// load too.
	server: serverUrl
		? {
				url: serverUrl,
				cleartext: serverUrl.startsWith('http://'),
				androidScheme: serverUrl.startsWith('http://') ? 'http' : 'https'
			}
		: {
				allowNavigation: ['*'],
				cleartext: true
			},
	android: {
		allowMixedContent: true
	}
};

export default config;
