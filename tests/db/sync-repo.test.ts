import { beforeEach, expect, test } from "bun:test";
import type { SQL } from "bun";
import {
  claimNextRun, enqueueRun, finishRun, getActiveRun, getLatestFinishedRun, getRun, getWindowDates,
  reapStaleRuns, saveDays, setWindow,
} from "../../src/db/sync-repo";
import { IsoDate } from "../../src/shared/brand";
import type { SyncDay } from "../../src/shared/schemas";
import { freshDb } from "../helpers/db";

let sql: SQL;
beforeEach(async () => { sql = await freshDb(); });

const D = IsoDate.parse("2026-10-20");
const day: SyncDay = { date: D, status: "complete", expected: 10, parsed: 10, invalid: 0, page: 1, pages: 1 };

test("enqueue returns the active run instead of stacking", async () => {
  const a = await enqueueRun(sql, "manual");
  const b = await enqueueRun(sql, "scheduled");
  expect(b.id).toBe(a.id);
  expect(a).toMatchObject({ status: "queued", trigger: "manual", windowDates: [], days: [], startedAt: null });
});

test("claim is exclusive", async () => {
  await enqueueRun(sql, "manual");
  const claims = await Promise.all([claimNextRun(sql), claimNextRun(sql)]);
  expect(claims.filter(Boolean).length).toBe(1);
  expect(claims.find(Boolean)!.status).toBe("running");
  expect(await claimNextRun(sql)).toBeNull();
});

test("progress, finish, window dates", async () => {
  const run = await enqueueRun(sql, "manual");
  await claimNextRun(sql);
  await setWindow(sql, run.id, [D], [{ ...day, status: "pending", expected: null, parsed: 0, pages: null }]);
  await saveDays(sql, run.id, [day]);
  expect(await getActiveRun(sql)).toMatchObject({ id: run.id, windowDates: [D], days: [day] });
  expect(await getWindowDates(sql)).toEqual([]);
  await finishRun(sql, run.id, "complete");
  const done = await getRun(sql, run.id);
  expect(done).toMatchObject({ status: "complete", error: null });
  expect(done!.finishedAt).not.toBeNull();
  expect(await getActiveRun(sql)).toBeNull();
  expect((await getLatestFinishedRun(sql))!.id).toBe(run.id);
  expect(await getWindowDates(sql)).toEqual([D]);
  expect((await enqueueRun(sql, "manual")).id).not.toBe(run.id);
});

test("failed runs do not define the window", async () => {
  const run = await enqueueRun(sql, "manual");
  await setWindow(sql, run.id, [D], []);
  await finishRun(sql, run.id, "failed", "boom");
  expect(await getWindowDates(sql)).toEqual([]);
  expect((await getRun(sql, run.id))!.error).toBe("boom");
});

test("reaps stale runs", async () => {
  const run = await enqueueRun(sql, "manual");
  await claimNextRun(sql);
  await sql`update sync_runs set started_at = now() - interval '31 minutes' where id = ${run.id}`;
  expect(await reapStaleRuns(sql, 30)).toBe(1);
  expect(await getRun(sql, run.id)).toMatchObject({ status: "failed", error: "worker stopped" });
});

test("getRun of unknown id is null", async () => {
  expect(await getRun(sql, 999 as never)).toBeNull();
});
