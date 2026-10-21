import { getConfig } from "../config";
import { createSql } from "../db/sql";
import { migrate } from "../db/migrate";
import { enqueueRun, getRun } from "../db/sync-repo";
import type { SyncRun } from "../shared/schemas";

const wait = !process.argv.includes("--no-wait");
const sql = createSql(getConfig().databaseUrl);
await migrate(sql);

const run = await enqueueRun(sql, "manual");
console.log(`Sync run ${run.id} (${run.status}${run.trigger !== "manual" ? `, already ${run.trigger}` : ""})`);
if (!wait) {
  await sql.close();
  process.exit(0);
}

const describe = (r: SyncRun) =>
  r.days.map((d) => `${d.date} ${d.status} p${d.page}/${d.pages ?? "?"} ${d.parsed}/${d.expected ?? "?"}`).join(" | ");

let current: SyncRun | null = run;
let last = "";
while (current && (current.status === "queued" || current.status === "running")) {
  await Bun.sleep(2000);
  current = await getRun(sql, run.id);
  const line = current ? `${current.status}: ${describe(current)}` : "";
  if (line !== last) console.log(line);
  last = line;
}

console.log(`Finished: ${current?.status ?? "unknown"}${current?.error ? ` (${current.error})` : ""}`);
if (current?.status === "queued") console.log("Is the worker running? (bun run worker)");
await sql.close();
process.exit(current?.status === "complete" ? 0 : 1);
