import type { FinishedRunStatus, SyncDay } from "../shared/schemas";

type DayOutcome = "complete" | "partial" | "failed";

/** A day is complete only when every row DIBBS reported was parsed and none failed validation. */
export function dayStatus(r: { expected: number; parsed: number; invalid: number; truncated?: boolean }): DayOutcome {
  if (r.expected > 0 && r.parsed === 0) return "failed";
  // A capped day is judged on the pages it was allowed to fetch.
  if ((r.truncated || r.parsed === r.expected) && r.invalid === 0) return "complete";
  return "partial";
}

export function runStatus(days: SyncDay[]): FinishedRunStatus {
  if (days.length > 0 && days.every((d) => d.status === "complete")) return "complete";
  if (days.some((d) => d.status === "complete" || d.status === "partial")) return "partial";
  return "failed";
}
