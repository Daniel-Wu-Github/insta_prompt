import "./env";

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

//debug .env
console.log("=== BOOTSTRAP ENV CHECK ===");
console.log("1. SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("2. ANON_KEY PREFIX:", process.env.SUPABASE_ANON_KEY?.substring(0, 10) + "...");
console.log("3. SERVICE_KEY PREFIX:", process.env.SUPABASE_SERVICE_KEY?.substring(0, 10) + "...");
console.log("4. GROQ_API_KEY PREFIX:", process.env.GROQ_API_KEY?.substring(0, 10) + "...");
console.log("5. ANTHROPIC_API_KEY PREFIX:", process.env.ANTHROPIC_API_KEY?.substring(0, 10) + "...");
console.log("6. UPSTASH_REDIS_URL PREFIX:", process.env.UPSTASH_REDIS_URL?.substring(0, 10) + "...");
console.log("7. UPSTASH_REDIS_TOKEN PREFIX:", process.env.UPSTASH_REDIS_TOKEN?.substring(0, 10) + "...");
console.log("8. REDIS_URL PREFIX:", process.env.REDIS_URL?.substring(0, 10) + "...");
console.log("9. JWT_SECRET PREFIX:", process.env.JWT_SECRET?.substring(0, 10) + "...");
console.log("10. PORT:", process.env.PORT);
console.log("===========================");


const app = new Hono<AppEnv>();
const PROTECTED_ROUTE_PREFIXES = ["/segment", "/enhance", "/bind", "/projects"] as const;

app.get("/health", (c) => {
	return c.json({ ok: true });
});

// /auth stays public; /auth/token abuse protection is enforced in authRoutes.
app.route("/auth", authRoutes);

// Preserve required middleware order on protected routes: auth -> ratelimit -> tier.
for (const routePrefix of PROTECTED_ROUTE_PREFIXES) {
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

