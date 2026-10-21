import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ListOptions, RfqQuery } from "../shared/schemas";
import { nextUrlState, readUrlState, toSearch, type UrlState } from "./url-state";

const INVALID_TOAST = "Some filters in the link were invalid and were reset";

function readLocation(): UrlState {
  const s = readUrlState(window.location.search);
  if (s.invalid) {
    window.history.replaceState(null, "", window.location.pathname + toSearch(s));
    // Deferred so the Toaster is mounted on first load.
    setTimeout(() => toast.warning(INVALID_TOAST, { id: "invalid-url" }), 0);
  }
  return { query: s.query, options: s.options };
}

/** All filter, sort and paging state lives in the URL (shareable; back/forward work). */
export function useUrlState() {
  const [state, setState] = useState<UrlState>(readLocation);
  const current = useRef(state);
  current.current = state;

  useEffect(() => {
    const onPop = () => setState(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const set = useCallback((next: Partial<RfqQuery>, opts?: Partial<ListOptions>) => {
    const updated = nextUrlState(current.current, next, opts);
    const search = toSearch(updated);
    if (search !== window.location.search) window.history.pushState(null, "", window.location.pathname + search);
    current.current = updated;
    setState(updated);
  }, []);

  return { query: state.query, options: state.options, set };
}
