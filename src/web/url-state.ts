import { parseSearchParams, toSearchParams } from "../shared/search-params";
import {
  DEFAULT_LIST_OPTIONS, DEFAULT_QUERY, type ListOptions, type RfqQuery, type SortField, type SortKey,
} from "../shared/schemas";

export type UrlState = { query: RfqQuery; options: ListOptions };

/** location.search → state; invalid params fall back to defaults (and say so) instead of a blank screen. */
export function readUrlState(search: string): UrlState & { invalid: boolean } {
  const parsed = parseSearchParams(new URLSearchParams(search));
  if (parsed.ok) return { query: parsed.query, options: parsed.options, invalid: false };
  return { query: DEFAULT_QUERY, options: DEFAULT_LIST_OPTIONS, invalid: true };
}

/** Any filter or page-size change starts over at page 1; an explicit page change keeps the filters. */
export function nextUrlState(cur: UrlState, next: Partial<RfqQuery>, opts: Partial<ListOptions> = {}): UrlState {
  const filtersChanged = Object.keys(next).length > 0;
  const resetPage = filtersChanged || opts.pageSize !== undefined || opts.sort !== undefined;
  return {
    query: { ...cur.query, ...next },
    options: { ...cur.options, ...opts, page: opts.page ?? (resetPage ? 1 : cur.options.page) },
  };
}

/** "Clear all": every filter back to its default (optional ones removed), keeping sort and page size. */
export const clearFilters = (cur: UrlState): UrlState => ({
  query: DEFAULT_QUERY,
  options: { ...cur.options, page: 1 },
});

export const toSearch = (s: UrlState): string => {
  const p = toSearchParams(s.query, s.options).toString();
  return p ? `?${p}` : "";
};

const DESC_FIRST: ReadonlySet<SortField> = new Set(["posted", "qty"]);

/** Header click: same primary field flips direction; a new field becomes the single sort key. */
export function toggleSort(sort: SortKey[], field: SortField): SortKey[] {
  const primary = sort[0];
  if (primary?.field === field) return [{ field, dir: primary.dir === "asc" ? "desc" : "asc" }];
  return [{ field, dir: DESC_FIRST.has(field) ? "desc" : "asc" }];
}
