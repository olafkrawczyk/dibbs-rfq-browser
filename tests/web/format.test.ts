import { expect, test } from "bun:test";
import { IsoDate } from "../../src/shared/brand";
import { formatQty, returnByLabel, todayIso } from "../../src/web/format";

const T = IsoDate.parse("2026-10-21");

test("returnByLabel: future, urgent window, today, past", () => {
  expect(returnByLabel(IsoDate.parse("2026-10-26"), T)).toEqual({ text: "in 5d", urgent: false });
  expect(returnByLabel(IsoDate.parse("2026-10-23"), T)).toEqual({ text: "in 2d", urgent: true });
  expect(returnByLabel(T, T)).toEqual({ text: "today", urgent: true });
  expect(returnByLabel(IsoDate.parse("2026-10-19"), T)).toEqual({ text: "2d ago", urgent: false });
});

test("returnByLabel: missing date", () => {
  expect(returnByLabel(null, T)).toEqual({ text: "—", urgent: false });
});

test("formatQty uses thousands separators and dash for null", () => {
  expect(formatQty(57000)).toBe("57,000");
  expect(formatQty(null)).toBe("—");
});

test("todayIso uses the local calendar date", () => {
  expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe(IsoDate.parse("2026-01-05"));
});
