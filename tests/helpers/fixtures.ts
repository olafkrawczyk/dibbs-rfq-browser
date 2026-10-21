import { readFileSync } from "node:fs";
import { join } from "node:path";

export const fixture = (name: string): string =>
  readFileSync(join(import.meta.dir, "..", "fixtures", name), "utf8");
