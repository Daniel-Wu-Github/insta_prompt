import type { ZodError } from "zod";

import type { ValidationErrorBody } from "../../../shared/contracts/errors";

export function toValidationError(
  error: ZodError,
  message = "Invalid request payload",
): ValidationErrorBody {
  return {
    error: {
      code: "VALIDATION_ERROR",
      message,
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  };
}
