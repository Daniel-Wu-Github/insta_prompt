import { test, expect } from "./extension-fixtures";

// These tests need a real Supabase session (see auth-helpers.ts) because
// segmentation/enhance/bind all hit the live backend, which verifies real
// Supabase JWTs (backend/src/middleware/auth.ts -> supabase.auth.getUser).
const FIXTURE_URL = "http://127.0.0.1:4173/plain-textarea.html";
const SEGMENT_ROOT_SELECTOR = "[data-insta-draft-segment-root]";
const OVERLAY_HOST_SELECTOR = "[data-insta-draft-overlay]";
// Same selector the content script itself uses to suppress overlays under
// modals (extension/src/content/index.ts:3168-3169) — reused here as the
// "any extension overlay node" query for the retained-node check.
const ANY_EXTENSION_OVERLAY_SELECTOR =
	"[data-insta-draft-overlay], [data-insta-draft-hover-popover], [data-insta-ghost-panel]";
const MULTI_CLAUSE_PROMPT = "Fix the login bug. Use TypeScript. Add unit tests for the auth flow.";

async function waitForSegments(page: import("@playwright/test").Page): Promise<void> {
	await page.waitForFunction(
		(selector) => {
			const root = document.querySelector(selector);
			const count = root?.getAttribute("data-insta-draft-segments");
			return count !== null && count !== undefined && count !== "0";
		},
		SEGMENT_ROOT_SELECTOR,
		{ timeout: 20_000 },
	);
}

async function assertOverlayTracksComposer(
	page: import("@playwright/test").Page,
	composer: import("@playwright/test").Locator,
	tolerancePx: number,
): Promise<void> {
	const [overlayBox, composerBox] = await Promise.all([page.locator(OVERLAY_HOST_SELECTOR).boundingBox(), composer.boundingBox()]);
	expect(overlayBox, "overlay host must be rendered").not.toBeNull();
	expect(composerBox, "composer must be rendered").not.toBeNull();
	if (!overlayBox || !composerBox) return;

	expect(Math.abs(overlayBox.x - composerBox.x)).toBeLessThanOrEqual(tolerancePx);
	expect(Math.abs(overlayBox.y - composerBox.y)).toBeLessThanOrEqual(tolerancePx);
	expect(Math.abs(overlayBox.width - composerBox.width)).toBeLessThanOrEqual(tolerancePx);
	expect(Math.abs(overlayBox.height - composerBox.height)).toBeLessThanOrEqual(tolerancePx);
}

test.describe("authenticated segment -> bind -> commit cycle", () => {
	test("overlay stays clipped to the source textarea (A2 proxy)", async ({ authedPage }) => {
		await authedPage.goto(FIXTURE_URL);
		const composer = authedPage.locator("#composer");
		await composer.click();
		await composer.fill(MULTI_CLAUSE_PROMPT);
		await waitForSegments(authedPage);
		await assertOverlayTracksComposer(authedPage, composer, 2);
	});

	test("zero retained overlay nodes after full accept -> bind -> commit cycle (A3/G-3 proxy)", async ({
		authedPage,
	}) => {
		await authedPage.goto(FIXTURE_URL);
		const composer = authedPage.locator("#composer");
		await composer.click();
		await composer.fill(MULTI_CLAUSE_PROMPT);

		await authedPage.waitForFunction(
			(selector) => {
				const root = document.querySelector(selector);
				const count = root?.getAttribute("data-insta-draft-segments");
				return count !== null && count !== undefined && count !== "0";
			},
			SEGMENT_ROOT_SELECTOR,
			{ timeout: 20_000 },
		);

		const segmentCount = await authedPage
			.locator(SEGMENT_ROOT_SELECTOR)
			.getAttribute("data-insta-draft-segments")
			.then((value) => Number.parseInt(value ?? "0", 10));
		expect(segmentCount).toBeGreaterThan(0);

		// Tab enters review mode / advances focus; Enter accepts the focused clause.
		for (let i = 0; i < segmentCount; i += 1) {
			await authedPage.keyboard.press("Tab");
			await authedPage.keyboard.press("Enter");
		}

		// Cmd+Enter dispatches the bind (ghost streaming) request.
		await authedPage.keyboard.press("Meta+Enter");

		// Ghost panel is shadow-DOM (attachShadow({mode:"open"}) at index.ts:1621) —
		// pierce it manually rather than relying on locator auto-piercing for text.
		await authedPage.waitForFunction(
			() => {
				const panel = document.querySelector("[data-insta-ghost-panel]");
				return panel?.shadowRoot?.textContent?.includes("Press Enter to commit") ?? false;
			},
			{ timeout: 20_000 },
		);

		const originalValue = await composer.inputValue();
		await authedPage.keyboard.press("Enter"); // commit

		await expect(composer).not.toHaveValue(originalValue, { timeout: 5_000 });

		// resetActiveInputAfterCommit (index.ts:2394) must tear down every overlay
		// node it created — this is the DOM-count proxy for the real DevTools
		// heap-snapshot check in human/03_MANUAL_TESTING_GUIDE.md's G-3 drill.
		await expect(authedPage.locator(ANY_EXTENSION_OVERLAY_SELECTOR)).toHaveCount(0);
	});
});
