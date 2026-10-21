import { expect, test } from "bun:test";
import { withSelected } from "../../src/web/facet-options";

test("selected values missing from the facet are kept with count 0", () => {
  expect(withSelected([{ value: "a", count: 5 }], ["b", "a"])).toEqual([
    { value: "a", count: 5 }, { value: "b", count: 0 },
  ]);
});

test("no selection returns buckets unchanged", () => {
  const buckets = [{ value: "a", count: 1 }];
  expect(withSelected(buckets, [])).toBe(buckets);
});
