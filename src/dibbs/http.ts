import { consentRequest, isConsentPage } from "./form";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type HttpPage = { html: string; url: string; reconsented: boolean };
export type DibbsHttp = {
  get(url: string): Promise<HttpPage>;
  post(url: string, body: URLSearchParams): Promise<HttpPage>;
};

type Options = {
  fetch: FetchLike;
  delayMs: number;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
};

const MAX_REDIRECTS = 10;
const USER_AGENT = "dibbs-rfq-browser/0.1 (+polite sequential sync)";

/**
 * Stateful DIBBS session: per-host cookie jar, manual redirects (to capture cookies),
 * a fixed delay before every request, retries with backoff, and transparent DoD consent.
 */
export function createDibbsHttp(opts: Options): DibbsHttp {
  const sleep = opts.sleep ?? ((ms: number) => Bun.sleep(ms));
  const maxRetries = opts.maxRetries ?? 3;
  const jar = new Map<string, Map<string, string>>();

  const cookieHeader = (url: string) =>
    [...(jar.get(new URL(url).host) ?? new Map())].map(([k, v]) => `${k}=${v}`).join("; ");

  const storeCookies = (url: string, res: Response) => {
    const host = new URL(url).host;
    const cookies = jar.get(host) ?? new Map<string, string>();
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(";");
      const eq = pair!.indexOf("=");
      if (eq > 0) cookies.set(pair!.slice(0, eq).trim(), pair!.slice(eq + 1).trim());
    }
    jar.set(host, cookies);
  };

  async function fetchOnce(method: string, url: string, body?: URLSearchParams): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      if (opts.delayMs > 0) await sleep(opts.delayMs);
      let res: Response | null = null;
      let error: unknown = null;
      try {
        res = await opts.fetch(url, {
          method,
          redirect: "manual",
          body: body?.toString(),
          headers: {
            cookie: cookieHeader(url),
            "user-agent": USER_AGENT,
            ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
          },
        });
        if (res.status < 500) return res;
        error = new Error(`DIBBS responded ${res.status} for ${url}`);
      } catch (err) {
        error = err;
      }
      if (attempt >= maxRetries) throw error;
      await sleep(1000 * 2 ** attempt);
    }
  }

  async function request(method: string, url: string, body?: URLSearchParams): Promise<{ html: string; url: string }> {
    let current = { method, url, body };
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await fetchOnce(current.method, current.url, current.body);
      storeCookies(current.url, res);
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, current.url).toString();
        const keep = res.status === 307 || res.status === 308;
        current = keep ? { ...current, url: next } : { method: "GET", url: next, body: undefined };
        continue;
      }
      if (!res.ok) throw new Error(`DIBBS responded ${res.status} for ${current.url}`);
      return { html: await res.text(), url: current.url };
    }
    throw new Error(`Too many redirects for ${url}`);
  }

  async function withConsent(method: string, url: string, body?: URLSearchParams): Promise<HttpPage> {
    const first = await request(method, url, body);
    if (!isConsentPage(first.html)) return { ...first, reconsented: false };
    const consent = consentRequest(first.html, first.url);
    const after = await request("POST", consent.url, consent.body);
    if (isConsentPage(after.html)) throw new Error("DIBBS consent was not accepted");
    // DIBBS's goto= redirect drops the original query string, so a GET is re-issued against the real URL.
    // A POST (postback) cannot be replayed: its caller restarts from a fresh GET (reconsented=true).
    if (method === "GET" && after.url !== url) return { ...(await request("GET", url)), reconsented: true };
    return { ...after, reconsented: true };
  }

  return {
    get: (url) => withConsent("GET", url),
    post: (url, body) => withConsent("POST", url, body),
  };
}
