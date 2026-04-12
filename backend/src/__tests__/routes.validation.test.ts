import { describe, expect, it } from "bun:test";

import app from "../index";

const jsonHeaders = {
  "Content-Type": "application/json",
};

describe("route validation", () => {
  it("returns 401 when auth header is missing on protected route", async () => {
    const response = await app.fetch(
      new Request("http://localhost/segment", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ segments: ["build feature"], mode: "balanced" }),
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

  it("returns 401 when Authorization header is malformed", async () => {
    const response = await app.fetch(
      new Request("http://localhost/segment", {
        method: "POST",
        headers: {
          ...jsonHeaders,
          Authorization: "dev-token",
        },
        body: JSON.stringify({ segments: ["build feature"], mode: "balanced" }),
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

  it("returns 401 when bearer token fails server-side verification", async () => {
    const response = await app.fetch(
      new Request("http://localhost/segment", {
        method: "POST",
        headers: {
          ...jsonHeaders,
          Authorization: "Bearer dev-token",
        },
        body: JSON.stringify({ segments: ["build feature"], mode: "balanced" }),
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

  it("uses the same unauthorized envelope for missing and invalid bearer tokens", async () => {
    const missingAuthResponse = await app.fetch(
      new Request("http://localhost/enhance", {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ section: { id: "s1" } }),
      }),
    );

    const invalidTokenResponse = await app.fetch(
      new Request("http://localhost/enhance", {
        method: "POST",
        headers: {
          ...jsonHeaders,
          Authorization: "Bearer not-a-real-token",
        },
        body: JSON.stringify({ section: { id: "s1" } }),
      }),
    );

    const missingAuthBody = (await missingAuthResponse.json()) as {
      error: {
        code: string;
        message: string;
      };
    };

    const invalidTokenBody = (await invalidTokenResponse.json()) as {
      error: {
        code: string;
        message: string;
      };
    };

    expect(missingAuthResponse.status).toBe(401);
    expect(invalidTokenResponse.status).toBe(401);
    expect(invalidTokenBody).toEqual(missingAuthBody);
  });
});
