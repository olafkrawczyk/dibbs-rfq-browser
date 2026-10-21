import type { Fsc, IsoDate } from "../shared/brand";
import { toUsDate } from "../domain/normalize";
import type { DibbsHttp } from "./http";
import { pageRequestBody } from "./form";
import { DIBBS_BASE_URL, parseRecordsPage, type RecordsPage } from "./parse-records";
import { parseRecentDates } from "./parse-dates";
import { parseFscNames } from "./parse-fsc";

export type DayFetchResult = { expected: number; parsed: number; invalid: number; pages: number };

export type DibbsClient = {
  listPostingDates(): Promise<IsoDate[]>;
  fetchDay(date: IsoDate, onPage: (page: RecordsPage) => Promise<void>): Promise<DayFetchResult>;
  fetchFscNames(): Promise<{ code: Fsc; name: string }[]>;
};

export class DayFetchError extends Error {
  override name = "DayFetchError";
}

const MAX_DAY_RESTARTS = 2;

class SessionLost extends Error {}

export const dayUrl = (date: IsoDate, base = DIBBS_BASE_URL) =>
  `${base}/RFQ/RfqRecs.aspx?category=post&TypeSrch=dt&Value=${toUsDate(date)}`;

export function createDibbsClient(http: DibbsHttp, base = DIBBS_BASE_URL): DibbsClient {
  /** One pass over a day's pages; throws SessionLost when a postback had to re-consent. */
  async function fetchDayOnce(date: IsoDate, onPage: (p: RecordsPage) => Promise<void>): Promise<DayFetchResult> {
    const url = dayUrl(date, base);
    let current = await http.get(url);
    let page = parseRecordsPage(current.html, date);
    const result: DayFetchResult = { expected: page.totalRecords, parsed: 0, invalid: 0, pages: 0 };

    for (let requested = 1; ; requested++) {
      if (page.currentPage !== requested) {
        throw new DayFetchError(`paging mismatch on ${date}: asked for page ${requested}, got ${page.currentPage}`);
      }
      await onPage(page);
      result.parsed += page.rows.length;
      result.invalid += page.invalid.length;
      result.pages = requested;
      if (page.nextPage === null) return result;

      current = await http.post(url, pageRequestBody(current.html, page.nextPage));
      if (current.reconsented) throw new SessionLost();
      page = parseRecordsPage(current.html, date);
    }
  }

  return {
    async listPostingDates() {
      const page = await http.get(`${base}/RFQ/RfqDates.aspx?category=recent`);
      return parseRecentDates(page.html);
    },

    async fetchDay(date, onPage) {
      for (let attempt = 0; attempt <= MAX_DAY_RESTARTS; attempt++) {
        try {
          return await fetchDayOnce(date, onPage);
        } catch (err) {
          if (!(err instanceof SessionLost)) throw err;
        }
      }
      throw new DayFetchError(`session lost on ${date} after ${MAX_DAY_RESTARTS} restarts`);
    },

    async fetchFscNames() {
      const page = await http.get(`${base}/Rfq/RfqFsc.aspx`);
      return parseFscNames(page.html);
    },
  };
}
