import { IsoDate } from "../shared/brand";

/** RfqQuery.q is capped at 100 chars; longer text would get a 400. */
export const Q_MAX = 100;
/** Browsers fire `change` per typed year digit (0002-…, 0020-…); ignore those half-typed years. */
const MIN_YEAR = 2000;

/** Sync the search box from the URL only when it really changed — not when it trimmed what's being typed. */
export const shouldSyncFromUrl = (urlValue: string, text: string) => urlValue !== text.trim();

export function toQueryText(text: string): string | undefined {
  const q = text.trim().slice(0, Q_MAX).trim();
  return q || undefined;
}

export function dateInputCommit(v: string): { commit: false } | { commit: true; value: IsoDate | undefined } {
  if (v === "") return { commit: true, value: undefined };
  const d = IsoDate.safeParse(v);
  if (!d.success || Number(v.slice(0, 4)) < MIN_YEAR) return { commit: false };
  return { commit: true, value: d.data };
}
