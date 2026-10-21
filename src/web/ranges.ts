export type Range<T> = { lo?: T; hi?: T };

/** Set one end of an inclusive range; a value that crosses the other end moves it too, so lo ≤ hi always holds. */
export function setBound<T extends number | string>(r: Range<T>, side: "lo" | "hi", v: T | undefined): Range<T> {
  const next = { ...r, [side]: v };
  if (v === undefined || next.lo === undefined || next.hi === undefined || next.lo <= next.hi) return next;
  return { lo: v, hi: v };
}
