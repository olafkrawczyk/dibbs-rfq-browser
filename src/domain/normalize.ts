import {
  Fsc, IsoDate, ItemName, Nsn, PartNumber, SolicitationNumber,
} from "../shared/brand";

export type ItemId =
  | { kind: "nsn"; nsn: Nsn; fsc: Fsc }
  | { kind: "part"; partNumber: PartNumber };

export type SetAside = "small_business" | "unrestricted" | "other";
export const SET_ASIDES = ["small_business", "unrestricted", "other"] as const;

export type RfqStatus = "open" | "removed" | "cancelled" | "awarded" | "other";
export const RFQ_STATUSES = ["open", "removed", "cancelled", "awarded", "other"] as const;

export type TechDocs = "available" | "spec_only" | "none";
export const TECH_DOCS = ["available", "spec_only", "none"] as const;

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** NSN/Part Number cell → NSN (13 digits once dashes are removed) or part number. */
export function parseItemId(raw: string): ItemId {
  const compact = raw.replace(/[\s-]/g, "");
  if (/^\d{13}$/.test(compact)) {
    return { kind: "nsn", nsn: Nsn.parse(compact), fsc: Fsc.parse(compact.slice(0, 4)) };
  }
  return { kind: "part", partNumber: PartNumber.parse(collapse(raw)) };
}

/** DoD-style "NOUN, MODIFIER" → NOUN (whole string when there is no comma). */
export function toItemName(nomenclature: string): ItemName {
  const upper = collapse(nomenclature).toUpperCase();
  const noun = upper.split(",")[0]!.trim();
  return ItemName.parse(noun || upper);
}

export function normalizeSetAside(alt: string | null): { setAside: SetAside; raw: string | null } {
  const raw = alt === null ? null : collapse(alt);
  if (raw && /small business/i.test(raw)) return { setAside: "small_business", raw };
  if (raw && /unrestricted/i.test(raw)) return { setAside: "unrestricted", raw };
  return { setAside: "other", raw };
}

const STATUS_PREFIXES: [string, RfqStatus][] = [
  ["open", "open"],
  ["removed", "removed"],
  ["cancel", "cancelled"],
  ["award", "awarded"],
];

export function normalizeStatus(text: string): { status: RfqStatus; raw: string } {
  const raw = collapse(text);
  const lower = raw.toLowerCase();
  const hit = STATUS_PREFIXES.find(([prefix]) => lower.startsWith(prefix));
  return { status: hit ? hit[1] : "other", raw };
}

export function normalizeTechDocs(hasLink: boolean, specOnly: boolean): TechDocs {
  if (specOnly) return "spec_only";
  return hasLink ? "available" : "none";
}

/** MM-DD-YYYY → YYYY-MM-DD, or null when not a real date. */
export function parseUsDate(s: string): IsoDate | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const parsed = IsoDate.safeParse(`${m[3]}-${m[1]}-${m[2]}`);
  return parsed.success ? parsed.data : null;
}

/** YYYY-MM-DD → MM-DD-YYYY (DIBBS URL format). */
export function toUsDate(d: IsoDate): string {
  const [y, m, day] = d.split("-");
  return `${m}-${day}-${y}`;
}

export function normalizeSolicitation(s: string): SolicitationNumber {
  return SolicitationNumber.parse(s.replace(/[^A-Za-z0-9]/g, "").toUpperCase());
}

/** "7018560662 QTY: 57,000" → 57000; null when no QTY is present. */
export function parseQuantity(s: string): number | null {
  const m = /QTY:\s*([\d,]+)/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ""));
  return Number.isSafeInteger(n) ? n : null;
}
