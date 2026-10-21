import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import type { SyncRunId } from "../../shared/brand";
import type { SyncRun } from "../../shared/schemas";
import { fetchSyncRun, startSync } from "../api";
import { followedRunId, isActive, syncProgressLabel } from "../sync-view";
import { Button } from "@/components/ui/button";

const POLL_MS = 2000;

function announce(run: SyncRun) {
  const done = run.days.filter((d) => d.status === "complete").length;
  const summary = `${done}/${run.days.length} days`;
  const opts = { id: `sync-${run.id}` }; // several SyncControls may watch the same run
  if (run.status === "complete") toast.success(`Sync complete · ${summary}`, opts);
  else if (run.status === "partial") toast.warning(`Sync finished with gaps · ${summary}`, opts);
  else toast.error(`Sync failed${run.error ? `: ${run.error}` : ""}`, opts);
}

/** "Sync now" + live progress; follows a run started here or one already active (scheduled/other tab). */
export function SyncControl({ activeRun }: { activeRun: SyncRun | null }) {
  const qc = useQueryClient();
  // The run being followed: one started here or first seen active in meta. Kept until its finish is
  // observed, so a meta refresh that drops it from activeRun can't hide the finish.
  const [followed, setFollowed] = useState<SyncRunId | null>(null);
  const activeId = activeRun?.id ?? null;
  useEffect(() => setFollowed((f) => followedRunId(f, activeId)), [activeId]);
  const id = followedRunId(followed, activeId);

  // Disabling the button needs a render; a fast double click lands before it.
  const inFlight = useRef(false);
  const start = useMutation({
    mutationFn: () => startSync(),
    onSettled: () => { inFlight.current = false; },
    onSuccess: (run) => {
      qc.setQueryData(["sync", run.id], run);
      setFollowed(run.id);
    },
    onError: (e) => toast.error(`Couldn't start sync: ${e.message}`),
  });

  const run = useQuery({
    queryKey: ["sync", id],
    queryFn: () => fetchSyncRun(id!),
    enabled: id !== null,
    initialData: activeRun && activeRun.id === id ? activeRun : undefined,
    refetchInterval: (q) => (isActive(q.state.data ?? null) ? POLL_MS : false),
  });

  // Active → finished: refresh everything the run changed, once.
  const wasActive = useRef(false);
  useEffect(() => {
    const r = run.data ?? null;
    if (isActive(r)) wasActive.current = true;
    else if (r && wasActive.current) {
      wasActive.current = false;
      announce(r);
      setFollowed(null);
      for (const key of ["rfqs", "facets", "meta"]) qc.invalidateQueries({ queryKey: [key] });
    }
  }, [run.data, qc]);

  const busy = start.isPending || isActive(run.data ?? null);
  return (
    <div className="flex items-center gap-2">
      {busy && run.data && (
        <span className="text-muted-foreground text-sm tabular-nums" aria-live="polite">{syncProgressLabel(run.data)}</span>
      )}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => {
        if (inFlight.current) return;
        inFlight.current = true;
        start.mutate();
      }}>
        {busy ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
        Sync now
      </Button>
    </div>
  );
}
