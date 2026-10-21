import { ScrapedRfq } from "../../src/dibbs/scraped";

let seq = 0;

/** A valid ScrapedRfq; each call gets a unique solicitation unless overridden. */
export function scraped(overrides: Partial<Record<keyof ScrapedRfq, unknown>> = {}): ScrapedRfq {
  seq += 1;
  const sol = `SPE1C127Q${String(seq).padStart(4, "0")}`;
  return ScrapedRfq.parse({
    solicitationNumber: sol,
    nsn: "8315016839267",
    partNumber: null,
    fsc: "8315",
    nomenclature: "BUCKLE, CLIPS",
    itemName: "BUCKLE",
    milSpec: false,
    quantity: 100,
    prNumber: "7018560662",
    status: "open",
    statusRaw: "Open",
    setAside: "small_business",
    setAsideRaw: "Small Business Set-Aside",
    techDocs: "none",
    postedDate: "2026-10-20",
    issueDate: "2026-10-20",
    returnByDate: "2026-11-20",
    dibbsUrl: `https://www.dibbs.bsm.dla.mil/RFQ/RFQRec.aspx?sn=${sol}`,
    pdfUrl: null,
    techDocsUrl: null,
    ...overrides,
  });
}
