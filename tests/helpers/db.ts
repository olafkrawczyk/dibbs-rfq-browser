import { SQL } from "bun";
import { migrate } from "../../src/db/migrate";

let shared: SQL | null = null;

/** Empty, fully migrated test database (TEST_DATABASE_URL). */
export async function freshDb(): Promise<SQL> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (see .env.example)");
  shared ??= new SQL(url, { max: 4 });
  await shared.unsafe("drop schema public cascade; create schema public;");
  await migrate(shared);
  return shared;
}
