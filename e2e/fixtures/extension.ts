// Playwright fixture: Chromium persistent context with the unpacked extension
// loaded, plus auth seeded into extension storage (the content script refuses
// to render underlines without a JWT — see buildSegmentBridgeMessage).
import { test as base, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const extensionPath = join(
	fileURLToPath(new URL(".", import.meta.url)),
	"..",
	"..",
	"extension",
	".output",
	"chrome-mv3",
);

export type ExtensionFixtures = {
	context: BrowserContext;
	serviceWorker: Worker;
};

export const test = base.extend<ExtensionFixtures>({
	// eslint-disable-next-line no-empty-pattern
	context: async ({}, use) => {
		const userDataDir = mkdtempSync(join(tmpdir(), "pc-e2e-"));
		const context = await chromium.launchPersistentContext(userDataDir, {
			// Headed under xvfb (npm test wraps with xvfb-run): MV3 service-worker
			// behavior under headless-new is less battle-tested and the bridge flow
			// depends on it.
			headless: false,
			args: [
				`--disable-extensions-except=${extensionPath}`,
				`--load-extension=${extensionPath}`,
				"--no-first-run",
				"--disable-features=TranslateUI",
			],
		});
		await use(context);
		await context.close();
	},

	serviceWorker: async ({ context }, use) => {
		let [serviceWorker] = context.serviceWorkers();
		if (!serviceWorker) {
			serviceWorker = await context.waitForEvent("serviceworker");
		}
		// Seed a fake session so the content script's JWT gate opens. The SEGMENT
		// call to the (absent) backend will fail later, which only marks the
		// overlay stale — rendering itself is local and synchronous.
		await serviceWorker.evaluate(async () => {
			await chrome.storage.local.set({
				"promptcompiler.auth": {
					access_token: "e2e-test-jwt",
					refresh_token: "e2e-test-refresh",
					expires_at: Date.now() + 3_600_000,
				},
			});
		});
		await use(serviceWorker);
	},
});

export const expect = test.expect;
