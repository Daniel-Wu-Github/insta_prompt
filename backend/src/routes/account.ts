import { Hono } from "hono";

import { FREE_DAILY_LIMIT, peekDailyFreeQuotaCount } from "../services/rateLimit";
import type { AppEnv } from "../types";

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.get("/status", async (c) => {
	const userId = c.get("userId");
	const tier = c.get("tier");

	if (!userId || typeof userId !== "string" || userId.trim().length === 0) {
		return c.json(
			{
				error: {
					code: "UNAUTHORIZED",
					message: "Missing user context",
				},
			},
			401,
		);
	}

	const enhanceCount = tier === "free" ? await peekDailyFreeQuotaCount(userId) : 0;
	const dailyLimit = FREE_DAILY_LIMIT;

	return c.json({
		tier: tier ?? "free",
		enhanceCount,
		dailyLimit,
	});
});
