import { describe, expect, test } from "bun:test";
import { createDibbsHttp } from "../../src/dibbs/http";
import { createDibbsClient, DayFetchError } from "../../src/dibbs/client";
import { IsoDate } from "../../src/shared/brand";
import type { RecordsPage } from "../../src/dibbs/parse-records";
import { fixture } from "../helpers/fixtures";
import { asLastPage2, fakeFetch, html, redirect } from "../helpers/fake-fetch";

const BASE = "https://www.dibbs.bsm.dla.mil";
const DAY = IsoDate.parse("2026-10-20");
const DAY_URL = `${BASE}/RFQ/RfqRecs.aspx?category=post&TypeSrch=dt&Value=10-20-2026`;
const P1 = fixture("records-post-p1.html");
const P2 = asLastPage2(P1);
const CONSENT = fixture("consent.html");

const setup = (handler: Parameters<typeof fakeFetch>[0]) => {
  const fake = fakeFetch(handler);
  const sleeps: number[] = [];
  const http = createDibbsHttp({ fetch: fake.fetch, delayMs: 0, sleep: async (ms) => void sleeps.push(ms) });
  return { ...fake, sleeps, http, client: createDibbsClient(http) };
};

describe("http", () => {
  test("accepts consent then returns target page", async () => {
    const { http, calls } = setup((req) => {
      if (req.method === "POST") return redirect(DAY_URL, { "set-cookie": "dw=ok; path=/" });
      return req.cookie.includes("dw=ok") ? html(P1) : html(CONSENT, { "set-cookie": "SessionId=abc; path=/" });
    });
    const page = await http.get(DAY_URL);
    expect(page.reconsented).toBe(true);
    expect(page.html).toContain("lblRecCount");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toContain("butAgree=OK");
    expect(post.cookie).toContain("SessionId=abc");
  });

  test("retries 5xx 3 times then throws", async () => {
    const { http, calls, sleeps } = setup(() => new Response("down", { status: 503 }));
    await expect(http.get(DAY_URL)).rejects.toThrow(/503/);
    expect(calls.length).toBe(4);
    expect(sleeps).toEqual([1000, 2000, 4000]);
  });
});

describe("client.fetchDay", () => {
  const collect = () => {
    const pages: number[] = [];
    return { pages, onPage: async (p: RecordsPage) => void pages.push(p.currentPage) };
  };

  test("follows postback paging until no next page", async () => {
    const { client, calls } = setup((req) => html(req.method === "POST" ? P2 : P1));
    const { pages, onPage } = collect();
    const result = await client.fetchDay(DAY, onPage);
    expect(pages).toEqual([1, 2]);
    expect(result).toEqual({ expected: 2148, parsed: 100, invalid: 0, pages: 2 });
    expect(calls[0]!.url).toBe(DAY_URL);
    expect(calls[1]!.body).toContain("__EVENTARGUMENT=Page%242");
  });

  test("restarts day after reconsent", async () => {
    let postbacks = 0;
    const { client } = setup((req) => {
      if (req.method === "POST" && req.url.includes("dodwarning")) return redirect(DAY_URL);
      if (req.method === "POST") return html(++postbacks === 1 ? CONSENT : P2);
      return html(P1);
    });
    const { pages, onPage } = collect();
    await client.fetchDay(DAY, onPage);
    expect(pages).toEqual([1, 1, 2]);
  });

  test("gives up after 2 restarts", async () => {
    const { client } = setup((req) => {
      if (req.method === "POST" && req.url.includes("dodwarning")) return redirect(DAY_URL);
      return html(req.method === "POST" ? CONSENT : P1);
    });
    const { onPage } = collect();
    await expect(client.fetchDay(DAY, onPage)).rejects.toThrow(DayFetchError);
  });

  test("paging mismatch is an error", async () => {
    const { client } = setup(() => html(P1));
    const { onPage } = collect();
    await expect(client.fetchDay(DAY, onPage)).rejects.toThrow(/paging mismatch/);
  });
});

test("listPostingDates and fetchFscNames", async () => {
  const { client } = setup((req) =>
    html(req.url.includes("RfqDates") ? fixture("dates-recent.html") : fixture("fsc.html")));
  expect((await client.listPostingDates())[0]).toBe("2026-10-20" as never);
  expect((await client.fetchFscNames()).length).toBeGreaterThan(500);
});
