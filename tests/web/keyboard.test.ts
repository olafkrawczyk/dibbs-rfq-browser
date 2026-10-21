import { expect, test } from "bun:test";
import { nextRowIndex } from "../../src/web/use-row-keyboard";

test("nextRowIndex moves with j/k and arrows, clamped", () => {
  expect(nextRowIndex("j", 0, 3)).toBe(1);
  expect(nextRowIndex("j", 2, 3)).toBe(2);
  expect(nextRowIndex("k", 0, 3)).toBe(0);
  expect(nextRowIndex("ArrowUp", 2, 3)).toBe(1);
  expect(nextRowIndex("ArrowDown", 0, 3)).toBe(1);
  expect(nextRowIndex("x", 1, 3)).toBe(1);
});

test("nextRowIndex from no focus (-1) lands on the first row", () => {
  expect(nextRowIndex("j", -1, 3)).toBe(0);
  expect(nextRowIndex("k", -1, 3)).toBe(0);
});

test("nextRowIndex clamps a stale index after the page shrank", () => {
  expect(nextRowIndex("x", 9, 3)).toBe(2);
  expect(nextRowIndex("j", 0, 0)).toBe(-1);
});
