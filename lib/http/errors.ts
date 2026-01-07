export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  status: number = 500
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
      },
    } as ApiError,
    { status }
  );
}

export const ErrorCodes = {
  MISSING_CONFIG: "MISSING_CONFIG",
  INVALID_PARAM: "INVALID_PARAM",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  TIMEOUT: "TIMEOUT",
  UNKNOWN: "UNKNOWN",
} as const;

