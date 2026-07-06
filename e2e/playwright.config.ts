import { defineConfig } from "@playwright/test";

// Extension e2e — fixture-page tier (CI-blocking). Live authenticated-site
// smoke tests are a separate, manually-run tier (tests-live/, tag @live) and
// intentionally excluded here: login/session fragility must not gate merges.
export default defineConfig({
	testDir: "./tests",
	fullyParallel: false,
	// One worker: each test boots a persistent Chromium profile with the
	// unpacked extension; parallel profiles fight over CPU in CI for no gain.
	workers: 1,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	reporter: [["list"]],
	use: {
		baseURL: "http://127.0.0.1:4173",
		trace: "retain-on-failure",
	},
	webServer: [
		{
			command: "node server.mjs",
			url: "http://127.0.0.1:4173/sites/plain-textarea.html",
			reuseExistingServer: true,
			timeout: 15_000,
		},
		{
			// Hermetic backend stand-in — the extension build for this tier points
			// at it via VITE_API_BASE_URL (see pretest script). Never the live API.
			command: "node mock-backend.mjs",
			url: "http://127.0.0.1:4174/health",
			ignoreHTTPSErrors: true,
			reuseExistingServer: true,
			timeout: 15_000,
		},
	],
});
