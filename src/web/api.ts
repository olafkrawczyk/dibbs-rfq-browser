import { z } from "zod";
import type { SyncRunId } from "../shared/brand";
import { ApiErrorBody, Facets, Meta, RfqListResponse, SyncRun } from "../shared/schemas";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// Sync endpoints answer `{ run }` (§6); a bare run is accepted too.
const RunEnvelope = z.union([z.object({ run: SyncRun }).transform((r) => r.run), SyncRun]);

async function request<S extends z.ZodType>(
  schema: S, url: string, init: RequestInit | undefined, fetchFn: typeof fetch,
): Promise<z.infer<S>> {
  const res = await fetchFn(url, { ...init, headers: { accept: "application/json" } });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const err = ApiErrorBody.safeParse(body);
    if (err.success) throw new ApiError(res.status, err.data.error.code, err.data.error.message);
    throw new ApiError(res.status, `http_${res.status}`, res.statusText || `HTTP ${res.status}`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError(res.status, "bad_response", `Unexpected response from ${url}`);
  return parsed.data;
}

const qs = (p: URLSearchParams) => (p.size ? `?${p}` : "");

export const fetchRfqs = (p: URLSearchParams, fetchFn = fetch) =>
  request(RfqListResponse, `/api/rfqs${qs(p)}`, undefined, fetchFn);

export const fetchFacets = (p: URLSearchParams, fetchFn = fetch) =>
  request(Facets, `/api/rfqs/facets${qs(p)}`, undefined, fetchFn);

export const fetchMeta = (fetchFn = fetch) => request(Meta, "/api/meta", undefined, fetchFn);

export const startSync = (fetchFn = fetch) => request(RunEnvelope, "/api/sync", { method: "POST" }, fetchFn);

export const fetchSyncRun = (id: SyncRunId, fetchFn = fetch) =>
  request(RunEnvelope, `/api/sync/${id}`, undefined, fetchFn);
