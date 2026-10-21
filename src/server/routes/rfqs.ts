import type { SQL } from "bun";
import { getFacets, listRfqs } from "../../db/rfq-repo";
import { getWindowDates } from "../../db/sync-repo";
import { parseSearchParams } from "../../shared/search-params";
import { apiError, json, withErrors } from "../http";

const parse = (req: Request) => parseSearchParams(new URL(req.url).searchParams);

export const rfqRoutes = (sql: SQL) => ({
  "/api/rfqs": {
    GET: withErrors(async (req: Request) => {
      const p = parse(req);
      if (!p.ok) return apiError(400, "invalid_request", "Invalid query parameters", p.issues);
      return json(await listRfqs(sql, p.query, p.options, await getWindowDates(sql)));
    }),
  },
  "/api/rfqs/facets": {
    GET: withErrors(async (req: Request) => {
      const p = parse(req);
      if (!p.ok) return apiError(400, "invalid_request", "Invalid query parameters", p.issues);
      return json(await getFacets(sql, p.query, await getWindowDates(sql)));
    }),
  },
});
