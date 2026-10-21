import { expect, test } from "bun:test";
import { SyncRunId } from "../../src/shared/brand";
import { followedRunId } from "../../src/web/sync-view";

const id = (n: number) => SyncRunId.parse(n);

test("a run seen once stays followed after meta stops listing it as active", () => {
  expect(followedRunId(null, id(4))).toBe(id(4));
  expect(followedRunId(id(4), null)).toBe(id(4));
  expect(followedRunId(id(4), id(5))).toBe(id(4));
  expect(followedRunId(null, null)).toBeNull();
});
