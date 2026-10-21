import type { DibbsClient } from "../dibbs/client";
import type { ScrapedRfq } from "../dibbs/scraped";
import type { Fsc, IsoDate, SyncRunId } from "../shared/brand";
import type { FinishedRunStatus, SyncDay, SyncRun } from "../shared/schemas";
import { dayStatus, runStatus } from "./sync-status";

/** The persistence a sync needs, with the database already bound (repo functions in production). */
export type SyncJobStore = {
  setWindow(id: SyncRunId, dates: IsoDate[], days: SyncDay[]): Promise<void>;
  saveDays(id: SyncRunId, days: SyncDay[]): Promise<void>;
  finishRun(id: SyncRunId, status: FinishedRunStatus, error?: string): Promise<void>;
  upsertRfqs(rows: ScrapedRfq[], runId: SyncRunId): Promise<number>;
  upsertFscNames(names: { code: Fsc; name: string }[]): Promise<void>;
};

export type SyncJobDeps = {
  client: DibbsClient;
  store: SyncJobStore;
  windowDays: number;
  log: (msg: string, extra?: object) => void;
};

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const pendingDay = (date: IsoDate): SyncDay =>
  ({ date, status: "pending", expected: null, parsed: 0, invalid: 0, page: 0, pages: null });

/** Runs one sync end to end (spec §5.2). Never throws: the outcome is recorded on the run. */
export async function runSync(deps: SyncJobDeps, run: SyncRun): Promise<FinishedRunStatus> {
  const { client, store, log } = deps;
  try {
    const dates = (await client.listPostingDates()).slice(0, deps.windowDays);
    const days = dates.map(pendingDay);
    await store.setWindow(run.id, dates, days);
    log(`sync ${run.id}: window ${dates.join(", ")}`);

    try {
      await store.upsertFscNames(await client.fetchFscNames());
    } catch (err) {
      log(`sync ${run.id}: FSC names refresh failed (continuing)`, { error: message(err) });
    }

    for (const [i, date] of dates.entries()) {
      const day = days[i]!;
      day.status = "running";
      await store.saveDays(run.id, days);
      try {
        const result = await client.fetchDay(date, async (page) => {
          await store.upsertRfqs(page.rows, run.id);
          for (const bad of page.invalid) log(`sync ${run.id}: invalid row on ${date}`, bad);
          if (page.currentPage === 1) Object.assign(day, { parsed: 0, invalid: 0 }); // (re)start of the day
          day.expected = page.totalRecords;
          day.parsed += page.rows.length;
          day.invalid += page.invalid.length;
          day.page = page.currentPage;
          day.pages = Math.max(1, Math.ceil(page.totalRecords / 50));
          await store.saveDays(run.id, days);
        });
        Object.assign(day, { expected: result.expected, parsed: result.parsed, invalid: result.invalid, pages: result.pages });
        if (result.truncated) day.truncated = true;
        day.status = dayStatus(result);
      } catch (err) {
        day.status = "failed";
        day.error = message(err);
        log(`sync ${run.id}: day ${date} failed`, { error: day.error });
      }
      await store.saveDays(run.id, days);
    }

    const status = runStatus(days);
    await store.finishRun(run.id, status, status === "failed" ? "no day could be synced" : undefined);
    log(`sync ${run.id}: ${status}`);
    return status;
  } catch (err) {
    await store.finishRun(run.id, "failed", message(err));
    log(`sync ${run.id}: failed`, { error: message(err) });
    return "failed";
  }
}
