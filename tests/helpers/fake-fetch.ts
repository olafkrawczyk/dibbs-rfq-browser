import type { FetchLike } from "../../src/dibbs/http";

export type FakeRequest = { method: string; url: string; body: string; cookie: string };
export type FakeHandler = (req: FakeRequest, n: number) => Response;

/** A fetch stand-in that records every request and answers via `handler`. */
export function fakeFetch(handler: FakeHandler) {
  const calls: FakeRequest[] = [];
  const fetch: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers);
    const req = {
      method: init?.method ?? "GET",
      url: String(url),
      body: init?.body ? String(init.body) : "",
      cookie: headers.get("cookie") ?? "",
    };
    calls.push(req);
    return handler(req, calls.length);
  };
  return { fetch, calls };
}

export const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html", ...headers } });

export const redirect = (location: string, headers: Record<string, string> = {}) =>
  new Response(null, { status: 302, headers: { location, ...headers } });

/** Turn the page-1 fixture into a "page 2, last page" variant. */
export function asLastPage2(page1: string): string {
  return page1
    .replace(/<td><span>1<\/span><\/td>/g, "<td><a href=\"javascript:__doPostBack(&#39;ctl00$cph1$grdRfqSearch&#39;,&#39;Page$1&#39;)\">1</a></td>")
    .replace(/<a href="javascript:__doPostBack\(&#39;ctl00\$cph1\$grdRfqSearch&#39;,&#39;Page\$2&#39;\)">2<\/a>/g, "<span>2</span>")
    .replace(/Page\$3&#39;/g, "Page$X&#39;");
}
