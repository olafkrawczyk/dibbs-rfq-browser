import { expect, test } from "bun:test";
import { ApiError, fetchMeta } from "../../src/web/api";

const respond = (status: number, body: unknown): typeof fetch =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

const meta = { windowDays: 7, windowDates: ["2026-10-20"], dataAsOf: null, lastRun: null, activeRun: null, fscNames: {} };

test("parses a 2xx body with its schema", async () => {
  expect((await fetchMeta(respond(200, meta))).windowDays).toBe(7);
});

test("non-2xx throws ApiError with code and message", async () => {
  const err = await fetchMeta(respond(400, { error: { code: "invalid_request", message: "bad" } })).catch((e) => e);
  expect(err).toBeInstanceOf(ApiError);
  expect(err).toMatchObject({ status: 400, code: "invalid_request", message: "bad" });
});

test("non-JSON error body still throws ApiError", async () => {
  const f = (async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
  expect(await fetchMeta(f).catch((e) => e)).toMatchObject({ status: 502, code: "http_502" });
});

test("2xx body that fails the schema throws", async () => {
  expect(await fetchMeta(respond(200, { nope: 1 })).catch((e) => e)).toMatchObject({ code: "bad_response" });
});
