import { expect, test } from "bun:test";
import { IsoDate } from "../../src/shared/brand";
import { RfqQuery } from "../../src/shared/schemas";
import { dateInputCommit, shouldSyncFromUrl, toQueryText } from "../../src/web/inputs";

test("search box keeps a trailing space the URL trimmed away", () => {
  expect(shouldSyncFromUrl("bearing", "bearing ")).toBe(false);
  expect(shouldSyncFromUrl("", "bearing")).toBe(true);
  expect(shouldSyncFromUrl("valve", "bearing")).toBe(true);
});

test("search text is trimmed and capped so the API never rejects it", () => {
  const q = toQueryText(` ${"x".repeat(150)} `);
  expect(RfqQuery.safeParse({ q }).success).toBe(true);
  expect(toQueryText("  pad ")).toBe("pad");
  expect(toQueryText("   ")).toBeUndefined();
});

test("date inputs ignore half-typed years and commit real dates or a clear", () => {
  expect(dateInputCommit("0002-10-31")).toEqual({ commit: false });
  expect(dateInputCommit("0202-10-31")).toEqual({ commit: false });
  expect(dateInputCommit("2026-10-31")).toEqual({ commit: true, value: IsoDate.parse("2026-10-31") });
  expect(dateInputCommit("")).toEqual({ commit: true, value: undefined });
  expect(dateInputCommit("2026-02-30")).toEqual({ commit: false });
});
