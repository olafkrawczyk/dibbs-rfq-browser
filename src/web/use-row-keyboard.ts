import { useEffect, useState } from "react";
import type { Rfq } from "../shared/schemas";
import { isTypingTarget } from "./dom";

const DOWN = new Set(["j", "ArrowDown"]);
const UP = new Set(["k", "ArrowUp"]);

/** Row focus movement; -1 means no row focused (or no rows). */
export function nextRowIndex(key: string, current: number, rowCount: number): number {
  if (rowCount === 0) return -1;
  const clamp = (i: number) => Math.min(Math.max(i, 0), rowCount - 1);
  if (current < 0) return DOWN.has(key) || UP.has(key) ? 0 : -1;
  if (DOWN.has(key)) return clamp(current + 1);
  if (UP.has(key)) return clamp(current - 1);
  return clamp(current);
}

/** j/k/arrows move focus, p opens the focused row's PDF, Enter opens it on DIBBS; ignored while typing. */
export function useRowKeyboard(rows: Rfq[], open: (url: string) => void): number {
  const [focused, setFocused] = useState(-1);

  // A new page of results starts unfocused.
  useEffect(() => setFocused(-1), [rows]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog]")) return;
      const row = rows[focused];
      if (e.key === "p" && row) {
        if (row.links.pdf) open(row.links.pdf);
        return;
      }
      // Enter on a focused button/link activates that control instead.
      if (e.key === "Enter" && row && !(e.target instanceof Element && e.target.closest("button, a"))) {
        e.preventDefault();
        open(row.links.dibbs);
        return;
      }
      if (!DOWN.has(e.key) && !UP.has(e.key)) return;
      e.preventDefault();
      const next = nextRowIndex(e.key, focused, rows.length);
      setFocused(next);
      document.querySelector(`[data-row-index="${next}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, focused, open]);

  return focused;
}
