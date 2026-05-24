import { Hono } from "hono";

import { FREE_DAILY_LIMIT, peekDailyFreeQuotaCount } from "../services/rateLimit";

export const accountRoutes = new Hono();

accountRoutes.get("/status", async (c) => {
	const userId = c.get("userId") as string | undefined;
	const tier = c.get("tier") as string | undefined;

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
