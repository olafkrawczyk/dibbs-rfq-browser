import type { SQL } from "bun";
import { upsertFscNames, upsertRfqs } from "../db/rfq-repo";
import { finishRun, saveDays, setWindow } from "../db/sync-repo";
import type { SyncJobStore } from "./sync-job";

/** Binds the repositories to a connection pool for the sync job. */
export const createSyncStore = (sql: SQL): SyncJobStore => ({
  setWindow: (id, dates, days) => setWindow(sql, id, dates, days),
  saveDays: (id, days) => saveDays(sql, id, days),
  finishRun: (id, status, error) => finishRun(sql, id, status, error),
  upsertRfqs: (rows, runId) => upsertRfqs(sql, rows, runId),
  upsertFscNames: (names) => upsertFscNames(sql, names),
});
