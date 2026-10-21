import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { SQL, Server } from "bun";
import { createServer } from "../../src/server/app";
import { upsertFscNames, upsertRfqs } from "../../src/db/rfq-repo";
import { claimNextRun, enqueueRun, finishRun, setWindow } from "../../src/db/sync-repo";
import { IsoDate } from "../../src/shared/brand";
import type { Config } from "../../src/config";
import { freshDb } from "../helpers/db";
import { scraped } from "../helpers/factory";

const config: Config = {
  databaseUrl: "unused", syncWindowDays: 7, syncIntervalMinutes: 60, dibbsRequestDelayMs: 0,
  syncStaleAfterMinutes: 30, port: 0, syncMaxPagesPerDay: null,
};
let sql: SQL;
let server: Server<unknown>;
const api = (path: string, init?: RequestInit) => fetch(new URL(path, server.url), init);

beforeAll(async () => {
  sql = await freshDb();
  server = createServer({ sql, config, port: 0 });
});
afterAll(() => server.stop(true));

beforeEach(async () => {
  await sql.unsafe("truncate rfqs, sync_runs, fsc_names restart identity");
  const run = await enqueueRun(sql, "scheduled");
  await claimNextRun(sql);
  await setWindow(sql, run.id, [IsoDate.parse("2026-10-20")], []);
  await upsertRfqs(sql, [scraped(), scraped({ quantity: 7 }), scraped({ status: "removed", statusRaw: "Removed" })], run.id);
  await upsertFscNames(sql, [{ code: "8315" as never, name: "Notions and Apparel Findings" }]);
  await finishRun(sql, run.id, "complete");
});

test("lists with defaults", async () => {
  const res = await api("/api/rfqs");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ total: 2, page: 1, pageSize: 50 });
  expect(body.items.every((r: { status: string }) => r.status === "open")).toBe(true);
});

test("filters through query params", async () => {
  const body = await (await api("/api/rfqs?qtyMax=10&status=open,removed")).json();
  expect(body.items.map((r: { quantity: number }) => r.quantity)).toEqual([7]);
});

test("400 on bad params", async () => {
  const res = await api("/api/rfqs?pageSize=10000");
  expect(res.status).toBe(400);
  const body = await res.json();
  expect(body.error.code).toBe("invalid_request");
  expect(body.error.issues.length).toBeGreaterThan(0);
});

test("facets", async () => {
  const body = await (await api("/api/rfqs/facets")).json();
  expect(Object.keys(body).sort()).toEqual(["fsc", "itemName", "postedOn", "setAside", "status", "techDocs"]);
  expect(body.status).toEqual([{ value: "open", count: 2 }, { value: "removed", count: 1 }]);
});

test("meta", async () => {
  const body = await (await api("/api/meta")).json();
  expect(body).toMatchObject({
    windowDays: 7, windowDates: ["2026-10-20"], activeRun: null,
    fscNames: { "8315": "Notions and Apparel Findings" }, lastRun: { status: "complete" },
  });
  expect(body.dataAsOf).toBeString();
});

test("force sync is idempotent", async () => {
  const a = await api("/api/sync", { method: "POST" });
  const b = await api("/api/sync", { method: "POST" });
  expect([a.status, b.status]).toEqual([202, 202]);
  const [ra, rb] = [await a.json(), await b.json()];
  expect(ra.id).toBe(rb.id);
  expect(ra.status).toBe("queued");
  expect((await (await api("/api/sync/latest")).json()).id).toBe(ra.id);
  expect((await (await api(`/api/sync/${ra.id}`)).json()).trigger).toBe("manual");
});

test("sync by id: 404 unknown, 400 malformed", async () => {
  expect((await api("/api/sync/999")).status).toBe(404);
  expect((await api("/api/sync/abc")).status).toBe(400);
});

test("unknown api route is a JSON 404", async () => {
  const res = await api("/api/nope");
  expect(res.status).toBe(404);
  expect((await res.json()).error.code).toBe("not_found");
});
