import { getConfig } from "../config";
import { createSql } from "../db/sql";
import { migrate } from "../db/migrate";
import { claimNextRun, enqueueRun, finishRun, reapStaleRuns } from "../db/sync-repo";
import type { SyncRunId } from "../shared/brand";
import { createDibbsClient } from "../dibbs/client";
import { createDibbsHttp } from "../dibbs/http";
import { runSync } from "./sync-job";
import { createSyncStore } from "./store";

const POLL_MS = 3000;

const config = getConfig();
const sql = createSql(config.databaseUrl);
await migrate(sql);

const log = (msg: string, extra?: object) =>
  console.log(`[worker ${new Date().toISOString()}] ${msg}${extra ? ` ${JSON.stringify(extra)}` : ""}`);

// Ctrl-C stops immediately: an in-flight run is marked failed so it never blocks the queue.
let currentRunId: SyncRunId | null = null;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    log(`${signal} received, stopping`);
    if (currentRunId !== null) await finishRun(sql, currentRunId, "failed", "worker stopped").catch(() => {});
    await sql.close();
    process.exit(0);
  });
}

async function schedule() {
  const run = await enqueueRun(sql, "scheduled");
  log(`scheduled sync → run ${run.id} (${run.status})`);
}

await schedule();
setInterval(() => schedule().catch((e) => log("schedule failed", { error: String(e) })),
  config.syncIntervalMinutes * 60_000);

log(`started: window ${config.syncWindowDays} days, every ${config.syncIntervalMinutes} min` +
  (config.syncMaxPagesPerDay ? `, max ${config.syncMaxPagesPerDay} page(s)/day` : ""));
while (true) {
  try {
    const reaped = await reapStaleRuns(sql, config.syncStaleAfterMinutes);
    if (reaped) log(`marked ${reaped} stale run(s) as failed`);
    const run = await claimNextRun(sql);
    if (run) {
      // Fresh session per run: cookies from an old run are not trusted.
      const http = createDibbsHttp({ fetch, delayMs: config.dibbsRequestDelayMs });
      const client = createDibbsClient(http, { maxPages: config.syncMaxPagesPerDay });
      currentRunId = run.id;
      await runSync({ client, store: createSyncStore(sql), windowDays: config.syncWindowDays, log }, run);
      currentRunId = null;
      continue;
    }
  } catch (err) {
    log("worker loop error", { error: String(err) });
  }
  await Bun.sleep(POLL_MS);
}

