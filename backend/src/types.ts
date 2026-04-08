import type { Tier } from "../../shared/contracts";

export type AppEnv = {
  Variables: {
    userId: string;
    tier: Tier;
  };
};
