import { DEFAULT_QUERY, type RfqQuery } from "../shared/schemas";
import { SET_ASIDE_LABELS, STATUS_LABELS, TECH_DOCS_LABELS } from "./labels";

export type Chip = { key: string; label: string; reset: Partial<RfqQuery> };

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
const list = (label: string, values: readonly string[]) => `${label}: ${values.length ? values.join(", ") : "any"}`;

/** One removable chip per non-default filter, each with the patch that resets it. */
export function activeChips(q: RfqQuery): Chip[] {
  const chips: Chip[] = [];
  if (q.q) chips.push({ key: "q", label: `“${q.q}”`, reset: { q: undefined } });
  if (!sameList(q.status, DEFAULT_QUERY.status))
    chips.push({ key: "status", label: list("Status", q.status.map((s) => STATUS_LABELS[s])), reset: { status: DEFAULT_QUERY.status } });
  if (q.setAside.length)
    chips.push({ key: "setAside", label: list("Set-aside", q.setAside.map((s) => SET_ASIDE_LABELS[s])), reset: { setAside: [] } });
  if (q.fsc.length) chips.push({ key: "fsc", label: list("FSC", q.fsc), reset: { fsc: [] } });
  if (q.itemName.length) chips.push({ key: "itemName", label: list("Item", q.itemName), reset: { itemName: [] } });
  if (q.closesWithinDays !== undefined)
    chips.push({ key: "closesWithinDays", label: `Closes within ${q.closesWithinDays}d`, reset: { closesWithinDays: undefined } });
  if (q.returnByFrom || q.returnByTo)
    chips.push({
      key: "returnBy",
      label: `Return by ${q.returnByFrom ?? "…"} – ${q.returnByTo ?? "…"}`,
      reset: { returnByFrom: undefined, returnByTo: undefined },
    });
  if (q.postedOn.length) chips.push({ key: "postedOn", label: list("Posted", q.postedOn), reset: { postedOn: [] } });
  if (q.qtyMin !== undefined || q.qtyMax !== undefined) {
    const label = q.qtyMin !== undefined && q.qtyMax !== undefined ? `Qty ${q.qtyMin}–${q.qtyMax}`
      : q.qtyMin !== undefined ? `Qty ≥ ${q.qtyMin}` : `Qty ≤ ${q.qtyMax}`;
    chips.push({ key: "qty", label, reset: { qtyMin: undefined, qtyMax: undefined } });
  }
  if (q.techDocs !== "any")
    chips.push({ key: "techDocs", label: `Tech docs: ${TECH_DOCS_LABELS[q.techDocs]}`, reset: { techDocs: "any" } });
  return chips;
}
