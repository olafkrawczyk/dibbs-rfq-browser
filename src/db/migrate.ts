import type { SQL } from "bun";
import { join } from "node:path";
import { createSql } from "./sql";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

/** Applies pending migrations in file-name order, each in its own transaction. Returns applied names. */
export async function migrate(sql: SQL): Promise<string[]> {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r: { name: string }) => r.name));
  const files = [...new Bun.Glob("*.sql").scanSync(MIGRATIONS_DIR)].sort();
  const applied: string[] = [];
  for (const name of files) {
    if (done.has(name)) continue;
    const text = await Bun.file(join(MIGRATIONS_DIR, name)).text();
    await sql.begin(async (tx) => {
      await tx.unsafe(text);
      await tx`insert into schema_migrations (name) values (${name})`;
    });
    applied.push(name);
  }
  return applied;
}

if (import.meta.main) {
  const { getConfig } = await import("../config");
  const sql = createSql(getConfig().databaseUrl);
  const applied = await migrate(sql);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date");
  await sql.close();
}
