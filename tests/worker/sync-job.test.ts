import { expect, test } from "bun:test";
import { runSync, type SyncJobStore } from "../../src/worker/sync-job";
import type { DibbsClient } from "../../src/dibbs/client";
import type { RecordsPage } from "../../src/dibbs/parse-records";
import { IsoDate, SyncRunId } from "../../src/shared/brand";
import type { FinishedRunStatus, SyncDay, SyncRun } from "../../src/shared/schemas";
import { scraped } from "../helpers/factory";

const DATES = ["2026-10-20", "2026-10-19", "2026-10-16"].map((s) => IsoDate.parse(s));
const RUN = { id: SyncRunId.parse(7), trigger: "manual", status: "running" } as SyncRun;

function memoryStore() {
  const state = { upserted: 0, window: [] as IsoDate[], days: [] as SyncDay[], finished: null as null | { status: FinishedRunStatus; error?: string }, fsc: 0 };
  const store: SyncJobStore = {
    setWindow: async (_id, dates, days) => { state.window = dates; state.days = days; },
    saveDays: async (_id, days) => { state.days = days; },
    finishRun: async (_id, status, error) => { state.finished = { status, error }; },
    upsertRfqs: async (rows) => { state.upserted += rows.length; return rows.length; },
    upsertFscNames: async (names) => { state.fsc += names.length; },
  };
  return { state, store };
}

const page = (date: IsoDate, rows: number, total = rows): RecordsPage => ({
  totalRecords: total, currentPage: 1, nextPage: null, invalid: [],
  rows: Array.from({ length: rows }, () => scraped({ postedDate: date })),
});

function fakeClient(over: Partial<DibbsClient> = {}): DibbsClient & { fetched: IsoDate[] } {
  const fetched: IsoDate[] = [];
  return {
    fetched,
    listPostingDates: async () => DATES,
    fetchFscNames: async () => [{ code: "8315" as never, name: "Notions" }],
    fetchDay: async (date, onPage) => {
      fetched.push(date);
      const p = page(date, 2);
      await onPage(p);
      return { expected: p.totalRecords, parsed: 2, invalid: 0, pages: 1, truncated: false };
    },
    ...over,
  };
}

const log = () => {};

test("syncs newest windowDays dates, all complete", async () => {
  const { state, store } = memoryStore();
  const client = fakeClient();
  expect(await runSync({ client, store, windowDays: 2, log }, RUN)).toBe("complete");
  expect(client.fetched).toEqual(DATES.slice(0, 2));
  expect(state.window).toEqual(DATES.slice(0, 2));
  expect(state.upserted).toBe(4);
  expect(state.fsc).toBe(1);
  expect(state.days.map((d) => [d.date as string, d.status, d.expected, d.parsed])).toEqual([
    ["2026-10-20", "complete", 2, 2], ["2026-10-19", "complete", 2, 2]]);
  expect(state.finished).toEqual({ status: "complete", error: undefined });
});

test("one day failing → partial, others still synced", async () => {
  const { state, store } = memoryStore();
  const base = fakeClient();
  const client = fakeClient({
    fetchDay: async (date, onPage) => {
      if (date === DATES[0]) throw new Error("DIBBS responded 503");
      return base.fetchDay(date, onPage);
    },
  });
  expect(await runSync({ client, store, windowDays: 3, log }, RUN)).toBe("partial");
  expect(state.days[0]).toMatchObject({ status: "failed", error: "DIBBS responded 503" });
  expect(state.days.slice(1).every((d) => d.status === "complete")).toBe(true);
});

test("count mismatch → partial day", async () => {
  const { state, store } = memoryStore();
  const client = fakeClient({
    fetchDay: async (date, onPage) => {
      await onPage(page(date, 2, 5));
      return { expected: 5, parsed: 2, invalid: 0, pages: 1, truncated: false };
    },
  });
  expect(await runSync({ client, store, windowDays: 1, log }, RUN)).toBe("partial");
  expect(state.days[0]).toMatchObject({ status: "partial", expected: 5, parsed: 2 });
});

test("listPostingDates failing → failed with error", async () => {
  const { state, store } = memoryStore();
  const client = fakeClient({ listPostingDates: async () => { throw new Error("offline"); } });
  expect(await runSync({ client, store, windowDays: 2, log }, RUN)).toBe("failed");
  expect(state.finished).toEqual({ status: "failed", error: "offline" });
});

test("fsc failure is not fatal", async () => {
  const { store } = memoryStore();
  const client = fakeClient({ fetchFscNames: async () => { throw new Error("fsc down"); } });
  expect(await runSync({ client, store, windowDays: 1, log }, RUN)).toBe("complete");
});

test("day restart does not double count progress", async () => {
  const { state, store } = memoryStore();
  const client = fakeClient({
    fetchDay: async (date, onPage) => {
      await onPage(page(date, 2));
      await onPage(page(date, 2)); // client restarted the day after re-consent
      return { expected: 2, parsed: 2, invalid: 0, pages: 1, truncated: false };
    },
  });
  expect(await runSync({ client, store, windowDays: 1, log }, RUN)).toBe("complete");
  expect(state.days[0]).toMatchObject({ status: "complete", expected: 2, parsed: 2, invalid: 0 });
});
