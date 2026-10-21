import { IsoDate } from "../shared/brand";

const DAY_MS = 86_400_000;
const URGENT_DAYS = 3;

const daysBetween = (from: IsoDate, to: IsoDate) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Relative label for a return-by date; urgent when it closes today or within the next 2 days. */
export function returnByLabel(returnBy: IsoDate | null, today: IsoDate): { text: string; urgent: boolean } {
  if (returnBy === null) return { text: "—", urgent: false };
  const days = daysBetween(today, returnBy);
  const text = days === 0 ? "today" : days > 0 ? `in ${days}d` : `${-days}d ago`;
  return { text, urgent: days >= 0 && days < URGENT_DAYS };
}

const qtyFormat = new Intl.NumberFormat("en-US");

export function formatQty(n: number | null): string {
  return n === null ? "—" : qtyFormat.format(n);
}

/** The viewer's local calendar date. */
export function todayIso(now = new Date()): IsoDate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return IsoDate.parse(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
}
