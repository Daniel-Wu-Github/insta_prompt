import { describe, expect, it } from "bun:test";

import app from "../index";

const invalidAuthHeaders = {
  Authorization: "Bearer dev-token",
  "Content-Type": "application/json",
};

describe("stress: middleware ordering", () => {
  it("auth middleware rejects before payload validation", async () => {
    const response = await app.fetch(
      new Request("http://localhost/segment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "balanced" }),
      }),
    );

    expect(response.status).toBe(401);
  });
});

describe("stress: concurrent requests", () => {
  it("rejects 10 concurrent segment requests with invalid bearer tokens", async () => {
    const requests = Array(10)
      .fill(null)
      .map(() =>
        app.fetch(
          new Request("http://localhost/segment", {
            method: "POST",
            headers: invalidAuthHeaders,
            body: JSON.stringify({ segments: ["build feature"], mode: "balanced" }),
          }),
        ),
      );

    const responses = await Promise.all(requests);
    const unauthorizedCount = responses.filter((r) => r.status === 401).length;
    expect(unauthorizedCount).toBe(10);
  });

  it("rejects 10 concurrent segment requests with missing auth", async () => {
    const requests = Array(10)
      .fill(null)
      .map(() =>
        app.fetch(
          new Request("http://localhost/segment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "balanced" }),
          }),
        ),
      );

    const responses = await Promise.all(requests);
    const unauthorizedCount = responses.filter((r) => r.status === 401).length;
    expect(unauthorizedCount).toBe(10);
  });
});

describe("stress: unauthorized envelope", () => {
  it("bind returns deterministic unauthorized payload for invalid bearer token", async () => {
    const response = await app.fetch(
      new Request("http://localhost/bind", {
        method: "POST",
        headers: invalidAuthHeaders,
        body: JSON.stringify({
          mode: "balanced",
          sections: [
            {
              canonical_order: 4,
              goal_type: "action",
              expansion: "Implement dark mode toggle",
            },
          ],
        }),
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
});
