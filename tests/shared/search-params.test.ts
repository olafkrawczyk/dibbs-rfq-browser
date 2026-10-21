import { expect, test } from "bun:test";
import { parseSearchParams, toSearchParams } from "../../src/shared/search-params";
import { DEFAULT_LIST_OPTIONS, DEFAULT_QUERY } from "../../src/shared/schemas";

const parse = (s: string) => parseSearchParams(new URLSearchParams(s));

test("empty params → defaults", () => {
  expect(parse("")).toEqual({
    ok: true,
    query: { version: 1, status: ["open"], setAside: [], fsc: [], itemName: [], postedOn: [], techDocs: "any" },
    options: { page: 1, pageSize: 50, sort: [{ field: "posted", dir: "desc" }, { field: "returnBy", dir: "asc" }] },
  } as never);
});

test("parses every filter", () => {
  const r = parse("q=%20pad%20&status=open,removed&setAside=sdvosb&fsc=8315,6515&itemName=PAD&closesWithinDays=7"
    + "&postedOn=2026-10-20&qtyMin=100&qtyMax=500&techDocs=available&sort=qty:desc&page=2&pageSize=100");
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  expect(r.query).toMatchObject({
    q: "pad", status: ["open", "removed"], setAside: ["sdvosb"], fsc: ["8315", "6515"], itemName: ["PAD"],
    closesWithinDays: 7, postedOn: ["2026-10-20"], qtyMin: 100, qtyMax: 500, techDocs: "available",
  });
  expect(r.options).toEqual({ page: 2, pageSize: 100, sort: [{ field: "qty", dir: "desc" }] });
});

test("blank q is dropped", () => {
  const r = parse("q=%20%20");
  expect(r.ok && r.query.q).toBeUndefined();
});

test("round trip", () => {
  const r = parse("q=pad&fsc=8315,6515&setAside=small_business&qtyMin=100&sort=qty:desc&page=2");
  if (!r.ok) throw new Error("invalid");
  expect(parse(toSearchParams(r.query, r.options).toString())).toEqual(r);
});

test("defaults are omitted", () => {
  expect(toSearchParams(DEFAULT_QUERY, DEFAULT_LIST_OPTIONS).toString()).toBe("");
});

test("rejects invalid params", () => {
  for (const s of ["pageSize=10000", "sort=foo:asc", "sort=qty:sideways", "qtyMin=5&qtyMax=1", "returnByFrom=bogus",
    "fsc=12", "status=maybe", "page=0", "returnByFrom=2026-10-21&returnByTo=2026-10-01"]) {
    expect({ s, ok: parse(s).ok }).toEqual({ s, ok: false });
  }
});
