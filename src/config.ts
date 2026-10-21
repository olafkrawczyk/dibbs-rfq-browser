import { z } from "zod";

const intVar = (def: number, min: number, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).default(def);

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SYNC_WINDOW_DAYS: intVar(7, 1, 60),
  SYNC_INTERVAL_MINUTES: intVar(60, 1),
  DIBBS_REQUEST_DELAY_MS: intVar(1000, 0),
  SYNC_STALE_AFTER_MINUTES: intVar(30, 1),
  PORT: intVar(3000, 1, 65535),
  SYNC_MAX_PAGES_PER_DAY: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).optional()),
});

export type Config = {
  databaseUrl: string;
  syncWindowDays: number;
  syncIntervalMinutes: number;
  dibbsRequestDelayMs: number;
  syncStaleAfterMinutes: number;
  port: number;
  /** Dev/demo cap on pages fetched per posting day; null = all pages. */
  syncMaxPagesPerDay: number | null;
};

export function loadConfig(env: Record<string, string | undefined>): Config {
  const e = EnvSchema.parse(env);
  return {
    databaseUrl: e.DATABASE_URL,
    syncWindowDays: e.SYNC_WINDOW_DAYS,
    syncIntervalMinutes: e.SYNC_INTERVAL_MINUTES,
    dibbsRequestDelayMs: e.DIBBS_REQUEST_DELAY_MS,
    syncStaleAfterMinutes: e.SYNC_STALE_AFTER_MINUTES,
    port: e.PORT,
    syncMaxPagesPerDay: e.SYNC_MAX_PAGES_PER_DAY ?? null,
  };
}

/** Loads config from process.env; exits the process with a readable message on error. */
export function getConfig(): Config {
  try {
    return loadConfig(process.env);
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error(`Invalid configuration:\n${z.prettifyError(err)}`);
      process.exit(1);
    }
    throw err;
  }
}
