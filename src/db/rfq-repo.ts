import type { SQL } from "bun";
import type { ScrapedRfq } from "../dibbs/scraped";
import type { Fsc, IsoDate, SyncRunId } from "../shared/brand";
import { FACET_NAMES, type Facets, type ListOptions, type RfqListResponse, type RfqQuery } from "../shared/schemas";
import { buildCountQuery, buildFacetQuery, buildListQuery } from "./rfq-query";
import { rowToRfq, type RfqRow } from "./rfq-row";

const identity = (r: ScrapedRfq) => `${r.solicitationNumber}|${r.nsn ?? r.partNumber}|${r.prNumber}`;

/** Within one batch the same identity may appear twice; Postgres rejects that in one upsert, so keep the last. */
const dedupe = (rows: ScrapedRfq[]) => [...new Map(rows.map((r) => [identity(r), r])).values()];

function toDbRow(r: ScrapedRfq, runId: SyncRunId, now: Date) {
  return {
    solicitation_number: r.solicitationNumber, nsn: r.nsn, part_number: r.partNumber, fsc: r.fsc,
    nomenclature: r.nomenclature, item_name: r.itemName, mil_spec: r.milSpec, quantity: r.quantity,
    pr_number: r.prNumber, status: r.status, status_raw: r.statusRaw, set_aside: r.setAside,
    set_aside_raw: r.setAsideRaw, tech_docs: r.techDocs, posted_date: r.postedDate, issue_date: r.issueDate,
    return_by_date: r.returnByDate, dibbs_url: r.dibbsUrl, pdf_url: r.pdfUrl, tech_docs_url: r.techDocsUrl,
    first_seen_at: now, first_seen_run_id: runId, last_seen_at: now, last_sync_run_id: runId,
  };
}

/** Insert-or-update by (solicitation, item, PR). first_seen_* are set only on insert; posted_date keeps the earliest. */
export async function upsertRfqs(sql: SQL, rows: ScrapedRfq[], runId: SyncRunId): Promise<number> {
  const unique = dedupe(rows);
  if (unique.length === 0) return 0;
  const now = new Date();
  const result = await sql`
    insert into rfqs ${sql(unique.map((r) => toDbRow(r, runId, now)))}
    on conflict on constraint rfqs_identity do update set
      fsc = excluded.fsc, nomenclature = excluded.nomenclature, item_name = excluded.item_name,
      mil_spec = excluded.mil_spec, quantity = excluded.quantity, status = excluded.status,
      status_raw = excluded.status_raw, set_aside = excluded.set_aside, set_aside_raw = excluded.set_aside_raw,
      tech_docs = excluded.tech_docs, issue_date = excluded.issue_date, return_by_date = excluded.return_by_date,
      dibbs_url = excluded.dibbs_url, pdf_url = excluded.pdf_url, tech_docs_url = excluded.tech_docs_url,
      posted_date = least(rfqs.posted_date, excluded.posted_date),
      last_seen_at = now(), last_sync_run_id = excluded.last_sync_run_id
    returning id`;
  return result.length;
}

export async function listRfqs(
  sql: SQL, query: RfqQuery, options: ListOptions, windowDates: IsoDate[],
): Promise<RfqListResponse> {
  const list = buildListQuery(query, options, windowDates);
  const count = buildCountQuery(query, windowDates);
  const [rows, [{ total }]] = await Promise.all([
    sql.unsafe(list.text, list.values) as Promise<RfqRow[]>,
    sql.unsafe(count.text, count.values) as Promise<[{ total: number }]>,
  ]);
  return { items: rows.map(rowToRfq), total, page: options.page, pageSize: options.pageSize };
}

export async function getFacets(sql: SQL, query: RfqQuery, windowDates: IsoDate[]): Promise<Facets> {
  const results = await Promise.all(
    FACET_NAMES.map((name) => {
      const q = buildFacetQuery(name, query, windowDates);
      return sql.unsafe(q.text, q.values) as Promise<{ value: string; count: number }[]>;
    }),
  );
  return Object.fromEntries(
    FACET_NAMES.map((name, i) => [name, results[i]!.map((r) => ({ value: r.value, count: r.count }))]),
  ) as Facets;
}

export async function upsertFscNames(sql: SQL, names: { code: Fsc; name: string }[]): Promise<void> {
  if (names.length === 0) return;
  await sql`
    insert into fsc_names ${sql(names.map((n) => ({ code: n.code, name: n.name, updated_at: new Date() })))}
    on conflict (code) do update set name = excluded.name, updated_at = excluded.updated_at`;
}

export async function getFscNames(sql: SQL): Promise<Record<string, string>> {
  const rows: { code: string; name: string }[] = await sql`select code, name from fsc_names order by code`;
  return Object.fromEntries(rows.map((r) => [r.code, r.name]));
}
