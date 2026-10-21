import type { SQL } from "bun";
import type { Config } from "../../config";
import { getDataAsOf, getFscNames } from "../../db/rfq-repo";
import { getActiveRun, getLatestFinishedRun, getWindowDates } from "../../db/sync-repo";
import type { Meta } from "../../shared/schemas";
import { json, withErrors } from "../http";

export const metaRoutes = (sql: SQL, config: Config) => ({
  "/api/meta": {
    GET: withErrors(async () => {
      const [windowDates, dataAsOf, lastRun, activeRun, fscNames] = await Promise.all([
        getWindowDates(sql), getDataAsOf(sql), getLatestFinishedRun(sql), getActiveRun(sql), getFscNames(sql),
      ]);
      const meta: Meta = { windowDays: config.syncWindowDays, windowDates, dataAsOf, lastRun, activeRun, fscNames };
      return json(meta);
    }),
  },
});
