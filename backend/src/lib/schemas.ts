import { z } from "zod";

import {
  GOAL_TYPE_VALUES,
  MODE_VALUES,
  SECTION_STATUS_VALUES,
  TIER_VALUES,
} from "../../../shared/contracts";

const goalTypeSchema = z.enum(GOAL_TYPE_VALUES);
const modeSchema = z.enum(MODE_VALUES);
const tierSchema = z.enum(TIER_VALUES);
const sectionStatusSchema = z.enum(SECTION_STATUS_VALUES);

export const sectionSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    goal_type: goalTypeSchema,
    canonical_order: z.number().int().min(1).max(6),
    confidence: z.number().min(0).max(1),
    depends_on: z.array(z.string().min(1)),
    expansion: z.string().min(1).optional(),
    status: sectionStatusSchema.optional(),
  })
  .strict();

export const sectionInputSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    goal_type: goalTypeSchema,
  })
  .strict();

export const segmentRequestSchema = z
  .object({
    segments: z.array(z.string().min(1)).min(1),
    mode: modeSchema,
  })
  .strict();

export const segmentResponseSchema = z
  .object({
    sections: z.array(sectionSchema),
  })
  .strict();

export const enhanceRequestSchema = z
  .object({
    section: sectionInputSchema,
    siblings: z.array(sectionInputSchema),
    mode: modeSchema,
    project_id: z.string().min(1).nullable(),
  })
  .strict();

export const bindRequestSchema = z
  .object({
    sections: z
      .array(
        z
          .object({
            canonical_order: z.number().int().min(1).max(6),
            goal_type: goalTypeSchema,
            expansion: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    mode: modeSchema,
  })
  .strict();

export const authTokenRequestSchema = z
  .object({
    refresh_token: z.string().min(1).optional(),
  })
  .strict();

export const projectContextRequestSchema = z
  .object({
    chunks: z
      .array(
        z
          .object({
            file_path: z.string().min(1),
            content: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const projectIdParamSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export const authHeaderSchema = z
  .object({
    authorization: z.string().startsWith("Bearer "),
  })
  .strict();

export const userTierHeaderSchema = z
  .object({
    "x-user-tier": tierSchema.optional(),
  })
  .strict();

export type GoalType = z.infer<typeof goalTypeSchema>;
export type Mode = z.infer<typeof modeSchema>;
export type Tier = z.infer<typeof tierSchema>;
