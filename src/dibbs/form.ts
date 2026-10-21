import * as cheerio from "cheerio";

export const GRID_EVENT_TARGET = "ctl00$cph1$grdRfqSearch";

export function isConsentPage(html: string): boolean {
  return cheerio.load(html)("#butAgree").length > 0;
}

export function extractHiddenFields(html: string): Record<string, string> {
  const $ = cheerio.load(html);
  const fields: Record<string, string> = {};
  $("input[type=hidden][name]").each((_, el) => {
    fields[$(el).attr("name")!] = $(el).attr("value") ?? "";
  });
  return fields;
}

/** The POST that accepts the DoD notice: all hidden fields + butAgree=OK, sent to the form action. */
export function consentRequest(html: string, pageUrl: string): { url: string; body: URLSearchParams } {
  const action = cheerio.load(html)("form").first().attr("action") ?? pageUrl;
  const body = new URLSearchParams(extractHiddenFields(html));
  body.set("butAgree", "OK");
  return { url: new URL(action, pageUrl).toString(), body };
}

/** ASP.NET GridView paging postback for `page`, built from the current page's hidden fields. */
export function pageRequestBody(html: string, page: number): URLSearchParams {
  const body = new URLSearchParams(extractHiddenFields(html));
  body.set("__EVENTTARGET", GRID_EVENT_TARGET);
  body.set("__EVENTARGUMENT", `Page$${page}`);
  return body;
}
