import { expect, test } from "bun:test";
import { DEFAULT_QUERY, RfqQuery } from "../../src/shared/schemas";
import { activeChips } from "../../src/web/chips";

const q = (raw: Record<string, unknown>) => RfqQuery.parse(raw);

test("default query has no chips", () => {
  expect(activeChips(DEFAULT_QUERY)).toEqual([]);
});

test("one chip per active filter with a reset patch", () => {
  const chips = activeChips(q({ q: "pad", setAside: ["sdvosb", "wosb"], fsc: ["8315"], qtyMin: 100, techDocs: "available" }));
  expect(chips.map((c) => c.label)).toEqual([
    "“pad”", "Set-aside: SDVOSB, WOSB", "FSC: 8315", "Qty ≥ 100", "Tech docs: Available",
  ]);
  expect(chips[1]!.reset).toEqual({ setAside: [] });
  expect(chips[3]!.reset).toEqual({ qtyMin: undefined, qtyMax: undefined });
});

test("status chip appears when it differs from the open default, and resets to it", () => {
  const [chip] = activeChips(q({ status: ["open", "awarded"] }));
  expect(chip).toEqual({ key: "status", label: "Status: Open, Awarded", reset: { status: ["open"] } });
  expect(activeChips(q({ status: [] }))[0]!.label).toBe("Status: any");
});

test("closes-within, explicit return-by range and qty range", () => {
  expect(activeChips(q({ closesWithinDays: 7 }))[0]!.label).toBe("Closes within 7d");
  expect(activeChips(q({ returnByFrom: "2026-10-20", returnByTo: "2026-10-30" }))[0]).toEqual({
    key: "returnBy", label: "Return by 2026-10-20 – 2026-10-30", reset: { returnByFrom: undefined, returnByTo: undefined },
  });
  expect(activeChips(q({ qtyMin: 10, qtyMax: 500 }))[0]!.label).toBe("Qty 10–500");
  expect(activeChips(q({ qtyMax: 500 }))[0]!.label).toBe("Qty ≤ 500");
});
