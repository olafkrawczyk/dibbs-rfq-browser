import type { SQL } from "bun";
import { enqueueRun, getActiveRun, getLatestFinishedRun, getRun } from "../../db/sync-repo";
import { SyncRunId } from "../../shared/brand";
import { apiError, json, withErrors } from "../http";

export const syncRoutes = (sql: SQL) => ({
  "/api/sync": {
    POST: withErrors(async () => json(await enqueueRun(sql, "manual"), 202)),
  },
  "/api/sync/latest": {
    GET: withErrors(async () => {
      const run = (await getActiveRun(sql)) ?? (await getLatestFinishedRun(sql));
      return run ? json(run) : apiError(404, "not_found", "No sync has run yet");
    }),
  },
  "/api/sync/:id": {
    GET: withErrors(async (req: Request & { params: { id: string } }) => {
      const run = await getRun(sql, SyncRunId.parse(req.params.id));
      return run ? json(run) : apiError(404, "not_found", `Sync run ${req.params.id} not found`);
    }),
  },
});
