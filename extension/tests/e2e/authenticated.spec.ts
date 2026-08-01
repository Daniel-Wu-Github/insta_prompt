import { test } from "./extension-fixtures";

// These tests need a real Supabase session (see auth-helpers.ts) because
// segmentation/enhance/bind all hit the live backend, which verifies real
// Supabase JWTs (backend/src/middleware/auth.ts -> supabase.auth.getUser).
//
// A2/A3 overlay-geometry and retained-node checks used to live here, but the
// D2 CSS Custom Highlights rewrite (origin/main, post-dating this file)
// changed the overlay's internal structure enough that the old selectors no
// longer match. `e2e/tests/parity.spec.ts` and `e2e/tests/retention.spec.ts`
// (the hermetic mock-backend suite already on main) cover that same ground
// against the current implementation — no need to duplicate/re-chase it here.
// This file is kept as the place for real-backend-auth-dependent checks that
// the mock-backend suite structurally can't do (e.g. real Supabase JWT
// verification, real Groq/Anthropic round-trips) if/when those are needed.
const FIXTURE_URL = "http://127.0.0.1:4173/plain-textarea.html";

test.describe("authenticated session smoke", () => {
	test("a minted Supabase session successfully drives a real segmentation call", async ({ authedPage }) => {
		await authedPage.goto(FIXTURE_URL);
		const composer = authedPage.locator("#composer");
		await composer.click();
		await composer.fill("Fix the login bug. Use TypeScript. Add unit tests for the auth flow.");

		// Real network round-trip proof: the "Backend URL is not configured" /
		// SEGMENT-failure warning never fires with a valid session + reachable
		// backend. If auth or connectivity break, this console warning appears.
		const warnings: string[] = [];
		authedPage.on("console", (msg) => {
			if (msg.type() === "warning" && msg.text().includes("SEGMENT request failed")) {
				warnings.push(msg.text());
			}
		});
		await authedPage.waitForTimeout(3_000);
		if (warnings.length > 0) {
			throw new Error(`Real segmentation call failed: ${warnings.join("; ")}`);
		}
	});
});
