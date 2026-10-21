import { expect, test } from "bun:test";
import { buildCountQuery, buildFacetQuery, buildListQuery, escapeLike, pgArray } from "../../src/db/rfq-query";
import { IsoDate } from "../../src/shared/brand";
import { DEFAULT_LIST_OPTIONS as OPTS, DEFAULT_QUERY as Q, type RfqQuery } from "../../src/shared/schemas";

const W = [IsoDate.parse("2026-10-20")];
const q = (over: Partial<RfqQuery>) => ({ ...Q, ...over }) as RfqQuery;

test("default query filters window and open, sorts by posted desc", () => {
  const { text, values } = buildListQuery(Q, OPTS, W);
  expect(text).toContain("posted_date = any(");
  expect(text).toMatch(/order by posted_date desc, return_by_date asc nulls last, id/i);
  expect(values).toContain('{"open"}');
  expect(values).toContain('{"2026-10-20"}');
});

test("explicit postedOn overrides the window", () => {
  expect(buildListQuery(q({ postedOn: [IsoDate.parse("2026-10-01")] }), OPTS, W).values).toContain('{"2026-10-01"}');
});

test("escapes like wildcards", () => {
  expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  expect(buildListQuery(q({ q: "50%" }), OPTS, W).values).toContain("%50\\%%");
});

test("numeric q also matches quantity", () => {
  const { text, values } = buildListQuery(q({ q: "57,000" }), OPTS, W);
  expect(text).toContain("quantity =");
  expect(values).toContain(57000);
});

test("dashed q also matches undashed", () => {
  expect(buildListQuery(q({ q: "8315-01" }), OPTS, W).values).toContain("%831501%");
});

test("qty range, closes within, tech docs", () => {
  const { text, values } = buildListQuery(q({ qtyMin: 10, qtyMax: 20, closesWithinDays: 7, techDocs: "none" }), OPTS, W);
  expect(text).toContain("quantity >=");
  expect(text).toContain("quantity <=");
  expect(text).toContain("return_by_date between current_date and current_date +");
  expect(values).toEqual(expect.arrayContaining([10, 20, 7, "none"]));
});

test("qty sort puts nulls last", () => {
  expect(buildListQuery(Q, { ...OPTS, sort: [{ field: "qty", dir: "desc" }] }, W).text)
    .toMatch(/order by quantity desc nulls last, id/i);
});

test("paging", () => {
  const { text, values } = buildListQuery(Q, { ...OPTS, page: 3, pageSize: 20 }, W);
  expect(text).toMatch(/limit \$\d+ offset \$\d+/);
  expect(values.slice(-2)).toEqual([20, 40]);
});

test("count query has no paging", () => {
  expect(buildCountQuery(Q, W).text).not.toContain("limit");
});

test("facet excludes its own filter", () => {
  const f = buildFacetQuery("setAside", q({ setAside: ["small_business"], fsc: ["8315" as never] }), W);
  expect(f.values).not.toContain('{"small_business"}');
  expect(f.values).toContain('{"8315"}');
  expect(f.text).toMatch(/group by 1/);
});

test("postedOn facet keeps the window restriction", () => {
  const f = buildFacetQuery("postedOn", q({ postedOn: [IsoDate.parse("2026-10-20")] }), [...W, IsoDate.parse("2026-10-19")]);
  expect(f.values).toContain('{"2026-10-20","2026-10-19"}');
});

test("pgArray quotes and escapes", () => {
  expect(pgArray(["a", 'b"c', "d\\e"])).toBe('{"a","b\\"c","d\\\\e"}');
  expect(pgArray([])).toBe("{}");
});
