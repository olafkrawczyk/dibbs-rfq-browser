import { describe, expect, test } from "bun:test";
import { IsoDate } from "../../src/shared/brand";
import {
  normalizeSetAside, normalizeSolicitation, normalizeStatus, normalizeTechDocs,
  parseItemId, parseQuantity, parseUsDate, toItemName, toUsDate,
} from "../../src/domain/normalize";

describe("parseItemId", () => {
  test("dashed NSN → nsn + fsc", () => {
    expect(parseItemId("8315-01-683-9267")).toEqual({ kind: "nsn", nsn: "8315016839267", fsc: "8315" } as never);
  });
  test("anything else → part number, whitespace collapsed", () => {
    expect(parseItemId(" MS 21042-3 ")).toEqual({ kind: "part", partNumber: "MS 21042-3" } as never);
    expect(parseItemId("MS   21042-3")).toEqual({ kind: "part", partNumber: "MS 21042-3" } as never);
  });
});

test("toItemName takes noun before first comma", () => {
  expect(toItemName("ARMY,  BUCKLE,  CLIPS,  E")).toBe("ARMY" as never);
  expect(toItemName("OXYGEN MASK RECEIVE")).toBe("OXYGEN MASK RECEIVE" as never);
  expect(toItemName("pad, electrode, defibril")).toBe("PAD" as never);
});

test("normalizeSetAside", () => {
  expect(normalizeSetAside("Small Business Set-Aside")).toEqual({ setAside: "small_business", raw: "Small Business Set-Aside" });
  expect(normalizeSetAside("Unrestricted/Not Set Aside").setAside).toBe("unrestricted");
  expect(normalizeSetAside("Service Disabled Veteran Owned Small Business (SDVosb) Set-Aside").setAside).toBe("sdvosb");
  expect(normalizeSetAside("Woman Owned Small Business (WOSB) Set-Aside").setAside).toBe("wosb");
  expect(normalizeSetAside("HUBZone Set-Aside").setAside).toBe("hubzone");
  expect(normalizeSetAside("8(a) Set-Aside").setAside).toBe("8a");
  expect(normalizeSetAside("Some Future Set-Aside")).toEqual({ setAside: "other", raw: "Some Future Set-Aside" });
  expect(normalizeSetAside(null)).toEqual({ setAside: "other", raw: null });
});

test("normalizeStatus", () => {
  expect(normalizeStatus("Removed").status).toBe("removed");
  expect(normalizeStatus(" Open ")).toEqual({ status: "open", raw: "Open" });
  expect(normalizeStatus("Cancelled").status).toBe("cancelled");
  expect(normalizeStatus("Something New")).toEqual({ status: "other", raw: "Something New" });
});

test("normalizeTechDocs", () => {
  expect(normalizeTechDocs(true, true)).toBe("spec_only");
  expect(normalizeTechDocs(true, false)).toBe("available");
  expect(normalizeTechDocs(false, false)).toBe("none");
});

test("US dates ⇄ ISO", () => {
  expect(parseUsDate("10-20-2026")).toBe("2026-10-20" as never);
  expect(parseUsDate("13-40-2026")).toBeNull();
  expect(parseUsDate("")).toBeNull();
  expect(toUsDate(IsoDate.parse("2026-10-20"))).toBe("10-20-2026");
});

test("normalizeSolicitation strips dashes", () => {
  expect(normalizeSolicitation("SPE1C1-27-Q-0030")).toBe("SPE1C127Q0030" as never);
});

test("parseQuantity", () => {
  expect(parseQuantity("7018560662 QTY: 57,000")).toBe(57000);
  expect(parseQuantity("QTY: 1500")).toBe(1500);
  expect(parseQuantity("7018560662")).toBeNull();
});
