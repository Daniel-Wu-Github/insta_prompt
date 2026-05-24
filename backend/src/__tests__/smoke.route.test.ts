import { describe, expect, it } from "bun:test";

import app from "../index";

describe("/health and /smoke routes", () => {
	it("/health returns 200 with status ok", async () => {
		const response = await app.fetch(new Request("http://localhost/health"));
		expect(response.status).toBe(200);
		const payload = (await response.json()) as { ok?: boolean; status?: string };
		expect(payload.ok === true || payload.status === "ok").toBe(true);
	});

	it("/smoke returns 200 with the documented routes payload", async () => {
		const response = await app.fetch(new Request("http://localhost/smoke"));
		expect(response.status).toBe(200);
		const payload = (await response.json()) as {
			status?: string;
			routes?: string[];
			ts?: number;
		};
		expect(payload.status).toBe("ok");
		expect(payload.routes).toEqual(["segment", "enhance", "bind"]);
		expect(typeof payload.ts).toBe("number");
	});

	it("/smoke requires no auth header", async () => {
		const response = await app.fetch(
			new Request("http://localhost/smoke", {
				method: "GET",
			}),
		);
		expect(response.status).toBe(200);
	});

	it("echoes X-Request-ID when supplied", async () => {
		const requestId = "test-trace-123";
		const response = await app.fetch(
			new Request("http://localhost/smoke", {
				headers: { "X-Request-ID": requestId },
			}),
		);
		expect(response.headers.get("X-Request-ID")).toBe(requestId);
	});
});
