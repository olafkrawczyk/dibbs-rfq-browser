import { expect, test } from "bun:test";
import { loadConfig } from "../src/config";

test("defaults", () => {
  expect(loadConfig({ DATABASE_URL: "postgres://x" })).toEqual({
    databaseUrl: "postgres://x",
    syncWindowDays: 7,
    syncIntervalMinutes: 60,
    dibbsRequestDelayMs: 1000,
    syncStaleAfterMinutes: 30,
    port: 3000,
    syncMaxPagesPerDay: null,
  });
});

test("coerces numbers", () => {
  expect(loadConfig({ DATABASE_URL: "postgres://x", SYNC_WINDOW_DAYS: "3" }).syncWindowDays).toBe(3);
});

test("rejects missing url / bad window", () => {
  expect(() => loadConfig({})).toThrow();
  expect(() => loadConfig({ DATABASE_URL: "postgres://x", SYNC_WINDOW_DAYS: "0" })).toThrow();
});

test("optional page cap", () => {
  expect(loadConfig({ DATABASE_URL: "postgres://x", SYNC_MAX_PAGES_PER_DAY: "2" }).syncMaxPagesPerDay).toBe(2);
  expect(loadConfig({ DATABASE_URL: "postgres://x", SYNC_MAX_PAGES_PER_DAY: "" }).syncMaxPagesPerDay).toBeNull();
});
