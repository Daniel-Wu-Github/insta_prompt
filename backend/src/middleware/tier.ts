import type { MiddlewareHandler } from "hono";
import { TIER_VALUES, type Tier } from "../../../shared/contracts";

type TierRoutePolicy = {
	routePrefix: string;
	allowedTiers: readonly Tier[];
};

const RECOGNIZED_TIERS = new Set<string>(TIER_VALUES);

// Step 2 default policy keeps recognized tiers open unless explicitly gated.
const STRICT_TIER_ROUTE_POLICIES: readonly TierRoutePolicy[] = [];

function unauthorizedResponse() {
	return {
		error: {
			code: "UNAUTHORIZED",
			message: "Missing or invalid Authorization header",
		},
	};
}

function forbiddenResponse() {
	return {
		error: {
			code: "TIER_FORBIDDEN",
			message: "Tier is not allowed for this route",
		},
	};
}

function isRecognizedTier(value: unknown): value is Tier {
	return typeof value === "string" && RECOGNIZED_TIERS.has(value);
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
	return path === prefix || path.startsWith(`${prefix}/`);
}

function resolveRoutePolicy(path: string): TierRoutePolicy | null {
	for (const policy of STRICT_TIER_ROUTE_POLICIES) {
		if (pathMatchesPrefix(path, policy.routePrefix)) {
			return policy;
		}
	}

	return null;
}

export const tierMiddleware: MiddlewareHandler = async (c, next) => {
	const tierFromContext = c.get("tier");
	if (tierFromContext === undefined || tierFromContext === null) {
		return c.json(unauthorizedResponse(), 401);
	}

	if (!isRecognizedTier(tierFromContext)) {
		return c.json(forbiddenResponse(), 403);
	}

	const policy = resolveRoutePolicy(c.req.path);
	if (policy && !policy.allowedTiers.includes(tierFromContext)) {
		return c.json(forbiddenResponse(), 403);
	}

	await next();
};

