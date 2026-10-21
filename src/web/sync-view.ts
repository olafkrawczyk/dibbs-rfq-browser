import type { SyncRunId } from "../shared/brand";
import type { SyncRun } from "../shared/schemas";

const FINISHED_DAY = new Set(["complete", "partial", "failed"]);

export const isActive = (run: SyncRun | null): run is SyncRun =>
  run !== null && (run.status === "queued" || run.status === "running");

/** "Syncing 3/7 days · page 12/24" */
export function syncProgressLabel(run: SyncRun): string {
  if (run.status === "queued") return "Sync queued…";
  const done = run.days.filter((d) => FINISHED_DAY.has(d.status)).length;
  const total = run.windowDates.length || run.days.length;
  const current = run.days.find((d) => d.status === "running");
  const page = current ? ` · page ${current.page}/${current.pages ?? "?"}` : "";
  return `Syncing ${done}/${total} days${page}`;
}

export type BadgeTone = "ok" | "warn" | "error" | "muted";
export type DataBadge = { text: string; tone: BadgeTone; details: string[] };

const localHhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

const TONE: Record<string, BadgeTone> = { complete: "ok", partial: "warn", failed: "error" };

/** Header badge from the data timestamp and the last finished run; tooltip lists per-day parsed/expected. */
export function dataBadge(dataAsOf: string | null, lastRun: SyncRun | null, formatTime = localHhmm): DataBadge {
  if (!lastRun) return { text: dataAsOf ? `Data as of ${formatTime(dataAsOf)}` : "No data yet", tone: "muted", details: [] };
  const complete = lastRun.days.filter((d) => d.status === "complete").length;
  const days = `${complete}/${lastRun.days.length} days${lastRun.status === "complete" ? " ✓" : ""}`;
  const head = dataAsOf ? `Data as of ${formatTime(dataAsOf)}` : "Last sync failed";
  return {
    text: `${head} · ${days}`,
    tone: TONE[lastRun.status] ?? "muted",
    details: lastRun.days.map((d) => `${d.date}: ${d.parsed}/${d.expected ?? "?"}${d.error ? ` (${d.error})` : ""}`),
  };
}

/** Keep following a run once seen, even after meta stops listing it as active (its finish must still be seen). */
export const followedRunId = (current: SyncRunId | null, active: SyncRunId | null): SyncRunId | null =>
  current ?? active;
