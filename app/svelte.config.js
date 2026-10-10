import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// The Android app keeps the site open for days: check every minute for
		// a new deployment, so the app picks it up instead of running stale code
		// (see the reload prompt in +layout.svelte).
		version: { pollInterval: 60_000 }
	}
};

export default config;
