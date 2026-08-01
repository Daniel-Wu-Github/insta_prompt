import { defineConfig } from "@playwright/test";

// MV3 extensions require a persistent context, not the default isolated
// browser Playwright normally launches — see tests/e2e/fixtures.ts.
export default defineConfig({
	testDir: "./tests/e2e",
	timeout: 30_000,
	fullyParallel: false,
	workers: 1,
	reporter: [["list"]],
	use: {
		trace: "retain-on-failure",
	},
	webServer: {
		command: "node tests/e2e/fixtures/serve.mjs",
		url: "http://127.0.0.1:4173/plain-textarea.html",
		reuseExistingServer: true,
	},
});
