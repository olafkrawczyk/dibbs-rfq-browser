import { ArrowDownIcon, ArrowUpIcon, ArrowUpDownIcon } from "lucide-react";
import type { IsoDate } from "../../shared/brand";
import type { Rfq, SortField, SortKey } from "../../shared/schemas";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { RfqRow } from "./RfqRow";

type Column = { label: string; sort?: SortField; className?: string };

const COLUMNS: Column[] = [
  { label: "Solicitation", sort: "solicitation" },
  { label: "NSN / Part", sort: "nsn" },
  { label: "Nomenclature", sort: "itemName" },
  { label: "Qty", sort: "qty", className: "text-right" },
  { label: "Set-aside" },
  { label: "Posted", sort: "posted" },
  { label: "Return by", sort: "returnBy" },
  { label: "Status" },
  { label: "", className: "text-right" },
];

const SKELETON_ROWS = 10;

function SortHeader({ col, sort, onSort }: { col: Column; sort: SortKey[]; onSort: (f: SortField) => void }) {
  if (!col.sort) return <TableHead className={col.className}>{col.label}</TableHead>;
  const primary = sort[0];
  const active = primary?.field === col.sort;
  const Icon = !active ? ArrowUpDownIcon : primary.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TableHead className={col.className} aria-sort={active ? (primary.dir === "asc" ? "ascending" : "descending") : "none"}>
      <Button variant="ghost" size="sm" className={cn("-mx-2 h-7 px-2", col.className && "ml-auto flex")}
        onClick={() => onSort(col.sort!)}>
        {col.label}
        <Icon className={cn("size-3", !active && "opacity-40")} />
      </Button>
    </TableHead>
  );
}

type Props = {
  rows: Rfq[] | undefined;
  today: IsoDate;
  sort: SortKey[];
  onSort: (field: SortField) => void;
  focusedIndex?: number;
  empty: React.ReactNode;
};

export function RfqTable({ rows, today, sort, onSort, focusedIndex, empty }: Props) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => <SortHeader key={c.label || "actions"} col={c} sort={sort} onSort={onSort} />)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows === undefined &&
            Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <TableRow key={i}>
                {COLUMNS.map((c, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
              </TableRow>
            ))}
          {rows?.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMNS.length} className="py-12 text-center">{empty}</TableCell>
            </TableRow>
          )}
          {rows?.map((r, i) => <RfqRow key={r.id} rfq={r} today={today} index={i} focused={i === focusedIndex} />)}
        </TableBody>
      </Table>
    </div>
  );
}
