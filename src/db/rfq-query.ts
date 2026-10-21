import type { IsoDate } from "../shared/brand";
import type { FacetName, ListOptions, RfqQuery, SortField } from "../shared/schemas";

export type SqlQuery = { text: string; values: unknown[] };

/** Collects positional parameters; `add(v)` returns its placeholder. */
type Params = { values: unknown[]; add: (v: unknown) => string };
const params = (): Params => {
  const values: unknown[] = [];
  return { values, add: (v) => (values.push(v), `$${values.length}`) };
};

type Ctx = { q: RfqQuery; windowDates: IsoDate[]; p: Params };
type Predicate = (ctx: Ctx) => string | null;

/** Dates come back as text (YYYY-MM-DD) and ids as int, so rows map to DTOs without timezone surprises. */
export const RFQ_COLUMNS = `id::int as id, solicitation_number, nsn, part_number, fsc, nomenclature, item_name,
  mil_spec, quantity, pr_number, status, status_raw, set_aside, set_aside_raw, tech_docs,
  posted_date::text as posted_date, issue_date::text as issue_date, return_by_date::text as return_by_date,
  dibbs_url, pdf_url, tech_docs_url, first_seen_at, last_seen_at`;

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** JS array → Postgres array literal. Bun SQL binds JS arrays as "a,b", so arrays go in as literals. */
export function pgArray(values: readonly unknown[]): string {
  return `{${values.map((v) => `"${String(v).replace(/[\\"]/g, (c) => `\\${c}`)}"`).join(",")}}`;
}

const NUMERIC_Q = /^\d{1,3}(,\d{3})+$|^\d+$/;

const anyOf = (column: string, cast: string) => (values: readonly string[], p: Params) =>
  values.length ? `${column} = any(${p.add(pgArray(values))}::${cast}[])` : null;

/** One predicate per filter field (spec §12 hook: adding a filter = one entry here + one schema field). */
const PREDICATES: Record<string, Predicate> = {
  status: ({ q, p }) => anyOf("status", "text")(q.status, p),
  setAside: ({ q, p }) => anyOf("set_aside", "text")(q.setAside, p),
  fsc: ({ q, p }) => anyOf("fsc", "text")(q.fsc, p),
  itemName: ({ q, p }) => anyOf("item_name", "text")(q.itemName, p),
  postedOn: ({ q, windowDates, p }) =>
    `posted_date = any(${p.add(pgArray(q.postedOn.length ? q.postedOn : windowDates))}::date[])`,
  q: ({ q, p }) => {
    if (!q.q) return null;
    const ors = [`search_text ilike ${p.add(`%${escapeLike(q.q)}%`)} escape '\\'`];
    const undashed = q.q.replace(/-/g, "");
    if (undashed !== q.q && undashed) ors.push(`search_text ilike ${p.add(`%${escapeLike(undashed)}%`)} escape '\\'`);
    if (NUMERIC_Q.test(q.q)) {
      const n = Number(q.q.replace(/,/g, ""));
      if (Number.isSafeInteger(n) && n <= 2_147_483_647) ors.push(`quantity = ${p.add(n)}`);
    }
    return `(${ors.join(" or ")})`;
  },
  closesWithinDays: ({ q, p }) =>
    q.closesWithinDays === undefined
      ? null
      : `return_by_date between current_date and current_date + ${p.add(q.closesWithinDays)}::int`,
  returnByFrom: ({ q, p }) => (q.returnByFrom ? `return_by_date >= ${p.add(q.returnByFrom)}::date` : null),
  returnByTo: ({ q, p }) => (q.returnByTo ? `return_by_date <= ${p.add(q.returnByTo)}::date` : null),
  qtyMin: ({ q, p }) => (q.qtyMin === undefined ? null : `quantity >= ${p.add(q.qtyMin)}`),
  qtyMax: ({ q, p }) => (q.qtyMax === undefined ? null : `quantity <= ${p.add(q.qtyMax)}`),
  techDocs: ({ q, p }) => (q.techDocs === "any" ? null : `tech_docs = ${p.add(q.techDocs)}`),
};

function whereClause(ctx: Ctx, exclude?: FacetName): string {
  const parts = Object.entries(PREDICATES)
    .map(([field, pred]) => {
      // A facet ignores its own filter — except postedOn, which still keeps the window restriction.
      if (field === exclude) return field === "postedOn" ? PREDICATES.postedOn!({ ...ctx, q: { ...ctx.q, postedOn: [] } }) : null;
      return pred(ctx);
    })
    .filter((s): s is string => s !== null);
  return parts.length ? `where ${parts.join(" and ")}` : "";
}

const SORT_COLUMNS: Record<SortField, { column: string; nullsLast: boolean }> = {
  posted: { column: "posted_date", nullsLast: false },
  returnBy: { column: "return_by_date", nullsLast: true },
  qty: { column: "quantity", nullsLast: true },
  nsn: { column: "item_key", nullsLast: false },
  solicitation: { column: "solicitation_number", nullsLast: false },
  itemName: { column: "item_name", nullsLast: false },
};

function orderBy(options: ListOptions): string {
  const keys = options.sort.map(({ field, dir }) => {
    const { column, nullsLast } = SORT_COLUMNS[field];
    return `${column} ${dir}${nullsLast ? " nulls last" : ""}`;
  });
  return `order by ${[...keys, "id"].join(", ")}`;
}

export function buildListQuery(query: RfqQuery, options: ListOptions, windowDates: IsoDate[]): SqlQuery {
  const p = params();
  const where = whereClause({ q: query, windowDates, p });
  const limit = p.add(options.pageSize);
  const offset = p.add((options.page - 1) * options.pageSize);
  return {
    text: `select ${RFQ_COLUMNS} from rfqs ${where} ${orderBy(options)} limit ${limit} offset ${offset}`,
    values: p.values,
  };
}

export function buildCountQuery(query: RfqQuery, windowDates: IsoDate[]): SqlQuery {
  const p = params();
  return { text: `select count(*)::int as total from rfqs ${whereClause({ q: query, windowDates, p })}`, values: p.values };
}

const FACET_COLUMNS: Record<FacetName, string> = {
  status: "status",
  setAside: "set_aside",
  fsc: "fsc",
  itemName: "item_name",
  postedOn: "to_char(posted_date, 'YYYY-MM-DD')",
  techDocs: "tech_docs",
};

export const FACET_LIMIT = 200;

/** Option counts for one facet with every filter applied except the facet's own. */
export function buildFacetQuery(facet: FacetName, query: RfqQuery, windowDates: IsoDate[]): SqlQuery {
  const p = params();
  const column = FACET_COLUMNS[facet];
  const where = whereClause({ q: query, windowDates, p }, facet);
  const notNull = `${column} is not null`;
  const fullWhere = where ? `${where} and ${notNull}` : `where ${notNull}`;
  return {
    text: `select ${column} as value, count(*)::int as count from rfqs ${fullWhere} group by 1 order by 2 desc, 1 limit ${FACET_LIMIT}`,
    values: p.values,
  };
}
