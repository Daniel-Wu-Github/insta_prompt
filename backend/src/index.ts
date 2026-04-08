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

app.get("/health", (c) => {
	return c.json({ ok: true });
});

app.route("/auth", authRoutes);

// Preserve required middleware order: auth -> rate limit -> tier.
app.use("/segment", authMiddleware, rateLimitMiddleware, tierMiddleware);
app.use("/segment/*", authMiddleware, rateLimitMiddleware, tierMiddleware);
app.use("/enhance", authMiddleware, rateLimitMiddleware, tierMiddleware);
app.use("/enhance/*", authMiddleware, rateLimitMiddleware, tierMiddleware);
app.use("/bind", authMiddleware, rateLimitMiddleware, tierMiddleware);
app.use("/bind/*", authMiddleware, rateLimitMiddleware, tierMiddleware);
app.use("/projects", authMiddleware, rateLimitMiddleware, tierMiddleware);
app.use("/projects/*", authMiddleware, rateLimitMiddleware, tierMiddleware);

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

