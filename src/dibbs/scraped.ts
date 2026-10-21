import { z } from "zod";
import {
  Fsc, IsoDate, ItemName, Nsn, PartNumber, PrNumber, SolicitationNumber,
} from "../shared/brand";
import { RFQ_STATUSES, SET_ASIDES, TECH_DOCS } from "../domain/normalize";

/** One RFQ row as scraped from a DIBBS records page, after normalization. */
export const ScrapedRfq = z
  .object({
    solicitationNumber: SolicitationNumber,
    nsn: Nsn.nullable(),
    partNumber: PartNumber.nullable(),
    fsc: Fsc.nullable(),
    nomenclature: z.string().min(1),
    itemName: ItemName,
    milSpec: z.boolean(),
    quantity: z.number().int().nonnegative().nullable(),
    prNumber: PrNumber,
    status: z.enum(RFQ_STATUSES),
    statusRaw: z.string(),
    setAside: z.enum(SET_ASIDES),
    setAsideRaw: z.string().nullable(),
    techDocs: z.enum(TECH_DOCS),
    postedDate: IsoDate,
    issueDate: IsoDate.nullable(),
    returnByDate: IsoDate.nullable(),
    dibbsUrl: z.url(),
    pdfUrl: z.url().nullable(),
    techDocsUrl: z.url().nullable(),
  })
  .refine((r) => (r.nsn === null) !== (r.partNumber === null), "exactly one of nsn / partNumber");
export type ScrapedRfq = z.infer<typeof ScrapedRfq>;
