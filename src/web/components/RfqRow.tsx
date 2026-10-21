import { CopyIcon, ExternalLinkIcon, FileTextIcon, HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { formatNsn, formatSolicitation } from "../../shared/format";
import type { IsoDate } from "../../shared/brand";
import type { Rfq } from "../../shared/schemas";
import { formatQty, returnByLabel } from "../format";
import { SET_ASIDE_LABELS, STATUS_LABELS } from "../labels";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ExternalLink } from "./ExternalLink";

const NOMENCLATURE_TIP = "DIBBS truncates names — open the RFQ for the full description";
const NO_PDF_TIP = "No PDF listed — open the package on DIBBS";

const copy = (text: string) =>
  navigator.clipboard.writeText(text).then(() => toast.success(`Copied ${text}`), () => toast.error("Copy failed"));

function WithTip({ tip, children }: { tip: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function PartCell({ rfq }: { rfq: Rfq }) {
  const shown = rfq.nsn ? formatNsn(rfq.nsn) : (rfq.partNumber ?? "—");
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      <span className="font-mono text-xs">{shown}</span>
      {shown !== "—" && (
        <Button variant="ghost" size="icon-sm" className="size-6" aria-label={`Copy ${shown}`} onClick={() => copy(shown)}>
          <CopyIcon className="size-3" />
        </Button>
      )}
      {rfq.milSpec && <Badge variant="outline" className="text-[10px]">Mil-Spec</Badge>}
    </div>
  );
}

const iconLink = cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "hover:no-underline");

function Actions({ rfq }: { rfq: Rfq }) {
  return (
    <div className="flex items-center justify-end gap-0.5">
      {rfq.links.pdf ? (
        <ExternalLink href={rfq.links.pdf} className={iconLink} title="PDF">
          <FileTextIcon /><span className="sr-only">PDF</span>
        </ExternalLink>
      ) : (
        <WithTip tip={NO_PDF_TIP}>
          {/* span keeps the tooltip working on a disabled button */}
          <span tabIndex={0}>
            <Button variant="ghost" size="icon-sm" disabled aria-label="PDF (none listed)"><FileTextIcon /></Button>
          </span>
        </WithTip>
      )}
      <ExternalLink href={rfq.links.dibbs} className={iconLink} title="Open on DIBBS ↗">
        <ExternalLinkIcon /><span className="sr-only">Open on DIBBS ↗</span>
      </ExternalLink>
      {rfq.links.nsnHistory && (
        <ExternalLink href={rfq.links.nsnHistory} className={iconLink} title="NSN history">
          <HistoryIcon /><span className="sr-only">NSN history</span>
        </ExternalLink>
      )}
    </div>
  );
}

export function RfqRow({ rfq, today, focused = false }: { rfq: Rfq; today: IsoDate; focused?: boolean }) {
  const due = returnByLabel(rfq.returnByDate, today);
  const muted = rfq.status !== "open";
  return (
    <TableRow
      data-state={focused ? "selected" : undefined}
      aria-selected={focused}
      className={cn(muted && "text-muted-foreground opacity-70")}
    >
      <TableCell className="whitespace-nowrap">
        <ExternalLink href={rfq.links.pdf ?? rfq.links.dibbs} className="font-mono text-xs font-medium">
          {formatSolicitation(rfq.solicitationNumber)}
        </ExternalLink>
        {!rfq.links.pdf && <span className="text-muted-foreground block text-[10px] leading-none uppercase">package</span>}
      </TableCell>
      <TableCell><PartCell rfq={rfq} /></TableCell>
      <TableCell className="max-w-44">
        <WithTip tip={NOMENCLATURE_TIP}><span className="block truncate">{rfq.nomenclature}</span></WithTip>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatQty(rfq.quantity)}</TableCell>
      <TableCell>
        <Badge variant={rfq.setAside === "unrestricted" ? "outline" : "secondary"}>
          {SET_ASIDE_LABELS[rfq.setAside]}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{rfq.postedDate}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {rfq.returnByDate ?? "—"}
        <span className={cn("ml-1.5 text-xs", due.urgent ? "font-medium text-amber-600" : "text-muted-foreground")}>
          {rfq.returnByDate && due.text}
        </span>
      </TableCell>
      <TableCell title={rfq.statusRaw}>{STATUS_LABELS[rfq.status]}</TableCell>
      <TableCell><Actions rfq={rfq} /></TableCell>
    </TableRow>
  );
}
