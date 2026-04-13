import { Hono } from "hono";

import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware } from "./middleware/ratelimit";
import { tierMiddleware } from "./middleware/tier";
import { authRoutes } from "./routes/auth";
import { bindRoutes } from "./routes/bind";
import { enhanceRoutes } from "./routes/enhance";
import { projectRoutes } from "./routes/projects";
import { segmentRoutes } from "./routes/segment";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();
const PROTECTED_ROUTE_PREFIXES = ["/segment", "/enhance", "/bind", "/projects"] as const;

app.get("/health", (c) => {
	return c.json({ ok: true });
});

// /auth stays public; /auth/token abuse protection is enforced in authRoutes.
app.route("/auth", authRoutes);

// Preserve required middleware order on protected routes: auth -> ratelimit -> tier.
for (const routePrefix of PROTECTED_ROUTE_PREFIXES) {
	app.use(routePrefix, authMiddleware, rateLimitMiddleware, tierMiddleware);
	app.use(`${routePrefix}/*`, authMiddleware, rateLimitMiddleware, tierMiddleware);
}

app.route("/segment", segmentRoutes);
app.route("/enhance", enhanceRoutes);
app.route("/bind", bindRoutes);
app.route("/projects", projectRoutes);

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

