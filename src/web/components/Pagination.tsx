import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const PAGE_SIZES = [25, 50, 100, 200] as const;

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onChange: (opts: { page?: number; pageSize?: number }) => void;
};

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-sm">
      <span>{total.toLocaleString("en-US")} RFQs</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5">
          Rows
          <select
            className="border-input bg-background h-8 rounded-md border px-2"
            value={pageSize}
            onChange={(e) => onChange({ pageSize: Number(e.target.value) })}
          >
            {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={page <= 1}
          onClick={() => onChange({ page: page - 1 })}>
          <ChevronLeftIcon />
        </Button>
        <span className="tabular-nums">Page {page} of {pages}</span>
        <Button variant="outline" size="icon-sm" aria-label="Next page" disabled={page >= pages}
          onClick={() => onChange({ page: page + 1 })}>
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  );
}
