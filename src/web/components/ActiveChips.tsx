import { XIcon } from "lucide-react";
import type { RfqQuery } from "../../shared/schemas";
import { activeChips } from "../chips";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ActiveChips({ query, set, onClearAll }: {
  query: RfqQuery; set: (next: Partial<RfqQuery>) => void; onClearAll: () => void;
}) {
  const chips = activeChips(query);
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <Badge key={c.key} variant="secondary" className="gap-1 pr-1">
          {c.label}
          <button type="button" aria-label={`Remove ${c.label}`} className="hover:bg-foreground/10 rounded-sm p-0.5"
            onClick={() => set(c.reset)}>
            <XIcon className="size-3" />
          </button>
        </Badge>
      ))}
      <Button variant="link" size="sm" className="h-6 px-1" onClick={onClearAll}>Clear all</Button>
    </div>
  );
}
