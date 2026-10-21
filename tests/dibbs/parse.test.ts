import { describe, expect, test } from "bun:test";
import { IsoDate } from "../../src/shared/brand";
import { parseRecordsPage } from "../../src/dibbs/parse-records";
import { parseRecentDates } from "../../src/dibbs/parse-dates";
import { parseFscNames } from "../../src/dibbs/parse-fsc";
import { fixture } from "../helpers/fixtures";

const DAY = IsoDate.parse("2026-10-20");

describe("parseRecordsPage", () => {
  const issue = parseRecordsPage(fixture("records-issue-p1.html"), DAY);

  test("reads totals and pager", () => {
    expect(issue.totalRecords).toBe(1160);
    expect(issue.currentPage).toBe(1);
    expect(issue.nextPage).toBe(2);
  });

  test("parses every row without invalid ones", () => {
    expect(issue.invalid).toEqual([]);
    expect(issue.rows.length).toBe(50);
  });

  test("open small-business row with spec-only docs", () => {
    expect(issue.rows[0]).toMatchObject({
      solicitationNumber: "SPE1C127Q0030", nsn: "8315016839267", partNumber: null, fsc: "8315",
      nomenclature: "ARMY, BUCKLE, CLIPS, E", itemName: "ARMY", milSpec: true,
      quantity: 57000, prNumber: "7018560662", status: "open", setAside: "small_business",
      techDocs: "spec_only", postedDate: "2026-10-20", issueDate: "2026-10-20", returnByDate: "2026-11-20",
      pdfUrl: null, dibbsUrl: "https://www.dibbs.bsm.dla.mil/RFQ/RFQRec.aspx?sn=SPE1C127Q0030",
    });
    expect(issue.rows[0]!.techDocsUrl).toContain("tdmt.dla.mil");
  });

  test("removed unrestricted row with PDF", () => {
    expect(issue.rows[1]).toMatchObject({
      solicitationNumber: "SPE1C127Q0088", status: "removed", setAside: "unrestricted",
      techDocs: "none", quantity: 1500, milSpec: false, techDocsUrl: null,
      pdfUrl: "https://dibbs2.bsm.dla.mil/Downloads/RFQ/8/SPE1C127Q0088.PDF",
    });
  });

  test("post page: all rows stamped with posted date, some PDFs, other set-asides", () => {
    const post = parseRecordsPage(fixture("records-post-p1.html"), DAY);
    expect(post.totalRecords).toBe(2148);
    expect(post.invalid).toEqual([]);
    expect(post.rows.length).toBe(50);
    expect(post.rows.every((r) => r.postedDate === "2026-10-20")).toBe(true);
    expect(post.rows.some((r) => r.pdfUrl)).toBe(true);
    expect(post.rows.filter((r) => r.setAside === "sdvosb").length).toBe(6);
    expect(post.rows.filter((r) => r.setAside === "wosb").length).toBe(1);
  });

  test("row without a PR number is kept", () => {
    const html = fixture("records-issue-p1.html").replace(/>7018560662<br \/>QTY: 57000</, ">QTY: 57000<");
    const page = parseRecordsPage(html, DAY);
    expect(page.invalid).toEqual([]);
    expect(page.rows[0]).toMatchObject({ prNumber: "", quantity: 57000 });
  });

  test("empty html → nothing", () => {
    expect(parseRecordsPage("<html></html>", DAY)).toMatchObject({
      totalRecords: 0, currentPage: 1, nextPage: null, rows: [], invalid: [],
    });
  });
});

test("parseRecentDates: newest first, deduped", () => {
  const dates = parseRecentDates(fixture("dates-recent.html"));
  expect(dates.length).toBe(24);
  expect(new Set(dates).size).toBe(dates.length);
  expect([...dates].sort().reverse()).toEqual(dates);
  expect(dates).toContain("2026-10-20" as never);
});

test("parseFscNames", () => {
  const names = parseFscNames(fixture("fsc.html"));
  expect(names).toContainEqual({ code: "8315", name: "Notions and Apparel Findings" } as never);
  expect(names).toContainEqual({ code: "8020", name: "Paint and Artists' Brushes" } as never);
  expect(new Set(names.map((n) => n.code)).size).toBe(names.length);
  expect(parseFscNames("<html></html>")).toEqual([]);
});
