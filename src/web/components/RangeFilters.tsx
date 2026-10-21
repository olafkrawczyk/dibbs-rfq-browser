import { useEffect, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { IsoDate } from "../../shared/brand";
import type { RfqQuery } from "../../shared/schemas";
import { TECH_DOCS_LABELS } from "../labels";
import { dateInputCommit } from "../inputs";
import { setBound } from "../ranges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = { query: RfqQuery; set: (next: Partial<RfqQuery>) => void };

const PRESETS = [3, 7, 14] as const;
const TECH_DOCS = ["any", "available", "spec_only", "none"] as const;

/** Date box with local text: half-typed years never reach the URL (or drag the other bound). */
function DateInput({ label, value, onCommit }: { label: string; value?: IsoDate; onCommit: (v?: IsoDate) => void }) {
  const [text, setText] = useState(value ?? "");
  useEffect(() => setText(value ?? ""), [value]);
  return (
    <Input type="date" aria-label={label} value={text}
      onChange={(e) => {
        setText(e.target.value);
        const c = dateInputCommit(e.target.value);
        if (c.commit && c.value !== value) onCommit(c.value);
      }} />
  );
}

function ClosesWithin({ query, set }: Props) {
  const active = query.closesWithinDays !== undefined || query.returnByFrom || query.returnByTo;
  const setDate = (side: "lo" | "hi", v?: IsoDate) => {
    const r = setBound({ lo: query.returnByFrom, hi: query.returnByTo }, side, v);
    set({ returnByFrom: r.lo, returnByTo: r.hi, closesWithinDays: undefined });
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8 border-dashed", active && "border-solid")}>
          Closes within{query.closesWithinDays ? ` ${query.closesWithinDays}d` : active ? " (range)" : ""}
          <ChevronDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-72 flex-col gap-3" align="start">
        <div className="flex gap-1.5">
          {PRESETS.map((d) => (
            <Button key={d} size="sm" variant={query.closesWithinDays === d ? "default" : "outline"}
              onClick={() => set({ closesWithinDays: query.closesWithinDays === d ? undefined : d, returnByFrom: undefined, returnByTo: undefined })}>
              {d} days
            </Button>
          ))}
        </div>
        <div className="text-muted-foreground text-xs">or return-by range</div>
        <div className="flex items-center gap-2">
          <DateInput label="Return by from" value={query.returnByFrom} onCommit={(v) => setDate("lo", v)} />
          <span>–</span>
          <DateInput label="Return by to" value={query.returnByTo} onCommit={(v) => setDate("hi", v)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Numeric box that only commits on blur/Enter (no request per keystroke). */
function QtyInput({ label, value, onCommit }: { label: string; value?: number; onCommit: (v?: number) => void }) {
  const [text, setText] = useState(value?.toString() ?? "");
  useEffect(() => setText(value?.toString() ?? ""), [value]);
  const commit = () => {
    const n = text.replace(/,/g, "").trim();
    const parsed = n === "" ? undefined : Number.parseInt(n, 10);
    if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0)) return setText(value?.toString() ?? "");
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <Input inputMode="numeric" aria-label={label} placeholder={label} className="h-8 w-24" value={text}
      onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
  );
}

function Quantity({ query, set }: Props) {
  // Keep min ≤ max (the API rejects the reverse).
  const setQty = (side: "lo" | "hi") => (v?: number) => {
    const r = setBound({ lo: query.qtyMin, hi: query.qtyMax }, side, v);
    set({ qtyMin: r.lo, qtyMax: r.hi });
  };
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">Qty</span>
      <QtyInput label="Min" value={query.qtyMin} onCommit={setQty("lo")} />
      <span>–</span>
      <QtyInput label="Max" value={query.qtyMax} onCommit={setQty("hi")} />
    </div>
  );
}

function TechDocs({ query, set }: Props) {
  return (
    <div className="flex items-center gap-1.5 text-sm" role="group" aria-label="Tech docs">
      <span className="text-muted-foreground">Tech docs</span>
      <div className="flex rounded-md border p-0.5">
        {TECH_DOCS.map((t) => (
          <Button key={t} size="sm" variant={query.techDocs === t ? "secondary" : "ghost"} className="h-6 px-2 text-xs"
            aria-pressed={query.techDocs === t} onClick={() => set({ techDocs: t })}>
            {TECH_DOCS_LABELS[t]}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function RangeFilters(props: Props) {
  return (
    <>
      <ClosesWithin {...props} />
      <Quantity {...props} />
      <TechDocs {...props} />
    </>
  );
}
