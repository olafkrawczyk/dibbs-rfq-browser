import { z } from "zod";
import { DEFAULT_LIST_OPTIONS, DEFAULT_QUERY, ListOptions, RfqQuery, type SortKey } from "./schemas";

const MULTI_KEYS = ["status", "setAside", "fsc", "itemName", "postedOn"] as const;
const SINGLE_KEYS = ["q", "closesWithinDays", "returnByFrom", "returnByTo", "qtyMin", "qtyMax", "techDocs"] as const;

export type ParsedSearch =
  | { ok: true; query: RfqQuery; options: ListOptions }
  | { ok: false; issues: z.core.$ZodIssue[] };

const splitList = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

const parseSort = (v: string) =>
  splitList(v).map((part) => {
    const [field, dir] = part.split(":");
    return { field, dir: dir ?? "asc" };
  });

/** URL query string → validated query + list options (the same parser for API and web). */
export function parseSearchParams(p: URLSearchParams): ParsedSearch {
  const rawQuery: Record<string, unknown> = {};
  for (const k of MULTI_KEYS) if (p.has(k)) rawQuery[k] = splitList(p.get(k)!);
  for (const k of SINGLE_KEYS) if (p.has(k)) rawQuery[k] = p.get(k);

  const rawOptions: Record<string, unknown> = {};
  if (p.has("sort")) rawOptions.sort = parseSort(p.get("sort")!);
  if (p.has("page")) rawOptions.page = p.get("page");
  if (p.has("pageSize")) rawOptions.pageSize = p.get("pageSize");

  const query = RfqQuery.safeParse(rawQuery);
  const options = ListOptions.safeParse(rawOptions);
  if (!query.success || !options.success) {
    return { ok: false, issues: [...(query.error?.issues ?? []), ...(options.error?.issues ?? [])] };
  }
  return { ok: true, query: query.data, options: options.data };
}

const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

const sortToString = (sort: SortKey[]) => sort.map((s) => `${s.field}:${s.dir}`).join(",");

/** Inverse of parseSearchParams; omits defaults so the default view is a bare URL. */
export function toSearchParams(query: RfqQuery, options: ListOptions): URLSearchParams {
  const p = new URLSearchParams();
  if (query.q) p.set("q", query.q);
  for (const k of MULTI_KEYS) {
    const v = query[k] as readonly string[];
    if (!sameList(v, DEFAULT_QUERY[k] as readonly string[])) p.set(k, v.join(","));
  }
  for (const k of SINGLE_KEYS) {
    if (k === "q") continue;
    const v = query[k];
    if (v !== undefined && v !== DEFAULT_QUERY[k]) p.set(k, String(v));
  }
  if (sortToString(options.sort) !== sortToString(DEFAULT_LIST_OPTIONS.sort)) p.set("sort", sortToString(options.sort));
  if (options.page !== DEFAULT_LIST_OPTIONS.page) p.set("page", String(options.page));
  if (options.pageSize !== DEFAULT_LIST_OPTIONS.pageSize) p.set("pageSize", String(options.pageSize));
  return p;
}
