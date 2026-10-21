import { z } from "zod";

export const json = (data: unknown, status = 200): Response => Response.json(data, { status });

export const apiError = (status: number, code: string, message: string, issues?: unknown[]): Response =>
  json({ error: { code, message, ...(issues ? { issues } : {}) } }, status);

const DB_DOWN = /ECONNREFUSED|ERR_POSTGRES_CONNECTION|connection (closed|refused|terminated)/i;

function isDbUnavailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: unknown }).code;
  return DB_DOWN.test(String(code ?? "")) || DB_DOWN.test(err.message);
}

/** Maps thrown errors to the API error format: zod → 400, database unreachable → 503, else 500. */
export function withErrors<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof z.ZodError) return apiError(400, "invalid_request", "Invalid request", err.issues);
      if (isDbUnavailable(err)) return apiError(503, "db_unavailable", "Database is unavailable");
      console.error("[api] unhandled error", err);
      return apiError(500, "internal", "Internal server error");
    }
  };
}
