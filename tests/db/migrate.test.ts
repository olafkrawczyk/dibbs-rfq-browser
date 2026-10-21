import { beforeEach, expect, test } from "bun:test";
import type { SQL } from "bun";
import { migrate } from "../../src/db/migrate";
import { freshDb } from "../helpers/db";

let sql: SQL;
beforeEach(async () => { sql = await freshDb(); });

test("migrate is idempotent", async () => {
  expect(await migrate(sql)).toEqual([]);
});

test("creates every index of spec §4.1", async () => {
  const rows = await sql`select indexname from pg_indexes where schemaname = 'public'`;
  const names = rows.map((r: { indexname: string }) => r.indexname);
  for (const n of ["rfqs_identity", "rfqs_window_default", "rfqs_return_by", "rfqs_quantity", "rfqs_fsc",
    "rfqs_item_name", "rfqs_search_trgm", "sync_runs_one_active", "sync_runs_latest"]) {
    expect(names).toContain(n);
  }
});

test("only one active sync run is allowed", async () => {
  await sql`insert into sync_runs (trigger, status) values ('manual', 'queued')`;
  await expect((async () => sql`insert into sync_runs (trigger, status) values ('manual', 'running')`)()).rejects.toThrow();
  await sql`insert into sync_runs (trigger, status) values ('manual', 'complete')`;
});

test("an rfq needs exactly one of nsn / part_number", async () => {
  const insert = async (nsn: string | null, part: string | null) => sql`
    insert into rfqs (solicitation_number, nsn, part_number, nomenclature, item_name, pr_number, status,
      status_raw, set_aside, tech_docs, posted_date, dibbs_url, first_seen_at, last_seen_at,
      first_seen_run_id, last_sync_run_id)
    values ('SPE1C127Q0030', ${nsn}, ${part}, 'X', 'X', '7018560662', 'open', 'Open', 'other', 'none',
      '2026-10-20', 'https://x', now(), now(), 1, 1)`;
  await expect(insert(null, null)).rejects.toThrow();
  await insert("8315016839267", null);
});
