import type { ZodError, ZodType } from "zod";

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ZodError };

export function parseWithSchema<TOutput>(
  schema: ZodType<TOutput>,
  input: unknown,
): ParseResult<TOutput> {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error };
  }
  return { ok: true, data: result.data };
}
