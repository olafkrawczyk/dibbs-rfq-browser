import type { Meta } from "../../shared/schemas";
import { dataBadge, type BadgeTone } from "../sync-view";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SyncControl } from "./SyncControl";

const TONE_CLASS: Record<BadgeTone, string> = {
  ok: "border-emerald-600/30 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  error: "border-red-500/40 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  muted: "text-muted-foreground",
};

export function Header({ meta, showSync = true }: { meta: Meta | undefined; showSync?: boolean }) {
  const badge = meta ? dataBadge(meta.dataAsOf, meta.lastRun) : null;
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">DIBBS RFQ Browser</h1>
        {badge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" tabIndex={0} className={cn("tabular-nums", TONE_CLASS[badge.tone])}>{badge.text}</Badge>
            </TooltipTrigger>
            {badge.details.length > 0 && (
              <TooltipContent>
                <ul className="tabular-nums">{badge.details.map((d) => <li key={d}>{d}</li>)}</ul>
              </TooltipContent>
            )}
          </Tooltip>
        )}
      </div>
      {meta && showSync && <SyncControl activeRun={meta.activeRun} />}
    </header>
  );
}
