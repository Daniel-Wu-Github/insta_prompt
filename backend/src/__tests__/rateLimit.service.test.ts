import { afterEach, describe, expect, it } from "bun:test";

import {
	__resetRateLimitRedisClientForTests,
	__setRateLimitRedisClientForTests,
	consumeDailyFreeQuota,
	FREE_DAILY_LIMIT,
} from "../services/rateLimit";

describe("rate limit service", () => {
	afterEach(async () => {
		await __resetRateLimitRedisClientForTests();
	});

	it("repairs daily quota expiry if initial EXPIREAT does not stick", async () => {
		let used = 0;
		let expireAtCalls = 0;
		let ttlCalls = 0;

		__setRateLimitRedisClientForTests({
			async incr() {
				used += 1;
				return used;
			},
			async expireat() {
				expireAtCalls += 1;
				return expireAtCalls === 1 ? 0 : 1;
			},
			async expire() {
				return 1;
			},
			async ttl() {
				ttlCalls += 1;
				return -1;
			},
		});

		const now = new Date("2026-04-15T12:00:00.000Z");
		const first = await consumeDailyFreeQuota("user-1", now);
		const second = await consumeDailyFreeQuota("user-1", now);

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		if (!first.ok || !second.ok) {
			throw new Error("Expected daily quota calls to succeed");
		}

		expect(first.limit).toBe(FREE_DAILY_LIMIT);
		expect(first.used).toBe(1);
		expect(second.used).toBe(2);
		expect(expireAtCalls).toBe(2);
		expect(ttlCalls).toBe(1);
	});
});
