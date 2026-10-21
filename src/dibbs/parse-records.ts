import * as cheerio from "cheerio";
import type { Cheerio, CheerioAPI } from "cheerio";
import type { Element } from "domhandler";
import type { IsoDate } from "../shared/brand";
import {
  normalizeSetAside, normalizeSolicitation, normalizeStatus, normalizeTechDocs,
  parseItemId, parseQuantity, parseUsDate, toItemName,
} from "../domain/normalize";
import { ScrapedRfq } from "./scraped";

export const DIBBS_BASE_URL = "https://www.dibbs.bsm.dla.mil";

export type InvalidRow = { index: number; reason: string; snippet: string };

export type RecordsPage = {
  totalRecords: number;
  currentPage: number;
  nextPage: number | null;
  rows: ScrapedRfq[];
  invalid: InvalidRow[];
};

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

const cell = (row: Cheerio<Element>, name: string) => row.find(`span[id$='_lbl${name}']`).first();

function readTotal($: CheerioAPI): number {
  const m = /([\d,]+)/.exec($("#ctl00_cph1_lblRecCount").text());
  return m ? Number(m[1]!.replace(/,/g, "")) : 0;
}

/** Pager: current page is a bare <span>, other pages are __doPostBack links with "Page$N". */
function readPager($: CheerioAPI): { currentPage: number; nextPage: number | null } {
  const grid = $("#ctl00_cph1_grdRfqSearch");
  const current = Number(grid.find("table td > span").first().text().trim()) || 1;
  const hasNext = grid
    .find("a[href*='__doPostBack']")
    .toArray()
    .some((a) => ($(a).attr("href") ?? "").includes(`'Page$${current + 1}'`));
  return { currentPage: current, nextPage: hasNext ? current + 1 : null };
}

/** Solicitation number is the first text node of the first link (before "--»Attachments"). */
function readSolicitation($: CheerioAPI, span: Cheerio<Element>): string {
  const link = span.find("a").first();
  const text = link.length ? link.contents().first().text() : span.text();
  return collapse(text).split(" ")[0] ?? "";
}

function readSetAsideAlt($: CheerioAPI, span: Cheerio<Element>): string | null {
  const img = span
    .find("img")
    .toArray()
    .find((el) => /set.?aside|unrestricted/i.test($(el).attr("alt") ?? ""));
  return img ? ($(img).attr("alt") ?? null) : null;
}

function readItemText(span: Cheerio<Element>): string {
  const link = span.find("a").first();
  return collapse(link.length ? link.text() : span.text().replace(/Mil-Spec/i, ""));
}

function buildRow($: CheerioAPI, row: Cheerio<Element>, postedDate: IsoDate): unknown {
  const solSpan = cell(row, "Solicitation");
  const docsSpan = cell(row, "TechnicalDocuments");
  const nsnSpan = cell(row, "Nsn");
  const prText = collapse(cell(row, "Pr").text());
  const nomenclature = collapse(cell(row, "Nomenclature").text());
  const item = parseItemId(readItemText(nsnSpan));
  const sol = normalizeSolicitation(readSolicitation($, solSpan));
  const setAside = normalizeSetAside(readSetAsideAlt($, solSpan));
  const status = normalizeStatus(cell(row, "Status").find("span").first().text() || cell(row, "Status").text());
  const pdfUrl = solSpan.find("a").toArray().map((a) => $(a).attr("href") ?? "").find((h) => /\.pdf$/i.test(h));
  const techDocsUrl = docsSpan.find("a").first().attr("href") ?? null;

  return {
    solicitationNumber: sol,
    nsn: item.kind === "nsn" ? item.nsn : null,
    partNumber: item.kind === "part" ? item.partNumber : null,
    fsc: item.kind === "nsn" ? item.fsc : null,
    nomenclature,
    itemName: toItemName(nomenclature),
    milSpec: /Mil-Spec/i.test(nsnSpan.text()),
    quantity: parseQuantity(prText),
    prNumber: prText.replace(/QTY:.*$/i, "").trim(),
    status: status.status,
    statusRaw: status.raw,
    setAside: setAside.setAside,
    setAsideRaw: setAside.raw,
    techDocs: normalizeTechDocs(techDocsUrl !== null, /Spec\/Stnd Only/i.test(docsSpan.text())),
    postedDate,
    issueDate: parseUsDate(cell(row, "Issued").text()),
    returnByDate: parseUsDate(cell(row, "ReturnBy").text()),
    dibbsUrl: `${DIBBS_BASE_URL}/RFQ/RFQRec.aspx?sn=${sol}`,
    pdfUrl: pdfUrl ?? null,
    techDocsUrl,
  };
}

/** DIBBS records page HTML → validated rows; rows that fail validation are reported, never dropped silently. */
export function parseRecordsPage(html: string, postedDate: IsoDate): RecordsPage {
  const $ = cheerio.load(html);
  const rows: ScrapedRfq[] = [];
  const invalid: InvalidRow[] = [];

  $("span[id$='_lblSolicitation']").each((index, el) => {
    const row = $(el).closest("tr");
    try {
      const parsed = ScrapedRfq.safeParse(buildRow($, row, postedDate));
      if (parsed.success) rows.push(parsed.data);
      else invalid.push({ index, reason: parsed.error.message, snippet: row.html()?.slice(0, 300) ?? "" });
    } catch (err) {
      invalid.push({ index, reason: String(err), snippet: row.html()?.slice(0, 300) ?? "" });
    }
  });

  return { totalRecords: readTotal($), ...readPager($), rows, invalid };
}
