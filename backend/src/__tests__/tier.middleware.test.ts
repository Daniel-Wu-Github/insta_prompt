import { describe, expect, it } from "bun:test";
import { Hono } from "hono";

import { tierMiddleware } from "../middleware/tier";

function createTierHarness(seedTier?: string) {
	const app = new Hono();

	if (seedTier !== undefined) {
		app.use("*", async (c, next) => {
			(c as unknown as { set: (key: string, value: unknown) => void }).set("tier", seedTier);
			await next();
		});
	}

	app.use("*", tierMiddleware);

	app.post("/segment", async (c) => {
		const body = await c.req.json().catch(() => null);
		return c.json({ ok: true, body });
	});

	app.get("/projects", (c) => {
		return c.json({ ok: true });
	});

	return app;
}

describe("tier middleware", () => {
	it("returns deterministic 401 UNAUTHORIZED when tier context is missing", async () => {
		const app = createTierHarness();
		const response = await app.fetch(
			new Request("http://localhost/segment", {
				method: "POST",
			}),
		);

		const body = (await response.json()) as {
			error: {
				code: string;
				message: string;
			};
		};

		expect(response.status).toBe(401);
		expect(body.error.code).toBe("UNAUTHORIZED");
		expect(body.error.message).toBe("Missing or invalid Authorization header");
	});

	it("returns deterministic 403 TIER_FORBIDDEN when tier value is unrecognized", async () => {
		const app = createTierHarness("enterprise");
		const response = await app.fetch(
			new Request("http://localhost/segment", {
				method: "POST",
			}),
		);

		const body = (await response.json()) as {
			error: {
				code: string;
				message: string;
			};
		};

		expect(response.status).toBe(403);
		expect(body.error.code).toBe("TIER_FORBIDDEN");
		expect(body.error.message).toBe("Tier is not allowed for this route");
	});

	it("passes recognized tier through /segment without model-choice blocking", async () => {
		const app = createTierHarness("free");
		const response = await app.fetch(
			new Request("http://localhost/segment", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					provider: "anthropic",
					model: "claude-3-opus",
				}),
			}),
		);

		expect(response.status).toBe(200);
	});

	it("keeps /projects open to recognized tiers in Step 2 default policy", async () => {
		const app = createTierHarness("free");
		const response = await app.fetch(new Request("http://localhost/projects"));

		expect(response.status).toBe(200);
	});
});
