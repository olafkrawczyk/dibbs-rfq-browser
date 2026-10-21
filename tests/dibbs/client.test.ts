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
    expect(result).toEqual({ expected: 2148, parsed: 100, invalid: 0, pages: 2, truncated: false });
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

test("re-requests the original URL when consent redirects elsewhere", async () => {
  const { http } = setup((req) => {
    if (req.method === "POST") return redirect(`${BASE}//rfq/rfqrecs.aspx?category=post`, { "set-cookie": "dw=ok" });
    if (!req.cookie.includes("dw=ok")) return html(CONSENT);
    return html(req.url === DAY_URL ? P1 : "<html>empty listing</html>");
  });
  const page = await http.get(DAY_URL);
  expect(page.html).toContain("lblRecCount");
  expect(page.reconsented).toBe(true);
});

test("maxPages stops early and marks the day truncated", async () => {
  const fake = fakeFetch((req) => html(req.method === "POST" ? P2.replace(/Page\$X&#39;/g, "Page$3&#39;") : P1));
  const http = createDibbsHttp({ fetch: fake.fetch, delayMs: 0, sleep: async () => {} });
  const client = createDibbsClient(http, { maxPages: 2 });
  const pages: number[] = [];
  const result = await client.fetchDay(DAY, async (p) => void pages.push(p.currentPage));
  expect(pages).toEqual([1, 2]);
  expect(result).toEqual({ expected: 2148, parsed: 100, invalid: 0, pages: 2, truncated: true });
});

test("non-listing page fails the day instead of completing it empty", async () => {
  const { client } = setup(() => html(fixture("fsc.html")));
  await expect(client.fetchDay(DAY, async () => {})).rejects.toThrow(/not a records page/);
});

test("consent that keeps coming back is an error", async () => {
  const { http } = setup((req) => {
    if (req.method === "POST") return redirect(`${BASE}//rfq/landing`);
    return html(req.url.endsWith("landing") ? "<html>landing</html>" : CONSENT); // re-GET is still the wall
  });
  await expect(http.get(DAY_URL)).rejects.toThrow(/consent was not accepted/);
});

test("a request that never finishes times out and goes through retries", async () => {
  let calls = 0;
  const hanging = (_url: string, init?: RequestInit) => {
    calls++;
    return new Promise<Response>((_, reject) =>
      init?.signal?.addEventListener("abort", () => reject(new Error("request timed out"))));
  };
  const http = createDibbsHttp({ fetch: hanging, delayMs: 0, sleep: async () => {}, timeoutMs: 20 });
  await expect(http.get(DAY_URL)).rejects.toThrow(/timed out|abort/i);
  expect(calls).toBe(4);
});
