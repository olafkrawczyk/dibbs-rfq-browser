import { expect, test } from "bun:test";
import { DEFAULT_LIST_OPTIONS, DEFAULT_QUERY } from "../../src/shared/schemas";
import { clearFilters, nextUrlState, readUrlState, toggleSort } from "../../src/web/url-state";

test("readUrlState parses a valid search string", () => {
  const s = readUrlState("?q=cathet&page=3");
  expect(s.invalid).toBe(false);
  expect(s.query.q).toBe("cathet");
  expect(s.options.page).toBe(3);
});

test("readUrlState falls back to defaults on hand-edited params", () => {
  const s = readUrlState("?pageSize=10000&sort=foo");
  expect(s.invalid).toBe(true);
  expect(s.query).toEqual(DEFAULT_QUERY);
  expect(s.options).toEqual(DEFAULT_LIST_OPTIONS);
});

test("filter change resets page to 1", () => {
  const cur = readUrlState("?page=4");
  const next = nextUrlState(cur, { q: "pad" });
  expect(next.query.q).toBe("pad");
  expect(next.options.page).toBe(1);
});

test("paging change keeps filters and sets page", () => {
  const cur = readUrlState("?q=pad");
  const next = nextUrlState(cur, {}, { page: 2 });
  expect(next.query.q).toBe("pad");
  expect(next.options.page).toBe(2);
});

test("page size change resets page to 1", () => {
  const next = nextUrlState(readUrlState("?page=5"), {}, { pageSize: 100 });
  expect(next.options).toMatchObject({ page: 1, pageSize: 100 });
});

test("toggleSort: new field starts asc (desc for posted/qty), same field flips", () => {
  expect(toggleSort(DEFAULT_LIST_OPTIONS.sort, "nsn")).toEqual([{ field: "nsn", dir: "asc" }]);
  expect(toggleSort([{ field: "nsn", dir: "asc" }], "nsn")).toEqual([{ field: "nsn", dir: "desc" }]);
  expect(toggleSort([{ field: "nsn", dir: "asc" }], "qty")).toEqual([{ field: "qty", dir: "desc" }]);
  expect(toggleSort(DEFAULT_LIST_OPTIONS.sort, "posted")).toEqual([{ field: "posted", dir: "asc" }]);
});

test("clearFilters drops every filter (incl. optional ones), keeps sort and page size", () => {
  const cur = readUrlState("?q=pad&qtyMax=5000&closesWithinDays=7&returnByFrom=2026-10-01&fsc=8315&sort=qty:desc&pageSize=100&page=3");
  const next = clearFilters(cur);
  expect(next.query).toEqual(DEFAULT_QUERY);
  expect(next.options).toEqual({ sort: [{ field: "qty", dir: "desc" }], pageSize: 100, page: 1 });
});
