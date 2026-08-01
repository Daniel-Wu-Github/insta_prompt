import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "./extension-fixtures";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AXE_CORE_PATH = path.resolve(__dirname, "../../node_modules/axe-core/axe.min.js");

// Covers the subset of human/03_MANUAL_TESTING_GUIDE.md's invariants that don't
// require a live backend session (segmentation/bind need a real JWT + network
// calls to the Fly.io backend, which this harness doesn't bootstrap yet — see
// the "Not covered" note at the bottom of this file).
const FIXTURE_URL = "http://127.0.0.1:4173/plain-textarea.html";
const UNSUPPORTED_TOAST_SELECTOR = "[data-unsupported-toast]";
const INSTRUMENTED_ATTR = "data-insta-instrumented";

test.describe("extension loads and instruments inputs", () => {
	test("service worker is registered", async ({ extensionId }) => {
		expect(extensionId).toMatch(/^[a-p]{32}$/);
	});

	test("plain textarea gets instrumented, no ghost toast (A1 sunny)", async ({ context, page }) => {
		await page.goto(FIXTURE_URL);
		const textarea = page.locator("#composer");
		await textarea.click();
		await expect(textarea).toHaveAttribute(INSTRUMENTED_ATTR, "true", { timeout: 5_000 });
		await expect(page.locator(UNSUPPORTED_TOAST_SELECTOR)).toHaveCount(0);
	});

	test("contenteditable composer gets instrumented, no ghost toast (A1 sunny)", async ({ page }) => {
		await page.goto(FIXTURE_URL);
		const richComposer = page.locator("#rich-composer");
		await richComposer.click();
		await expect(richComposer).toHaveAttribute(INSTRUMENTED_ATTR, "true", { timeout: 5_000 });
		await expect(page.locator(UNSUPPORTED_TOAST_SELECTOR)).toHaveCount(0);
	});

	test("BUG-REACT regression: stripped attribute does not refire toast (A1 rainy proxy)", async ({ page }) => {
		// The WeakSet instrumentation marker (not the DOM attribute) is the source
		// of truth precisely because React strips unknown attributes during
		// reconciliation on the real target sites. This simulates that strip on
		// the *same* element (not a replacement) and asserts the toast still
		// doesn't fire — proving the WeakSet, not the attribute, gates the toast.
		await page.goto(FIXTURE_URL);
		const textarea = page.locator("#composer");
		await textarea.click();
		await expect(textarea).toHaveAttribute(INSTRUMENTED_ATTR, "true", { timeout: 5_000 });

		await textarea.evaluate((el) => el.removeAttribute("data-insta-instrumented"));
		await textarea.evaluate((el) => {
			el.blur();
			el.focus();
		});

		await expect(page.locator(UNSUPPORTED_TOAST_SELECTOR)).toHaveCount(0);
	});
});

test.describe("accessibility (G-1 proxy)", () => {
	test("fixture page + extension shadow DOM has no axe violations", async ({ page }) => {
		await page.goto(FIXTURE_URL);
		await page.locator("#composer").click();
		await page.waitForTimeout(500);

		// axe-core scans open shadow roots by default; every shadow root this
		// extension attaches uses { mode: "open" } (see extension/src/content/index.ts).
		await page.addScriptTag({ path: AXE_CORE_PATH });
		const results = await page.evaluate(async () => {
			// @ts-expect-error injected by addScriptTag
			return await window.axe.run();
		});

		expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
	});
});

// NOT covered by this harness yet (needs a bootstrapped auth session + live
// segmentation/bind calls to the backend — out of scope for this pass):
// - A2 (overlay clip / pixel parity): needs real underline overlay output.
// - A3/G-3 heap snapshot: needs a real draft-overlay/ghost-panel node to exist,
//   which only appears after a completed segment -> accept -> bind cycle.
// - Real target sites (ChatGPT, Claude.ai, Notion, Linear, GitHub, Gmail,
//   Slack): all auth-gated; automating login against live third-party
//   services is out of scope here (ToS/bot-detection risk) — those stay on
//   the manual guide.
