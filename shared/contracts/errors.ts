export type ValidationErrorDetail = {
  path: string;
  message: string;
};

export type ValidationErrorBody = {
  error: {
    code: "VALIDATION_ERROR";
    message: string;
    details: ValidationErrorDetail[];
  };
};
