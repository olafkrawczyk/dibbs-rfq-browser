import { SQL } from "bun";

export function createSql(url: string): SQL {
  return new SQL(url, { max: 10 });
}
