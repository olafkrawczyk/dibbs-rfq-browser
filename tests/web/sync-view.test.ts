import { expect, test } from "bun:test";
import { SyncRun } from "../../src/shared/schemas";
import { dataBadge, isActive, syncProgressLabel } from "../../src/web/sync-view";

const day = (date: string, status: string, parsed = 24, page = 2) =>
  ({ date, status, expected: 24, parsed, invalid: 0, page, pages: 2 });
const run = (status: string, days: ReturnType<typeof day>[]) => SyncRun.parse({
  id: 3, trigger: "manual", status, requestedAt: "2026-10-21T14:00:00Z", startedAt: "2026-10-21T14:00:00Z",
  finishedAt: status === "running" ? null : "2026-10-21T14:05:00Z",
  windowDates: days.map((d) => d.date), days, error: null,
});
const hhmm = (iso: string) => iso.slice(11, 16);

test("progress label counts finished days and shows the running day's page", () => {
  const r = run("running", [day("2026-10-20", "complete"), day("2026-10-21", "running", 3, 1)]);
  expect(syncProgressLabel(r)).toBe("Syncing 1/2 days · page 1/2");
});

test("progress label for a queued run", () => {
  expect(syncProgressLabel(run("queued", []))).toBe("Sync queued…");
});

test("isActive for queued/running only", () => {
  expect(isActive(run("running", []))).toBe(true);
  expect(isActive(run("partial", []))).toBe(false);
  expect(isActive(null)).toBe(false);
});

test("data badge: complete run", () => {
  const b = dataBadge("2026-10-21T14:05:00Z", run("complete", [day("2026-10-20", "complete"), day("2026-10-21", "complete")]), hhmm);
  expect(b).toEqual({
    text: "Data as of 14:05 · 2/2 days ✓", tone: "ok",
    details: ["2026-10-20: 24/24", "2026-10-21: 24/24"],
  });
});

test("data badge: partial is amber, failed is red, none is muted", () => {
  const partial = run("partial", [day("2026-10-20", "partial", 20), day("2026-10-21", "complete")]);
  expect(dataBadge("2026-10-21T14:05:00Z", partial, hhmm)).toMatchObject({ text: "Data as of 14:05 · 1/2 days", tone: "warn" });
  expect(dataBadge(null, run("failed", [day("2026-10-20", "failed", 0)]), hhmm)).toMatchObject({ tone: "error" });
  expect(dataBadge(null, null, hhmm)).toEqual({ text: "No data yet", tone: "muted", details: [] });
});

test("data badge: capped days are flagged, not shown as a full sync", () => {
  const capped = (date: string) => ({ ...day(date, "complete", 100, 2), expected: 2148, truncated: true });
  const b = dataBadge("2026-10-21T14:05:00Z", run("complete", [capped("2026-10-20"), capped("2026-10-21")]), hhmm);
  expect(b).toEqual({
    text: "Data as of 14:05 · 2/2 days · first 2 pages/day only", tone: "warn",
    details: ["2026-10-20: 100/2148 (first 2 pages only)", "2026-10-21: 100/2148 (first 2 pages only)"],
  });
});
