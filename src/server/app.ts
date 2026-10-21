import type { HTMLBundle, SQL } from "bun";
import type { Config } from "../config";
import { apiError } from "./http";
import { metaRoutes } from "./routes/meta";
import { rfqRoutes } from "./routes/rfqs";
import { syncRoutes } from "./routes/sync";

type Deps = { sql: SQL; config: Config; port?: number; index?: HTMLBundle; development?: boolean };

export function createServer({ sql, config, port = config.port, index, development = false }: Deps) {
  return Bun.serve({
    port,
    routes: {
      ...rfqRoutes(sql),
      ...syncRoutes(sql),
      ...metaRoutes(sql, config),
      "/api/*": () => apiError(404, "not_found", "Unknown API route"),
      "/*": index ?? (() => new Response("Not found", { status: 404 })),
    },
    development: development ? { hmr: true, console: true } : false,
  });
}
