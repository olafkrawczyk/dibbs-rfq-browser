import { z } from "zod";
import { Fsc, IsoDate, ItemName } from "../../shared/brand";
import type { Facets, Meta, RfqQuery } from "../../shared/schemas";
import { RFQ_STATUSES, SET_ASIDES } from "../../domain/normalize";
import { SET_ASIDE_LABELS, STATUS_LABELS } from "../labels";
import { MultiSelectFilter } from "./MultiSelectFilter";
import { RangeFilters } from "./RangeFilters";

type Props = {
  query: RfqQuery;
  set: (next: Partial<RfqQuery>) => void;
  facets: Facets | undefined;
  meta: Meta | undefined;
};

/** Keep only option values that are valid for the filter (facet values come from the API). */
const parseEach = <S extends z.ZodType>(schema: S) => (vs: string[]): z.infer<S>[] =>
  vs.flatMap((v) => {
    const r = schema.safeParse(v);
    return r.success ? [r.data] : [];
  });
const asStatus = parseEach(z.enum(RFQ_STATUSES));
const asSetAside = parseEach(z.enum(SET_ASIDES));
const asFsc = parseEach(Fsc);
const asItemName = parseEach(ItemName);
const asDates = parseEach(IsoDate);

export function FilterBar({ query, set, facets, meta }: Props) {
  const fscName = (code: string) => {
    const name = meta?.fscNames[code];
    return name ? `${code} – ${name}` : code;
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectFilter label="Status" options={facets?.status ?? []} selected={query.status}
        renderLabel={(v) => STATUS_LABELS[v as keyof typeof STATUS_LABELS] ?? v}
        onChange={(v) => set({ status: asStatus(v) })} />
      <MultiSelectFilter label="Set-aside" options={facets?.setAside ?? []} selected={query.setAside}
        renderLabel={(v) => SET_ASIDE_LABELS[v as keyof typeof SET_ASIDE_LABELS] ?? v}
        onChange={(v) => set({ setAside: asSetAside(v) })} />
      <MultiSelectFilter label="FSC" searchable options={facets?.fsc ?? []} selected={query.fsc}
        renderLabel={fscName} onChange={(v) => set({ fsc: asFsc(v) })} />
      <MultiSelectFilter label="Item name" searchable options={facets?.itemName ?? []} selected={query.itemName}
        onChange={(v) => set({ itemName: asItemName(v) })} />
      <MultiSelectFilter label="Posted" options={facets?.postedOn ?? []} selected={query.postedOn}
        onChange={(v) => set({ postedOn: asDates(v).sort().reverse() })} />
      <RangeFilters query={query} set={set} />
    </div>
  );
}
