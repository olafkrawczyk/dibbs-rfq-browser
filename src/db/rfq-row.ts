import { DIBBS_BASE_URL } from "../dibbs/parse-records";
import { Rfq } from "../shared/schemas";

/** A row as selected with RFQ_COLUMNS (dates already text, id already int). */
export type RfqRow = {
  id: number; solicitation_number: string; nsn: string | null; part_number: string | null; fsc: string | null;
  nomenclature: string; item_name: string; mil_spec: boolean; quantity: number | null; pr_number: string;
  status: string; status_raw: string; set_aside: string; set_aside_raw: string | null; tech_docs: string;
  posted_date: string; issue_date: string | null; return_by_date: string | null; dibbs_url: string;
  pdf_url: string | null; tech_docs_url: string | null; first_seen_at: Date; last_seen_at: Date;
};

export const nsnHistoryUrl = (nsn: string) => `${DIBBS_BASE_URL}/RFQ/RFQNsn.aspx?value=${nsn}&category=post`;

export function rowToRfq(row: RfqRow): Rfq {
  return Rfq.parse({
    id: row.id,
    solicitationNumber: row.solicitation_number,
    nsn: row.nsn,
    partNumber: row.part_number,
    fsc: row.fsc,
    nomenclature: row.nomenclature,
    itemName: row.item_name,
    milSpec: row.mil_spec,
    quantity: row.quantity,
    prNumber: row.pr_number,
    status: row.status,
    statusRaw: row.status_raw,
    setAside: row.set_aside,
    setAsideRaw: row.set_aside_raw,
    techDocs: row.tech_docs,
    postedDate: row.posted_date,
    issueDate: row.issue_date,
    returnByDate: row.return_by_date,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    links: {
      dibbs: row.dibbs_url,
      pdf: row.pdf_url,
      techDocs: row.tech_docs_url,
      nsnHistory: row.nsn ? nsnHistoryUrl(row.nsn) : null,
    },
  });
}
