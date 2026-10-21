import { beforeEach, expect, test } from "bun:test";
import type { SQL } from "bun";
import { getFacets, getFscNames, listRfqs, upsertFscNames, upsertRfqs } from "../../src/db/rfq-repo";
import { IsoDate, SyncRunId } from "../../src/shared/brand";
import { DEFAULT_LIST_OPTIONS as OPTS, DEFAULT_QUERY as Q, type RfqQuery } from "../../src/shared/schemas";
import { freshDb } from "../helpers/db";
import { scraped } from "../helpers/factory";

let sql: SQL;
beforeEach(async () => { sql = await freshDb(); });

const RUN1 = SyncRunId.parse(1);
const RUN2 = SyncRunId.parse(2);
const W = [IsoDate.parse("2026-10-20"), IsoDate.parse("2026-10-17")];
const q = (over: Partial<RfqQuery>) => ({ ...Q, ...over }) as RfqQuery;
const one = async () => (await sql`select status, first_seen_run_id::int as f, last_sync_run_id::int as l, posted_date::text as p from rfqs`)[0];

test("insert then update keeps first_seen", async () => {
  const row = scraped();
  await upsertRfqs(sql, [row], RUN1);
  await upsertRfqs(sql, [{ ...row, status: "removed", statusRaw: "Removed" }], RUN2);
  expect(await one()).toEqual({ status: "removed", f: 1, l: 2, p: "2026-10-20" });
});

test("dedupes within batch", async () => {
  const row = scraped();
  expect(await upsertRfqs(sql, [row, { ...row, quantity: 5 }], RUN1)).toBe(1);
  expect((await sql`select quantity from rfqs`)[0].quantity).toBe(5);
});

test("keeps earliest posted date", async () => {
  const row = scraped();
  for (const d of ["2026-10-20", "2026-10-17", "2026-10-21"]) await upsertRfqs(sql, [{ ...row, postedDate: d as IsoDate }], RUN1);
  expect((await one()).p).toBe("2026-10-17");
});

test("list filters, search and total", async () => {
  await upsertRfqs(sql, [
    scraped({ nomenclature: "CATHETER, URETHRAL", itemName: "CATHETER" }),
    scraped({ nomenclature: "PAD, ABDOMINAL", itemName: "PAD" }),
    scraped({ status: "removed", statusRaw: "Removed" }),
    scraped({ postedDate: "2026-09-01" }),
  ], RUN1);
  const all = await listRfqs(sql, Q, OPTS, W);
  expect(all.total).toBe(2);
  expect(all.items.every((r) => r.status === "open" && r.postedDate === "2026-10-20")).toBe(true);
  const hit = await listRfqs(sql, q({ q: "cathet" }), OPTS, W);
  expect(hit.items.map((r) => r.itemName)).toEqual(["CATHETER" as never]);
  expect(hit.items[0]!.links.dibbs).toContain("RFQRec.aspx?sn=");
  expect(hit.items[0]!.links.nsnHistory).toContain("RFQNsn.aspx?value=8315016839267");
});

test("search treats wildcard characters literally", async () => {
  await upsertRfqs(sql, [scraped({ nomenclature: "TAPE, 50% COTTON" }), scraped({ nomenclature: "TAPE, 500 COTTON" })], RUN1);
  expect((await listRfqs(sql, q({ q: "50%" }), OPTS, W)).total).toBe(1);
  expect((await listRfqs(sql, q({ q: "o'brien_\\" }), OPTS, W)).total).toBe(0);
});

test("qty sort and numeric search", async () => {
  await upsertRfqs(sql, [scraped({ quantity: 10 }), scraped({ quantity: 1500 }), scraped({ quantity: null })], RUN1);
  const sorted = await listRfqs(sql, Q, { ...OPTS, sort: [{ field: "qty", dir: "desc" }] }, W);
  expect(sorted.items.map((r) => r.quantity)).toEqual([1500, 10, null]);
  expect((await listRfqs(sql, q({ q: "1,500" }), OPTS, W)).items.map((r) => r.quantity)).toEqual([1500]);
});

test("total is correct past the last page", async () => {
  await upsertRfqs(sql, [scraped(), scraped()], RUN1);
  const r = await listRfqs(sql, Q, { ...OPTS, page: 5 }, W);
  expect(r).toMatchObject({ items: [], total: 2, page: 5 });
});

test("facet counts ignore own filter", async () => {
  await upsertRfqs(sql, [scraped(), scraped(), scraped({ setAside: "unrestricted", setAsideRaw: "Unrestricted" })], RUN1);
  const f = await getFacets(sql, q({ setAside: ["small_business"] }), W);
  expect(f.setAside).toEqual([{ value: "small_business", count: 2 }, { value: "unrestricted", count: 1 }]);
  expect(f.status).toEqual([{ value: "open", count: 2 }]);
  expect(f.postedOn).toEqual([{ value: "2026-10-20", count: 2 }]);
});

test("fsc names upsert", async () => {
  await upsertFscNames(sql, [{ code: "8315" as never, name: "Notions" }]);
  await upsertFscNames(sql, [{ code: "8315" as never, name: "Notions and Apparel Findings" }]);
  expect(await getFscNames(sql)).toEqual({ "8315": "Notions and Apparel Findings" });
});
