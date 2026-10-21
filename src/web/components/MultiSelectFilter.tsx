import { ChevronDownIcon } from "lucide-react";
import type { FacetBucket } from "../../shared/schemas";
import { withSelected } from "../facet-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  label: string;
  options: FacetBucket[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  renderLabel?: (value: string) => string;
  searchable?: boolean;
};

export function MultiSelectFilter({ label, options, selected, onChange, renderLabel = (v) => v, searchable = false }: Props) {
  const chosen = new Set(selected);
  const toggle = (v: string) => onChange(chosen.has(v) ? selected.filter((s) => s !== v) : [...selected, v]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="rounded-sm px-1 font-normal">{selected.length}</Badge>
          )}
          <ChevronDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={searchable}>
          {searchable && <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />}
          <CommandList>
            <CommandEmpty>No options.</CommandEmpty>
            <CommandGroup>
              {withSelected(options, selected).map((o) => (
                <CommandItem key={o.value} value={`${o.value} ${renderLabel(o.value)}`} onSelect={() => toggle(o.value)}>
                  <Checkbox checked={chosen.has(o.value)} className="pointer-events-none" tabIndex={-1} />
                  <span className="truncate">{renderLabel(o.value)}</span>
                  <span className="text-muted-foreground ml-auto text-xs tabular-nums">{o.count.toLocaleString("en-US")}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {selected.length > 0 && (
            <Button variant="ghost" size="sm" className="m-1 justify-center" onClick={() => onChange([])}>
              Clear
            </Button>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
