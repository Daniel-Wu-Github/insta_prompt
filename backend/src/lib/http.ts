import type { Context } from "hono";

import { toValidationError } from "./errors";

export async function readJsonBody(c: Context): Promise<unknown | null> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export function validationErrorResponse(c: Context, detailsMessage = "Invalid request payload") {
  return c.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: detailsMessage,
        details: [
          {
            path: "",
            message: detailsMessage,
          },
        ],
      },
    },
    400,
  );
}

export function zodValidationErrorResponse(c: Context, error: Parameters<typeof toValidationError>[0]) {
  return c.json(toValidationError(error), 400);
}
