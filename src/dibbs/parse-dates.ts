import * as cheerio from "cheerio";
import type { IsoDate } from "../shared/brand";
import { parseUsDate } from "../domain/normalize";

/** Recent RFQ dates page → posting dates, newest first. */
export function parseRecentDates(html: string): IsoDate[] {
  const $ = cheerio.load(html);
  const dates = new Set<IsoDate>();
  $("a[href*='RfqRecs.aspx']").each((_, el) => {
    const value = /[?&]Value=([\d-]+)/i.exec($(el).attr("href") ?? "")?.[1];
    const date = value ? parseUsDate(value) : null;
    if (date) dates.add(date);
  });
  return [...dates].sort().reverse();
}
