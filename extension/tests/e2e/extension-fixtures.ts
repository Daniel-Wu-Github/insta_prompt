import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, chromium, type BrowserContext } from "@playwright/test";
import { deleteTestUser, injectSession, mintTestSession, type TestSession } from "./auth-helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, "../../.output/chrome-mv3");

export const test = base.extend<{
	context: BrowserContext;
	extensionId: string;
	testSession: TestSession;
	authedPage: import("@playwright/test").Page;
}>({
	// eslint-disable-next-line no-empty-pattern
	context: async ({}, use) => {
		const context = await chromium.launchPersistentContext("", {
			// Chrome extensions require a persistent (non-incognito) context and
			// currently need a headed browser — Playwright's headless Chromium does
			// not reliably load unpacked MV3 extensions.
			headless: false,
			args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`],
		});
		await use(context);
		await context.close();
	},
	extensionId: async ({ context }, use) => {
		let [background] = context.serviceWorkers();
		if (!background) {
			background = await context.waitForEvent("serviceworker");
		}
		const extensionId = background.url().split("/")[2];
		await use(extensionId);
	},
	// Real Supabase session (admin-created, no confirmation email — see
	// auth-helpers.ts) — used by tests that need an authenticated segment/
	// enhance/bind cycle instead of just checking DOM instrumentation.
	testSession: async ({}, use) => {
		const session = await mintTestSession();
		await use(session);
		await deleteTestUser(session.userId);
	},
	// Injects the session into the SW's storage, then opens a fresh page so the
	// content script's first read of chrome.storage.local already sees the auth.
	authedPage: async ({ context, testSession }, use) => {
		await injectSession(context, testSession);
		const page = await context.newPage();
		await use(page);
		await page.close();
	},
});

export const expect = test.expect;
