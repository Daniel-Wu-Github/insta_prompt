import { describe, expect, it } from "bun:test";

import app from "../index";

const authHeaders = {
  Authorization: "Bearer dev-token",
  "Content-Type": "application/json",
};

describe("route validation", () => {
  it("returns 401 when auth header is missing on protected route", async () => {
    const response = await app.fetch(
      new Request("http://localhost/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: ["build feature"], mode: "balanced" }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("returns validation envelope for invalid segment payload", async () => {
    const response = await app.fetch(
      new Request("http://localhost/segment", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ mode: "balanced" }),
      }),
    );

    const body = (await response.json()) as {
      error: { code: string; details: Array<{ path: string; message: string }> };
    };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it("returns valid segment response using Step 0 deterministic action classification", async () => {
    const response = await app.fetch(
      new Request("http://localhost/segment", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ segments: ["build a dark mode toggle"], mode: "balanced" }),
      }),
    );

    const body = (await response.json()) as {
      sections: Array<{ id: string; goal_type: string; canonical_order: number }>;
    };

    expect(response.status).toBe(200);
    expect(body.sections.length).toBe(1);
    expect(body.sections[0].id).toBe("s1");
    expect(body.sections[0].goal_type).toBe("action");
    expect(body.sections[0].canonical_order).toBe(4);
  });

  it("returns validation envelope for invalid enhance payload", async () => {
    const response = await app.fetch(
      new Request("http://localhost/enhance", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ section: { id: "s1" } }),
      }),
    );

    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns validation envelope for invalid bind payload", async () => {
    const response = await app.fetch(
      new Request("http://localhost/bind", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ sections: [], mode: "balanced" }),
      }),
    );

    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns validation envelope for invalid x-user-tier header", async () => {
    const response = await app.fetch(
      new Request("http://localhost/segment", {
        method: "POST",
        headers: {
          Authorization: "Bearer dev-token",
          "Content-Type": "application/json",
          "x-user-tier": "enterprise",
        },
        body: JSON.stringify({ segments: ["build feature"], mode: "balanced" }),
      }),
    );

    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});
