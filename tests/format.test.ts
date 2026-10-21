import { expect, test } from "bun:test";
import { IsoDate, Nsn, SolicitationNumber } from "../src/shared/brand";
import { formatNsn, formatSolicitation } from "../src/shared/format";

test("formats NSN with dashes", () => {
  expect(formatNsn(Nsn.parse("8315016839267"))).toBe("8315-01-683-9267");
});

test("formats solicitation 6-2-1-4", () => {
  expect(formatSolicitation(SolicitationNumber.parse("SPE1C127Q0030"))).toBe("SPE1C1-27-Q-0030");
});

test("IsoDate rejects impossible dates", () => {
  expect(IsoDate.safeParse("2026-02-30").success).toBe(false);
  expect(IsoDate.safeParse("2026-10-20").success).toBe(true);
});
