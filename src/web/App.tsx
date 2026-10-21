import { keepPreviousData, QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { toSearchParams } from "../shared/search-params";
import { DEFAULT_QUERY } from "../shared/schemas";
import { fetchRfqs } from "./api";
import { todayIso } from "./format";
import { toggleSort } from "./url-state";
import { useUrlState } from "./use-url-state";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DodHintProvider } from "./components/DodHint";
import { Pagination } from "./components/Pagination";
import { RfqTable } from "./components/RfqTable";
import { SearchBox } from "./components/SearchBox";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="border-destructive/40 bg-destructive/5 text-destructive flex items-center justify-between rounded-md border px-4 py-2 text-sm">
      <span>Couldn't load RFQs: {message}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function Browser() {
  const { query, options, set } = useUrlState();
  const params = toSearchParams(query, options);
  const rfqs = useQuery({
    queryKey: ["rfqs", params.toString()],
    queryFn: () => fetchRfqs(params),
    placeholderData: keepPreviousData,
  });
  const clearFilters = () => set({ ...DEFAULT_QUERY });

  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">DIBBS RFQ Browser</h1>
      <SearchBox value={query.q ?? ""} onChange={(q) => set({ q: q.trim() || undefined })} />
      {rfqs.isError && <ErrorBanner message={rfqs.error.message} onRetry={() => rfqs.refetch()} />}
      <div className={rfqs.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
        <RfqTable
          rows={rfqs.data?.items ?? (rfqs.isError ? [] : undefined)}
          today={todayIso()}
          sort={options.sort}
          onSort={(field) => set({}, { sort: toggleSort(options.sort, field) })}
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
