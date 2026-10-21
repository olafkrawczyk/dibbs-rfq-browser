import type { FacetBucket } from "../shared/schemas";

/** Facet buckets plus any selected value the current results no longer contain (so it can be unticked). */
export function withSelected(buckets: FacetBucket[], selected: readonly string[]): FacetBucket[] {
  const present = new Set(buckets.map((b) => b.value));
  const missing = selected.filter((v) => !present.has(v));
  return missing.length ? [...buckets, ...missing.map((value) => ({ value, count: 0 }))] : buckets;
}
