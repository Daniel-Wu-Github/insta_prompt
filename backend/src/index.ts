import "./env";

import { Hono } from "hono";
import { cors } from "hono/cors";

import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/ratelimit";
import { tierMiddleware } from "./middleware/tier";
import { accountRoutes } from "./routes/account";
import { authRoutes } from "./routes/auth";
import { bindRoutes } from "./routes/bind";
import { enhanceRoutes } from "./routes/enhance";
import { projectRoutes } from "./routes/projects";
import { segmentRoutes } from "./routes/segment";
import type { AppEnv } from "./types";


const app = new Hono<AppEnv>();
const PROTECTED_ROUTE_PREFIXES = ["/segment", "/enhance", "/bind", "/projects"] as const;
const FLY_STAGING_ORIGIN = "https://promptcompiler-backend.fly.dev";

function isAllowedCorsOrigin(origin: string): boolean {
	return origin.startsWith("chrome-extension://") || origin === FLY_STAGING_ORIGIN;
}

app.use(
	"*",
	cors({
		origin: (origin) => (isAllowedCorsOrigin(origin) ? origin : ""),
		allowHeaders: ["Authorization", "Content-Type", "Accept", "X-Request-ID"],
		allowMethods: ["GET", "POST", "OPTIONS"],
	}),
);

// Capture client request IDs for traceability across SW + backend logs.
app.use("*", async (c, next) => {
	const requestId = c.req.header("X-Request-ID")?.trim() ?? "";
	if (requestId.length > 0) {
		c.set("requestId", requestId);
		c.header("X-Request-ID", requestId);
	}
	await next();
});

app.get("/health", (c) => {
	return c.json({ ok: true, status: "ok" });
});

app.get("/smoke", (c) => {
	return c.json({
		status: "ok",
		routes: ["segment", "enhance", "bind"],
		ts: Date.now(),
	});
});

// /auth stays public; /auth/token abuse protection is enforced in authRoutes.
app.route("/auth", authRoutes);

// Preserve required middleware order on protected routes: auth -> ratelimit -> tier.
for (const routePrefix of PROTECTED_ROUTE_PREFIXES) {
	app.use(`${routePrefix}/*`, authMiddleware, rateLimitMiddleware, tierMiddleware);
}

// /account is auth-gated read-only; no rate limiting (cheap + no LLM cost).
app.use("/account/*", authMiddleware, tierMiddleware);

app.route("/segment", segmentRoutes);
app.route("/enhance", enhanceRoutes);
app.route("/bind", bindRoutes);
app.route("/projects", projectRoutes);
app.route("/account", accountRoutes);

app.notFound((c) => {
	return c.json(
		{
			error: {
				code: "NOT_FOUND",
				message: "Route not found",
			},
		},
		404,
	);
});

export default app;
