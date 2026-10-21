import { expect, test } from "bun:test";
import { dayStatus, runStatus } from "../../src/worker/sync-status";
import type { SyncDay } from "../../src/shared/schemas";

test("dayStatus", () => {
  expect(dayStatus({ expected: 100, parsed: 100, invalid: 0 })).toBe("complete");
  expect(dayStatus({ expected: 100, parsed: 98, invalid: 2 })).toBe("partial");
  expect(dayStatus({ expected: 100, parsed: 99, invalid: 0 })).toBe("partial");
  expect(dayStatus({ expected: 100, parsed: 0, invalid: 0 })).toBe("failed");
  expect(dayStatus({ expected: 0, parsed: 0, invalid: 0 })).toBe("complete");
  expect(dayStatus({ expected: 2148, parsed: 100, invalid: 0, truncated: true })).toBe("complete");
  expect(dayStatus({ expected: 2148, parsed: 99, invalid: 1, truncated: true })).toBe("partial");
});

const d = (status: SyncDay["status"]) => ({ status }) as SyncDay;

test("runStatus", () => {
  expect(runStatus([d("complete"), d("complete")])).toBe("complete");
  expect(runStatus([d("complete"), d("failed")])).toBe("partial");
  expect(runStatus([d("partial")])).toBe("partial");
  expect(runStatus([d("failed"), d("failed")])).toBe("failed");
  expect(runStatus([])).toBe("failed");
});
