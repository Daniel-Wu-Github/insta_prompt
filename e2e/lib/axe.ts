// G-1 axe gate helper. AxeBuilder pierces open shadow roots by default, so
// post-D1 all four extension surfaces (overlay, popover, ghost panel, HUD)
// are inside the scan. The gate: zero critical/serious violations on the page
// while extension surfaces are visible.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export async function criticalA11yViolations(page: Page): Promise<Array<{ id: string; impact: string | null | undefined; nodes: number }>> {
	const results = await new AxeBuilder({ page }).analyze();
	return results.violations
		.filter((violation) => violation.impact === "critical" || violation.impact === "serious")
		.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.length }));
}
