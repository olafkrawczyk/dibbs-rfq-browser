import { z } from "zod";
import { Fsc, IsoDate, ItemName, Nsn, PartNumber, PrNumber, SolicitationNumber, SyncRunId } from "./brand";
import { RFQ_STATUSES, SET_ASIDES, TECH_DOCS } from "../domain/normalize";

// ---------- Query (filters) — versioned, serializable; a future saved search stores this (§12) ----------

const optionalInt = (min: number, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).optional();

export const RfqQuery = z
  .object({
    version: z.literal(1).default(1),
    q: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.string().trim().max(100).optional()),
    status: z.array(z.enum(RFQ_STATUSES)).default(["open"]),
    setAside: z.array(z.enum(SET_ASIDES)).default([]),
    fsc: z.array(Fsc).default([]),
    itemName: z.array(ItemName).default([]),
    closesWithinDays: optionalInt(1, 365),
    returnByFrom: IsoDate.optional(),
    returnByTo: IsoDate.optional(),
    postedOn: z.array(IsoDate).default([]),
    qtyMin: optionalInt(0),
    qtyMax: optionalInt(0),
    techDocs: z.enum(["any", ...TECH_DOCS]).default("any"),
  })
  .refine((q) => q.qtyMin === undefined || q.qtyMax === undefined || q.qtyMin <= q.qtyMax, {
    message: "qtyMin must be ≤ qtyMax", path: ["qtyMin"],
  })
  .refine((q) => !q.returnByFrom || !q.returnByTo || q.returnByFrom <= q.returnByTo, {
    message: "returnByFrom must be ≤ returnByTo", path: ["returnByFrom"],
  });
export type RfqQuery = z.infer<typeof RfqQuery>;

export const SORT_FIELDS = ["posted", "returnBy", "qty", "nsn", "solicitation", "itemName"] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export const SortKey = z.object({ field: z.enum(SORT_FIELDS), dir: z.enum(["asc", "desc"]) });
export type SortKey = z.infer<typeof SortKey>;

export const ListOptions = z.object({
  sort: z.array(SortKey).min(1).max(3).default([{ field: "posted", dir: "desc" }, { field: "returnBy", dir: "asc" }]),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListOptions = z.infer<typeof ListOptions>;

export const DEFAULT_QUERY: RfqQuery = RfqQuery.parse({});
export const DEFAULT_LIST_OPTIONS: ListOptions = ListOptions.parse({});

export const FACET_NAMES = ["status", "setAside", "fsc", "itemName", "postedOn", "techDocs"] as const;
export type FacetName = (typeof FACET_NAMES)[number];

// ---------- Response DTOs ----------

export const Rfq = z.object({
  id: z.number().int(),
  solicitationNumber: SolicitationNumber,
  nsn: Nsn.nullable(),
  partNumber: PartNumber.nullable(),
  fsc: Fsc.nullable(),
  nomenclature: z.string(),
  itemName: ItemName,
  milSpec: z.boolean(),
  quantity: z.number().int().nullable(),
  prNumber: PrNumber,
  status: z.enum(RFQ_STATUSES),
  statusRaw: z.string(),
  setAside: z.enum(SET_ASIDES),
  setAsideRaw: z.string().nullable(),
  techDocs: z.enum(TECH_DOCS),
  postedDate: IsoDate,
  issueDate: IsoDate.nullable(),
  returnByDate: IsoDate.nullable(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  links: z.object({
    dibbs: z.string(),
    pdf: z.string().nullable(),
    techDocs: z.string().nullable(),
    nsnHistory: z.string().nullable(),
  }),
});
export type Rfq = z.infer<typeof Rfq>;

export const RfqListResponse = z.object({
  items: z.array(Rfq),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type RfqListResponse = z.infer<typeof RfqListResponse>;

export const FacetBucket = z.object({ value: z.string(), count: z.number().int() });
export type FacetBucket = z.infer<typeof FacetBucket>;
export const Facets = z.object(Object.fromEntries(FACET_NAMES.map((n) => [n, z.array(FacetBucket)])) as
  Record<FacetName, z.ZodArray<typeof FacetBucket>>);
export type Facets = Record<FacetName, FacetBucket[]>;

export const SYNC_DAY_STATUSES = ["pending", "running", "complete", "partial", "failed"] as const;
export const SyncDay = z.object({
  date: IsoDate,
  status: z.enum(SYNC_DAY_STATUSES),
  expected: z.number().int().nullable(),
  parsed: z.number().int(),
  invalid: z.number().int(),
  page: z.number().int(),
  pages: z.number().int().nullable(),
  error: z.string().optional(),
});
export type SyncDay = z.infer<typeof SyncDay>;

export const SYNC_RUN_STATUSES = ["queued", "running", "complete", "partial", "failed"] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];
export type FinishedRunStatus = Exclude<SyncRunStatus, "queued" | "running">;

export const SyncRun = z.object({
  id: SyncRunId,
  trigger: z.enum(["scheduled", "manual"]),
  status: z.enum(SYNC_RUN_STATUSES),
  requestedAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  windowDates: z.array(IsoDate),
  days: z.array(SyncDay),
  error: z.string().nullable(),
});
export type SyncRun = z.infer<typeof SyncRun>;

export const Meta = z.object({
  windowDays: z.number().int(),
  windowDates: z.array(IsoDate),
  dataAsOf: z.string().nullable(),
  lastRun: SyncRun.nullable(),
  activeRun: SyncRun.nullable(),
  fscNames: z.record(z.string(), z.string()),
});
export type Meta = z.infer<typeof Meta>;

export const ApiErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string(), issues: z.array(z.unknown()).optional() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
