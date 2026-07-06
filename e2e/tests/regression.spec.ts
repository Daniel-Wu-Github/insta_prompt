// A1 (idempotency under SPA churn) across the 8-site fixture matrix — the
// automated form of human/03_MANUAL_TESTING_GUIDE.md's site table.
import { test, expect } from "../fixtures/extension";
import {
	SITES,
	SAMPLE_PROMPT,
	typeAndAwaitUnderlines,
	countOverlayHosts,
	overlaySpanCount,
	hasUnsupportedToast,
	churnEditorNode,
} from "../lib/helpers";

for (const site of SITES) {
	test(`A1 ${site.name}: underlines render once, survive node churn, no unsupported toast`, async ({ context, serviceWorker }) => {
		void serviceWorker;
		const page = await context.newPage();
		await page.goto(site.path);

		const rendered = await typeAndAwaitUnderlines(page, site.editor, SAMPLE_PROMPT);
		expect(rendered, "underlines should render after typing").toBe(true);

		expect(await countOverlayHosts(page)).toBe(1);
		expect(await overlaySpanCount(page)).toBeGreaterThanOrEqual(3);
		expect(await hasUnsupportedToast(page)).toBe(false);

		// React-style node replacement (the BUG-REACT scenario): the WeakSet
		// idempotency marker must re-instrument the NEW node exactly once and
		// never stack a duplicate overlay.
		await churnEditorNode(page, site.editor);
		await page.click(site.editor);
		await page.keyboard.type(" Also add tests.", { delay: 5 });
		await page.waitForTimeout(700); // debounce + render

		expect(await countOverlayHosts(page)).toBe(1);
		expect(await hasUnsupportedToast(page)).toBe(false);

		await page.close();
	});
}

test("A1 linear: full SPA navigation drill detaches and re-attaches cleanly", async ({ context, serviceWorker }) => {
	void serviceWorker;
	const page = await context.newPage();
	await page.goto("/sites/linear.html");

	expect(await typeAndAwaitUnderlines(page, ".editor-root", SAMPLE_PROMPT)).toBe(true);

	// Route change: main unmounts, fresh copy mounts.
	await page.evaluate(() => (window as Window & { __spaNavigate?: () => void }).__spaNavigate?.());
	await page.waitForTimeout(400);

	// Old overlay must not survive pointing at a detached editor...
	expect(await typeAndAwaitUnderlines(page, ".editor-root", SAMPLE_PROMPT)).toBe(true);
	// ...and re-typing must yield exactly one fresh overlay.
	expect(await countOverlayHosts(page)).toBe(1);
	expect(await hasUnsupportedToast(page)).toBe(false);

	await page.close();
});
