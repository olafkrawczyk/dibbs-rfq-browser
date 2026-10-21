import * as cheerio from "cheerio";
import { Fsc } from "../shared/brand";

/** FSC search page → { code, name } from its `<option value="8315*">8315 - Name</option>` list. */
export function parseFscNames(html: string): { code: Fsc; name: string }[] {
  const $ = cheerio.load(html);
  const byCode = new Map<string, string>();
  $("option").each((_, el) => {
    const m = /^(\d{4})\s+-\s+(.+)$/.exec($(el).text().trim());
    if (m && !byCode.has(m[1]!)) byCode.set(m[1]!, m[2]!.trim());
  });
  return [...byCode].map(([code, name]) => ({ code: Fsc.parse(code), name }));
}
