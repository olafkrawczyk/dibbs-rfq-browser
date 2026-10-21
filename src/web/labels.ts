import type { RfqStatus, SetAside, TechDocs } from "../domain/normalize";

export const SET_ASIDE_LABELS: Record<SetAside, string> = {
  small_business: "Small business",
  sdvosb: "SDVOSB",
  wosb: "WOSB",
  hubzone: "HUBZone",
  "8a": "8(a)",
  unrestricted: "Unrestricted",
  other: "Other",
};

export const STATUS_LABELS: Record<RfqStatus, string> = {
  open: "Open",
  removed: "Removed",
  cancelled: "Cancelled",
  awarded: "Awarded",
  other: "Other",
};

export const TECH_DOCS_LABELS: Record<TechDocs | "any", string> = {
  any: "Any",
  available: "Available",
  spec_only: "Spec only",
  none: "None",
};
