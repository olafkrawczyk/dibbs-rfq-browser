// Prints EXPLAIN ANALYZE for the main query shapes against DATABASE_URL: bun scripts/explain.ts
import { getConfig } from "../src/config";
import { createSql } from "../src/db/sql";
import { getWindowDates } from "../src/db/sync-repo";
import { buildCountQuery, buildFacetQuery, buildListQuery, type SqlQuery } from "../src/db/rfq-query";
import { DEFAULT_LIST_OPTIONS as OPTS, DEFAULT_QUERY as Q } from "../src/shared/schemas";

const sql = createSql(getConfig().databaseUrl);
const W = await getWindowDates(sql);

const cases: [string, SqlQuery][] = [
  ["default list", buildListQuery(Q, OPTS, W)],
  ["default count", buildCountQuery(Q, W)],
  ["search 'cathet'", buildListQuery({ ...Q, q: "cathet" }, OPTS, W)],
  ["sort qty desc", buildListQuery(Q, { ...OPTS, sort: [{ field: "qty", dir: "desc" }] }, W)],
  ["closes within 7d", buildListQuery({ ...Q, closesWithinDays: 7 }, OPTS, W)],
  ["fsc facet", buildFacetQuery("fsc", Q, W)],
];

for (const [label, q] of cases) {
  const plan: { "QUERY PLAN": string }[] = await sql.unsafe(`explain (analyze, buffers) ${q.text}`, q.values);
  const lines = plan.map((r) => r["QUERY PLAN"]);
  const indexes = [...new Set(lines.join("\n").match(/rfqs_\w+/g) ?? [])];
  console.log(`\n=== ${label}: ${lines.at(-1)?.trim()} | indexes: ${indexes.join(", ") || "none (seq scan)"}`);
  console.log(lines.slice(0, 8).join("\n"));
}
await sql.close();
