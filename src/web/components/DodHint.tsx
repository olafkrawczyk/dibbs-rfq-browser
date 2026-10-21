import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const STORAGE_KEY = "dodHintDismissed";
const HINT_COPY =
  "DIBBS shows a DoD notice first (PDFs have their own, once per session) — click OK and you'll land on this RFQ";

const readDismissed = () => {
  try { return window.localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
};
const writeDismissed = () => {
  try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* storage blocked: hint stays per-session */ }
};

export const openInNewTab = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

const DodHintContext = createContext<(url: string) => void>(openInNewTab);

/** Opens a DIBBS url in a new tab; the first time, explains the DoD notice the user is about to see. */
export const useDodHint = () => useContext(DodHintContext);

export function DodHintProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<string | null>(null);
  // "Continue" hides the hint for the rest of this page session; "Don't show again" persists it.
  const seen = useRef(false);

  const open = useCallback((url: string) => {
    if (seen.current || readDismissed()) openInNewTab(url);
    else setPending(url);
  }, []);

  const proceed = (persist: boolean) => {
    if (persist) writeDismissed();
    seen.current = true;
    if (pending) openInNewTab(pending);
    setPending(null);
  };

  return (
    <DodHintContext.Provider value={open}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Opening DIBBS</DialogTitle>
            <DialogDescription>{HINT_COPY}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => proceed(true)}>Don't show again</Button>
            <Button autoFocus onClick={() => proceed(false)}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DodHintContext.Provider>
  );
}
