import { keepPreviousData, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { toSearchParams } from "../shared/search-params";
import { DEFAULT_LIST_OPTIONS, type Rfq } from "../shared/schemas";
import { fetchFacets, fetchMeta, fetchRfqs } from "./api";
import { activeChips } from "./chips";
import { todayIso } from "./format";
import { toggleSort } from "./url-state";
import { useRowKeyboard } from "./use-row-keyboard";
import { useUrlState } from "./use-url-state";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ActiveChips } from "./components/ActiveChips";
import { DodHintProvider, useDodHint } from "./components/DodHint";
import { FilterBar } from "./components/FilterBar";
import { Header } from "./components/Header";
import { Pagination } from "./components/Pagination";
import { RfqTable } from "./components/RfqTable";
import { SearchBox } from "./components/SearchBox";
import { SyncControl } from "./components/SyncControl";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
const META_REFRESH_MS = 60_000;
const NO_ROWS: Rfq[] = [];

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="border-destructive/40 bg-destructive/5 text-destructive flex items-center justify-between rounded-md border px-4 py-2 text-sm">
      <span>Couldn't load RFQs: {message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function Browser() {
  const { query, options, set, clear: clearFilters } = useUrlState();
  const params = toSearchParams(query, options);
  // Facets ignore sort and paging, so paging doesn't refetch them.
  const facetParams = toSearchParams(query, DEFAULT_LIST_OPTIONS);

  const meta = useQuery({ queryKey: ["meta"], queryFn: () => fetchMeta(), refetchInterval: META_REFRESH_MS });
  const rfqs = useQuery({
    queryKey: ["rfqs", params.toString()],
    queryFn: () => fetchRfqs(params),
    placeholderData: keepPreviousData,
  });
  const facets = useQuery({
    queryKey: ["facets", facetParams.toString()],
    queryFn: () => fetchFacets(facetParams),
    placeholderData: keepPreviousData,
  });

  const open = useDodHint();
  const focused = useRowKeyboard(rfqs.data?.items ?? NO_ROWS, open);

  const emptyDb = meta.data?.lastRun === null && rfqs.data?.total === 0 && activeChips(query).length === 0;

  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <Header meta={meta.data} showSync={!emptyDb} />
      {emptyDb ? (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <p className="text-lg font-medium">No data yet</p>
          <p className="text-muted-foreground text-sm">Run a sync to pull the latest RFQs from DIBBS.</p>
          <SyncControl activeRun={meta.data?.activeRun ?? null} />
        </div>
      ) : (
        <>
          <SearchBox value={query.q ?? ""} onChange={(q) => set({ q: q.trim() || undefined })} />
          <FilterBar query={query} set={set} facets={facets.data} meta={meta.data} />
          <ActiveChips query={query} set={set} onClearAll={clearFilters} />
          {rfqs.isError && <ErrorBanner message={rfqs.error.message} onRetry={() => rfqs.refetch()} />}
          <div className={rfqs.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
            <RfqTable
              rows={rfqs.data?.items ?? (rfqs.isError ? NO_ROWS : undefined)}
              today={todayIso()}
              sort={options.sort}
              onSort={(field) => set({}, { sort: toggleSort(options.sort, field) })}
              focusedIndex={focused}
              empty={rfqs.isError ? null : (
                <div className="flex flex-col items-center gap-2">
                  <span className="text-muted-foreground">No RFQs match these filters.</span>
                  <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
                </div>
              )}
            />
          </div>
          {rfqs.data && (
            <Pagination page={rfqs.data.page} pageSize={rfqs.data.pageSize} total={rfqs.data.total}
              onChange={(o) => set({}, o)} />
          )}
        </>
      )}
    </main>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <DodHintProvider>
          <Browser />
        </DodHintProvider>
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
