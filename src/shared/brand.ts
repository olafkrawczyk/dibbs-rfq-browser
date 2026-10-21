import { z } from "zod";

export const Nsn = z.string().regex(/^\d{13}$/).brand<"Nsn">();
export type Nsn = z.infer<typeof Nsn>;

export const PartNumber = z.string().trim().min(1).max(64).brand<"PartNumber">();
export type PartNumber = z.infer<typeof PartNumber>;

export const SolicitationNumber = z.string().regex(/^[A-Z0-9]{13}$/).brand<"SolicitationNumber">();
export type SolicitationNumber = z.infer<typeof SolicitationNumber>;

/** Opaque purchase request id; DIBBS sometimes leaves it blank or oddly formatted, so it is never a reason to drop a row. */
export const PrNumber = z.string().trim().max(40).brand<"PrNumber">();
export type PrNumber = z.infer<typeof PrNumber>;

export const Fsc = z.string().regex(/^\d{4}$/).brand<"Fsc">();
export type Fsc = z.infer<typeof Fsc>;

export const ItemName = z.string().trim().min(1).brand<"ItemName">();
export type ItemName = z.infer<typeof ItemName>;

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isRealDate, "Invalid date")
  .brand<"IsoDate">();
export type IsoDate = z.infer<typeof IsoDate>;

export const SyncRunId = z.coerce.number().int().positive().brand<"SyncRunId">();
export type SyncRunId = z.infer<typeof SyncRunId>;
