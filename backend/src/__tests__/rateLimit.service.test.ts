import { afterEach, describe, expect, it } from "bun:test";

import {
	__resetProtectedBurstConfigForTests,
	__resetRateLimitRedisClientForTests,
	__setProtectedBurstConfigForTests,
	__setRateLimitRedisClientForTests,
	consumeDailyFreeQuota,
	consumeProtectedRouteBurstQuota,
	FREE_DAILY_LIMIT,
} from "../services/rateLimit";

describe("rate limit service", () => {
	afterEach(async () => {
		__resetProtectedBurstConfigForTests();
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

	it("marks near-threshold and exceeded states deterministically for protected burst quota", async () => {
		let used = 0;

		__setProtectedBurstConfigForTests({
			limit: 5,
			windowSeconds: 10,
			nearThreshold: 4,
		});

		__setRateLimitRedisClientForTests({
			async incr() {
				used += 1;
				return used;
			},
			async expireat() {
				return 1;
			},
			async expire() {
				return 1;
			},
			async ttl() {
				return 9;
			},
		});

		const now = new Date("2026-04-15T12:00:00.000Z");
		const responses = [];
		for (let count = 0; count < 6; count += 1) {
			responses.push(await consumeProtectedRouteBurstQuota("user-1", now));
		}

		for (const response of responses) {
			expect(response.ok).toBe(true);
			if (!response.ok) {
				throw new Error("Expected protected burst quota calls to succeed");
			}
			expect(response.limit).toBe(5);
			expect(response.windowSeconds).toBe(10);
			expect(response.retryAfter).toBeGreaterThan(0);
		}

		const fourth = responses[3];
		const fifth = responses[4];
		const sixth = responses[5];
		if (!fourth?.ok || !fifth?.ok || !sixth?.ok) {
			throw new Error("Expected protected burst quota responses to be successful");
		}

		expect(fourth.nearThreshold).toBe(true);
		expect(fourth.exceeded).toBe(false);
		expect(fifth.nearThreshold).toBe(true);
		expect(fifth.exceeded).toBe(false);
		expect(sixth.nearThreshold).toBe(true);
		expect(sixth.exceeded).toBe(true);
		expect(sixth.remaining).toBe(0);
	});

	it("repairs protected burst expiry if initial EXPIRE does not stick", async () => {
		let used = 0;
		let expireCalls = 0;
		let ttlCalls = 0;

		__setProtectedBurstConfigForTests({
			limit: 5,
			windowSeconds: 8,
			nearThreshold: 4,
		});

		__setRateLimitRedisClientForTests({
			async incr() {
				used += 1;
				return used;
			},
			async expireat() {
				return 1;
			},
			async expire() {
				expireCalls += 1;
				return expireCalls === 1 ? 0 : 1;
			},
			async ttl() {
				ttlCalls += 1;
				return -1;
			},
		});

		const now = new Date("2026-04-15T12:00:00.000Z");
		const first = await consumeProtectedRouteBurstQuota("user-1", now);
		const second = await consumeProtectedRouteBurstQuota("user-1", now);

		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);
		if (!first.ok || !second.ok) {
			throw new Error("Expected protected burst quota calls to succeed");
		}

		expect(first.used).toBe(1);
		expect(second.used).toBe(2);
		expect(expireCalls).toBe(2);
		expect(ttlCalls).toBe(1);
	});
});
