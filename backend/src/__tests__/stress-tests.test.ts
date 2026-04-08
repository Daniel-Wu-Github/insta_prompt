import { describe, expect, it } from "bun:test";

import app from "../index";

const authHeaders = {
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
  it("processes 10 concurrent valid segment requests", async () => {
    const requests = Array(10)
      .fill(null)
      .map(() =>
        app.fetch(
          new Request("http://localhost/segment", {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ segments: ["build feature"], mode: "balanced" }),
          }),
        ),
      );

    const responses = await Promise.all(requests);
    const successCount = responses.filter((r) => r.status === 200).length;
    expect(successCount).toBe(10);
  });

  it("processes 10 concurrent invalid segment requests", async () => {
    const requests = Array(10)
      .fill(null)
      .map(() =>
        app.fetch(
          new Request("http://localhost/segment", {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ mode: "balanced" }),
          }),
        ),
      );

    const responses = await Promise.all(requests);
    const invalidCount = responses.filter((r) => r.status === 400).length;
    expect(invalidCount).toBe(10);
  });
});

describe("stress: sse envelope", () => {
  it("bind returns tokenized SSE with done event", async () => {
    const response = await app.fetch(
      new Request("http://localhost/bind", {
        method: "POST",
        headers: authHeaders,
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

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text.includes("\"type\":\"token\"")).toBe(true);
    expect(text.includes("\"type\":\"done\"")).toBe(true);
  });
});
