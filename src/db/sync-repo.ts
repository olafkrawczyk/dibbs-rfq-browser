import type { SQL } from "bun";
import type { IsoDate, SyncRunId } from "../shared/brand";
import { SyncRun, type FinishedRunStatus, type SyncDay } from "../shared/schemas";

const RUN_COLUMNS = `id::int as id, trigger, status, requested_at, started_at, finished_at,
  to_json(window_dates) as window_dates, days, error`;

type RunRow = {
  id: number; trigger: string; status: string; requested_at: Date; started_at: Date | null;
  finished_at: Date | null; window_dates: string[]; days: unknown; error: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toRun(row: RunRow): SyncRun {
  return SyncRun.parse({
    id: row.id, trigger: row.trigger, status: row.status, requestedAt: row.requested_at.toISOString(),
    startedAt: iso(row.started_at), finishedAt: iso(row.finished_at), windowDates: row.window_dates,
    days: row.days, error: row.error,
  });
}

const first = (rows: RunRow[]) => (rows[0] ? toRun(rows[0]) : null);
const json = (v: unknown) => JSON.stringify(v);

/** Queue a run; if one is already queued/running, return it (the partial unique index makes this race-free). */
export async function enqueueRun(sql: SQL, trigger: "scheduled" | "manual"): Promise<SyncRun> {
  await sql`
    insert into sync_runs (trigger, status) values (${trigger}, 'queued')
    on conflict ((true)) where status in ('queued', 'running') do nothing`;
  const active = await getActiveRun(sql);
  if (!active) throw new Error("enqueueRun: no active run after insert");
  return active;
}

export async function claimNextRun(sql: SQL): Promise<SyncRun | null> {
  return first(await sql.unsafe(`
    update sync_runs set status = 'running', started_at = now()
    where id = (select id from sync_runs where status = 'queued' order by id for update skip locked limit 1)
    returning ${RUN_COLUMNS}`));
}

export async function setWindow(sql: SQL, id: SyncRunId, dates: IsoDate[], days: SyncDay[]): Promise<void> {
  await sql`
    update sync_runs set
      window_dates = array(select jsonb_array_elements_text(${json(dates)}::text::jsonb)::date),
      days = ${json(days)}::text::jsonb
    where id = ${id}`;
}

export async function saveDays(sql: SQL, id: SyncRunId, days: SyncDay[]): Promise<void> {
  await sql`update sync_runs set days = ${json(days)}::text::jsonb where id = ${id}`;
}

export async function finishRun(sql: SQL, id: SyncRunId, status: FinishedRunStatus, error?: string): Promise<void> {
  await sql`update sync_runs set status = ${status}, finished_at = now(), error = ${error ?? null} where id = ${id}`;
}

export async function reapStaleRuns(sql: SQL, staleAfterMinutes: number): Promise<number> {
  const rows = await sql`
    update sync_runs set status = 'failed', finished_at = now(), error = 'worker stopped'
    where status = 'running' and started_at < now() - make_interval(mins => ${staleAfterMinutes}::int)
    returning id`;
  return rows.length;
}

export async function getRun(sql: SQL, id: SyncRunId): Promise<SyncRun | null> {
  return first(await sql.unsafe(`select ${RUN_COLUMNS} from sync_runs where id = $1`, [id]));
}

export async function getActiveRun(sql: SQL): Promise<SyncRun | null> {
  return first(await sql.unsafe(
    `select ${RUN_COLUMNS} from sync_runs where status in ('queued', 'running') order by id desc limit 1`));
}

export async function getLatestFinishedRun(sql: SQL): Promise<SyncRun | null> {
  return first(await sql.unsafe(
    `select ${RUN_COLUMNS} from sync_runs where status in ('complete', 'partial', 'failed') order by id desc limit 1`));
}

/** The window shown by default: dates of the latest run that produced data (complete or partial). */
export async function getWindowDates(sql: SQL): Promise<IsoDate[]> {
  const rows: { dates: IsoDate[] }[] = await sql`
    select to_json(window_dates) as dates from sync_runs
    where status in ('complete', 'partial') order by id desc limit 1`;
  return rows[0]?.dates ?? [];
}
