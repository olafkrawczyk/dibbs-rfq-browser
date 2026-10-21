import { expect, test } from "bun:test";
import { setBound } from "../../src/web/ranges";

test("setting a bound inside the range leaves the other bound", () => {
  expect(setBound({ lo: 10, hi: 50 }, "lo", 20)).toEqual({ lo: 20, hi: 50 });
});

test("a crossing value drags the other bound with it", () => {
  expect(setBound({ lo: 10, hi: 50 }, "lo", 80)).toEqual({ lo: 80, hi: 80 });
  expect(setBound({ lo: 10, hi: 50 }, "hi", 5)).toEqual({ lo: 5, hi: 5 });
  expect(setBound({ lo: "2026-10-20", hi: "2026-10-25" }, "hi", "2026-10-01")).toEqual({ lo: "2026-10-01", hi: "2026-10-01" });
});

test("clearing a bound or an open other side never drags", () => {
  expect(setBound({ lo: 10, hi: 50 }, "lo", undefined)).toEqual({ lo: undefined, hi: 50 });
  expect(setBound({ lo: undefined, hi: 50 }, "lo", 99)).toEqual({ lo: 99, hi: 99 });
  expect(setBound<number>({ lo: 10, hi: undefined }, "lo", 99)).toEqual({ lo: 99, hi: undefined });
});
