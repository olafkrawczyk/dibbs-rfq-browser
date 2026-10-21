# DIBBS RFQ Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Bun full-stack app that syncs the last N posting days of DIBBS "Recent RFQs" into Postgres and lets a vendor search, filter, sort and open them (DIBBS page / PDF).

**Architecture:** One TypeScript codebase, two processes (`server` = Bun.serve API + React via HTML import; `worker` = scheduler + sync job), Postgres in Docker as the only contract between them. Pure core (parsers, normalizers, query builder, URL state), IO at the edges (http, repos, routes).

**Tech Stack:** Bun 1.4 (`Bun.serve`, `bun:test`, `Bun.SQL`), Postgres 17 + `pg_trgm`, zod 4, cheerio, React 19, TanStack Query 5, shadcn/ui + Tailwind 4 (`bun-plugin-tailwind`), sonner.

**Spec:** `docs/superpowers/specs/2026-10-21-dibbs-rfq-browser-design.md` — read it before any task; section numbers below (§N) refer to it.

## Global Constraints

- Bun only: `bun test`, `bun check`, `bun install`, `bunx`; no node/vite/express/pg/dotenv (CLAUDE.md).
- Files ≤ ~300 lines; pure functions by default; zod at every input boundary (env, HTTP, scraped rows); branded types for identifiers.
- Config env (§3.1): `DATABASE_URL` (required), `SYNC_WINDOW_DAYS`=7, `SYNC_INTERVAL_MINUTES`=60, `DIBBS_REQUEST_DELAY_MS`=1000, `SYNC_STALE_AFTER_MINUTES`=30, `PORT`=3000. Invalid config → process exits with zod message.
- DIBBS base: `https://www.dibbs.bsm.dla.mil`; day URL `/RFQ/RfqRecs.aspx?category=post&TypeSrch=dt&Value=MM-DD-YYYY`; package URL `/RFQ/RFQRec.aspx?sn=<SOL>`; NSN history `/RFQ/RFQNsn.aspx?value=<NSN>&category=post`.
- One DIBBS request at a time, `DIBBS_REQUEST_DELAY_MS` between requests, 3 retries with backoff (1s, 2s, 4s) on network error / 5xx.
- Paging is sequential (Page$N → Page$N+1) using the current page's hidden fields.
- Never construct a PDF URL; store it only if DIBBS lists it.
- `pageSize` ≤ 200, default 50; default sort `posted:desc,returnBy:asc`, `id` tiebreak; default `status=open`; `postedOn` default = current window dates.
- Error body: `{ error: { code, message, issues? } }`; zod → 400, DB unreachable → 503.
- Copy (exact): DoD hint "DIBBS shows a DoD notice first (PDFs have their own, once per session) — click OK and you'll land on this RFQ"; PDF disabled tooltip "No PDF listed — open the package on DIBBS"; nomenclature tooltip "DIBBS truncates names — open the RFQ for the full description"; empty DB "No data yet"; search placeholder "Search NSN, item, solicitation, PR or quantity…".
- Out of scope: alerts/saved searches (but keep §12 hooks: versioned `RfqQuery`, one predicate per field, `first_seen_run_id`), PDF proxy, auth, deploy.

## Review Focus

1. **Search text with LIKE/SQL metacharacters** (`%`, `_`, `\`, `'`) must match literally and never error → test in Task 6 (`escapes like wildcards`).
2. **The same RFQ twice in one upsert batch or on two posting days** must not crash (`ON CONFLICT ... cannot affect row a second time`) and keeps the earliest `posted_date` → test in Task 7 (`dedupes within batch`, `keeps earliest posted date`).
3. **DIBBS session expires mid-day** (postback answered with the consent page) → re-consent and restart that day, at most 2 restarts → test in Task 4 (`restarts day after reconsent`).
4. **Hand-edited / malformed URL params** (`pageSize=10000`, `sort=foo`, `qtyMin>qtyMax`, `returnByFrom=bogus`) → API 400 with issues; web falls back to defaults instead of a blank screen → tests in Task 5 (`rejects invalid params`) and Task 9 (`400 on bad params`).
5. **Odd rows**: part number instead of NSN, missing `QTY:`, missing set-aside icon, unknown status text → kept as part number / null qty / `other` / `other`, never dropped → tests in Task 2.

---

## File Structure

```
docker-compose.yml               postgres:17, db rfq + rfq_test (init script)
docker/init.sql                  create database rfq_test
bunfig.toml                      tailwind plugin for HTML imports
components.json                  shadcn config
src/config.ts                    zod env → Config
src/shared/brand.ts              branded zod schemas
src/shared/format.ts             formatNsn, formatSolicitation (shared by web)
src/shared/schemas.ts            RfqQuery, ListOptions, DTOs (Rfq, Facets, SyncRun, Meta)
src/shared/search-params.ts      parseSearchParams / toSearchParams (URL ⇄ RfqQuery+ListOptions)
src/domain/normalize.ts          pure normalizers
src/dibbs/scraped.ts             ScrapedRfq zod schema
src/dibbs/form.ts                hidden fields, consent/postback bodies
src/dibbs/parse-records.ts       records page → rows
src/dibbs/parse-dates.ts         dates page → IsoDate[]
src/dibbs/parse-fsc.ts           FSC page → names
src/dibbs/http.ts                cookie jar, consent, delay, retries
src/dibbs/client.ts              listPostingDates, fetchDay, fetchFscNames
src/db/sql.ts                    createSql
src/db/migrate.ts                runs src/db/migrations/*.sql
src/db/migrations/001_init.sql   tables, constraints, indexes (§4, §4.1)
src/db/rfq-query.ts              pure SQL builder (list + facets)
src/db/rfq-repo.ts               upsert, list, facets, fsc names
src/db/rfq-row.ts                pure DB row → Rfq DTO
src/db/sync-repo.ts              queue + progress
src/worker/sync-status.ts        pure dayStatus / runStatus
src/worker/sync-job.ts           runSync
src/worker/index.ts              poll loop + scheduler
src/cli/sync.ts                  bun run sync
src/server/http.ts               json/error helpers, withErrors
src/server/routes/{rfqs,sync,meta}.ts
src/server/app.ts                createServer (testable)
src/server/index.ts              entrypoint
src/web/index.html, main.tsx, App.tsx, api.ts, use-url-state.ts, format.ts
src/web/components/{Header,SyncControl,SearchBox,FilterBar,MultiSelectFilter,RangeFilters,ActiveChips,RfqTable,Pagination,DodHint}.tsx
src/web/use-row-keyboard.ts
src/web/components/ui/*          shadcn generated
scripts/seed.ts, scripts/explain.ts
tests/fixtures/*.html, tests/helpers/db.ts, tests/**/*.test.ts
```

Fixtures already captured (copy in Task 3): scratchpad `/private/tmp/claude-501/-Users-olafkrawczyk-private-interview/cd51531d-173f-44a6-9f38-d8f4aa5102eb/scratchpad/` → `rfq.html` (consent page), `post.html` (category=post 10-20-2026 page 1), `recs.html` (category=issue 10-20-2026 page 1, contains a Removed row).

---

### Task 1: Scaffold, Docker, config, branded types

**Files:**
- Create: `docker-compose.yml`, `docker/init.sql`, `src/config.ts`, `src/shared/brand.ts`, `src/shared/format.ts`, `.env.example`
- Modify: `package.json`, `.gitignore` (add nothing secret; keep `.env`)
- Delete: `index.ts`
- Test: `tests/config.test.ts`, `tests/format.test.ts`

**Interfaces:**
- Produces:
  - `loadConfig(env: Record<string, string | undefined>): Config` — throws `ZodError`; `Config = { databaseUrl: string; syncWindowDays: number; syncIntervalMinutes: number; dibbsRequestDelayMs: number; syncStaleAfterMinutes: number; port: number }`
  - `brand.ts`: zod schemas + types `Nsn` (`/^\d{13}$/`), `PartNumber` (non-empty, ≤ 64), `SolicitationNumber` (`/^[A-Z0-9]{13}$/`), `PrNumber` (`/^[A-Z0-9]{6,14}$/`), `Fsc` (`/^\d{4}$/`), `ItemName` (non-empty), `IsoDate` (`/^\d{4}-\d{2}-\d{2}$/` + valid date), `SyncRunId` (positive int) — each `z.….brand<"Name">()`.
  - `formatNsn(nsn: Nsn): string` → `8315-01-683-9267`; `formatSolicitation(sol: SolicitationNumber): string` → `SPE1C1-27-Q-0030` (6-2-1-4 split; return input unchanged if length ≠ 13).

- [ ] **Step 1:** `bun add zod cheerio react react-dom @tanstack/react-query sonner` and `bun add -d @types/react @types/react-dom`. Scripts in `package.json`: `db:up` = `docker compose up -d`, `migrate` = `bun src/db/migrate.ts`, `dev` = `bun --hot src/server/index.ts`, `worker` = `bun src/worker/index.ts`, `sync` = `bun src/cli/sync.ts`, `test` = `bun test`, `typecheck` = `bun check`. Delete `index.ts`.
- [ ] **Step 2:** `docker-compose.yml`: service `db`, image `postgres:17`, env `POSTGRES_USER=rfq POSTGRES_PASSWORD=rfq POSTGRES_DB=rfq`, port `5432:5432`, volume `pgdata`, mount `./docker/init.sql` into `/docker-entrypoint-initdb.d/`. `init.sql`: `create database rfq_test;`. `.env.example`: `DATABASE_URL=postgres://rfq:rfq@localhost:5432/rfq` and `TEST_DATABASE_URL=postgres://rfq:rfq@localhost:5432/rfq_test`. Copy to `.env`. Run `bun run db:up`; expected: `docker compose ps` shows db healthy/running.
- [ ] **Step 3: Write failing tests**

```ts
test("defaults", () => {
  expect(loadConfig({ DATABASE_URL: "postgres://x" })).toEqual({
    databaseUrl: "postgres://x", syncWindowDays: 7, syncIntervalMinutes: 60,
    dibbsRequestDelayMs: 1000, syncStaleAfterMinutes: 30, port: 3000 });
});
test("coerces numbers", () => expect(loadConfig({ DATABASE_URL: "postgres://x", SYNC_WINDOW_DAYS: "3" }).syncWindowDays).toBe(3));
test("rejects missing url / bad window", () => {
  expect(() => loadConfig({})).toThrow();
  expect(() => loadConfig({ DATABASE_URL: "postgres://x", SYNC_WINDOW_DAYS: "0" })).toThrow();
});
// format.test.ts
expect(formatNsn(Nsn.parse("8315016839267"))).toBe("8315-01-683-9267");
expect(formatSolicitation(SolicitationNumber.parse("SPE1C127Q0030"))).toBe("SPE1C1-27-Q-0030");
expect(IsoDate.safeParse("2026-02-30").success).toBe(false);
```

- [ ] **Step 4:** `bun test tests/config.test.ts tests/format.test.ts` → FAIL (module not found).
- [ ] **Step 5:** Implement. `SYNC_WINDOW_DAYS` int 1–60, interval int ≥ 1, delay int ≥ 0, stale int ≥ 1, port 1–65535. Also export `getConfig()` that calls `loadConfig(process.env)` and on error prints `z.prettifyError` and `process.exit(1)`.
- [ ] **Step 6:** `bun test` → PASS; `bun check` → no errors.
- [ ] **Step 7:** Commit `chore: scaffold bun project, docker postgres, config, branded types`.

---

### Task 2: Domain normalizers

**Files:**
- Create: `src/domain/normalize.ts`
- Test: `tests/domain/normalize.test.ts`

**Interfaces:**
- Consumes: `brand.ts` types.
- Produces (types exported from `normalize.ts`):
  - `type ItemId = { kind: "nsn"; nsn: Nsn; fsc: Fsc } | { kind: "part"; partNumber: PartNumber }`
  - `parseItemId(raw: string): ItemId` — strip dashes/whitespace; 13 digits → NSN (fsc = first 4); else part number (trimmed, internal whitespace collapsed).
  - `toItemName(nomenclature: string): ItemName` — collapse whitespace, uppercase, text before first comma (trimmed), else whole string.
  - `type SetAside = "small_business" | "unrestricted" | "other"`; `normalizeSetAside(alt: string | null): { setAside: SetAside; raw: string | null }` — `/small business/i` → small_business, `/unrestricted/i` → unrestricted, else other.
  - `type RfqStatus = "open" | "removed" | "cancelled" | "awarded" | "other"`; `normalizeStatus(text: string): { status: RfqStatus; raw: string }` — case-insensitive prefix match (`cancel` → cancelled).
  - `type TechDocs = "available" | "spec_only" | "none"`; `normalizeTechDocs(hasLink: boolean, specOnly: boolean): TechDocs` — specOnly wins over available.
  - `parseUsDate(s: string): IsoDate | null` — `MM-DD-YYYY` → ISO, null if invalid.
  - `toUsDate(d: IsoDate): string` — inverse (for DIBBS URLs).
  - `normalizeSolicitation(s: string): SolicitationNumber` — strip non-alphanumerics, uppercase.
  - `parseQuantity(s: string): number | null` — `QTY: 57000` / `QTY: 57,000` → 57000; absent → null.

- [ ] **Step 1: Failing tests** (one `test` per normalizer):

```ts
expect(parseItemId("8315-01-683-9267")).toEqual({ kind: "nsn", nsn: "8315016839267", fsc: "8315" });
expect(parseItemId(" MS 21042-3 ")).toEqual({ kind: "part", partNumber: "MS 21042-3" });
expect(toItemName("ARMY,  BUCKLE,  CLIPS,  E")).toBe("ARMY");
expect(toItemName("OXYGEN MASK RECEIVE")).toBe("OXYGEN MASK RECEIVE");
expect(toItemName("pad, electrode, defibril")).toBe("PAD");
expect(normalizeSetAside("Small Business Set-Aside")).toEqual({ setAside: "small_business", raw: "Small Business Set-Aside" });
expect(normalizeSetAside("Unrestricted/Not Set Aside").setAside).toBe("unrestricted");
expect(normalizeSetAside(null)).toEqual({ setAside: "other", raw: null });
expect(normalizeStatus("Removed").status).toBe("removed");
expect(normalizeStatus("Something New")).toEqual({ status: "other", raw: "Something New" });
expect(normalizeTechDocs(true, true)).toBe("spec_only");
expect(normalizeTechDocs(false, false)).toBe("none");
expect(parseUsDate("10-20-2026")).toBe("2026-10-20");
expect(parseUsDate("13-40-2026")).toBeNull();
expect(toUsDate(IsoDate.parse("2026-10-20"))).toBe("10-20-2026");
expect(normalizeSolicitation("SPE1C1-27-Q-0030")).toBe("SPE1C127Q0030");
expect(parseQuantity("7018560662 QTY: 57,000")).toBe(57000);
expect(parseQuantity("7018560662")).toBeNull();
```

- [ ] **Step 2:** `bun test tests/domain` → FAIL.
- [ ] **Step 3:** Implement in `src/domain/normalize.ts`.
- [ ] **Step 4:** `bun test tests/domain` → PASS.
- [ ] **Step 5:** Commit `feat(domain): normalizers for DIBBS fields`.

---

### Task 3: DIBBS form helpers and page parsers

**Files:**
- Create: `src/dibbs/scraped.ts`, `src/dibbs/form.ts`, `src/dibbs/parse-records.ts`, `src/dibbs/parse-dates.ts`, `src/dibbs/parse-fsc.ts`, `tests/fixtures/{consent,records-post-p1,records-issue-p1,dates-recent,fsc}.html`
- Test: `tests/dibbs/form.test.ts`, `tests/dibbs/parse.test.ts`

**Interfaces:**
- Consumes: Task 2 normalizers.
- Produces:
  - `ScrapedRfq` (zod object, `scraped.ts`): `{ solicitationNumber: SolicitationNumber; nsn: Nsn | null; partNumber: PartNumber | null; fsc: Fsc | null; nomenclature: string; itemName: ItemName; milSpec: boolean; quantity: number | null; prNumber: PrNumber; status: RfqStatus; statusRaw: string; setAside: SetAside; setAsideRaw: string | null; techDocs: TechDocs; postedDate: IsoDate; issueDate: IsoDate | null; returnByDate: IsoDate | null; dibbsUrl: string; pdfUrl: string | null; techDocsUrl: string | null }` with refine exactly one of nsn/partNumber.
  - `form.ts`: `isConsentPage(html: string): boolean` (has `#butAgree`); `extractHiddenFields(html: string): Record<string, string>`; `consentRequest(html: string, pageUrl: string): { url: string; body: URLSearchParams }` (form action resolved against `pageUrl`, `butAgree=OK`); `pageRequestBody(html: string, page: number): URLSearchParams` (`__EVENTTARGET=ctl00$cph1$grdRfqSearch`, `__EVENTARGUMENT=Page$<page>`).
  - `parseRecordsPage(html: string, postedDate: IsoDate): RecordsPage` where `RecordsPage = { totalRecords: number; currentPage: number; nextPage: number | null; rows: ScrapedRfq[]; invalid: { index: number; reason: string; snippet: string }[] }`. `totalRecords` from `#ctl00_cph1_lblRecCount` (0 if absent). `currentPage` = pager `<span>` number (1 if no pager). `nextPage` = `currentPage+1` iff a pager link with argument `Page$<currentPage+1>` exists. Rows = `tr` containing `span[id$=_lblSolicitation]`; each built from the `lbl*` spans (§2) then `ScrapedRfq.safeParse`; failures go to `invalid` with first 300 chars of the row HTML. `dibbsUrl` always `https://www.dibbs.bsm.dla.mil/RFQ/RFQRec.aspx?sn=<SOL>`. `pdfUrl` = href in lblSolicitation matching `/\.PDF$/i`. `techDocsUrl` = TDMT href; specOnly = text contains `Spec/Stnd Only`. `milSpec` = lblNsn text contains `Mil-Spec`. setAside alt = `img` alt inside lblSolicitation.
  - `parseRecentDates(html: string): IsoDate[]` — all `RfqRecs.aspx?...Value=MM-DD-YYYY` links, deduped, newest first.
  - `parseFscNames(html: string): { code: Fsc; name: string }[]` — shape decided from the captured fixture; returns `[]` if nothing matches.

- [ ] **Step 1: Capture fixtures.** Copy `rfq.html` → `tests/fixtures/consent.html`, `post.html` → `records-post-p1.html`, `recs.html` → `records-issue-p1.html` from the scratchpad path above. Capture the other two with curl, using the consent dance (GET warning page, POST hidden fields + `butAgree=OK`, keep cookie jar):

```bash
S=/private/tmp/claude-501/-Users-olafkrawczyk-private-interview/cd51531d-173f-44a6-9f38-d8f4aa5102eb/scratchpad
curl -sSL -c $S/jar.txt -b $S/jar.txt -o tests/fixtures/dates-recent.html "https://www.dibbs.bsm.dla.mil/RFQ/RfqDates.aspx?category=recent"
curl -sSL -c $S/jar.txt -b $S/jar.txt -o tests/fixtures/fsc.html "https://www.dibbs.bsm.dla.mil/Rfq/RfqFsc.aspx"
grep -c "Value=" tests/fixtures/dates-recent.html   # expect > 0
```

If the jar has expired, re-run the consent with `$S/agree.ts` exactly as earlier (`bun $S/agree.ts <warning.html>` → body, POST it). **Verify** `dates-recent.html` links use `category=post`; if they use another category, record the actual URL in `client.ts` constants and note it in the spec §2. Inspect `fsc.html` to choose `parseFscNames` selectors.
- [ ] **Step 2: Failing tests** (`parse.test.ts`, `form.test.ts`):

```ts
const issue = parseRecordsPage(fixture("records-issue-p1.html"), IsoDate.parse("2026-10-20"));
expect(issue.totalRecords).toBe(1160);
expect(issue.currentPage).toBe(1);
expect(issue.nextPage).toBe(2);
expect(issue.rows.length + issue.invalid.length).toBe(50);
expect(issue.invalid).toEqual([]);
expect(issue.rows[0]).toMatchObject({
  solicitationNumber: "SPE1C127Q0030", nsn: "8315016839267", fsc: "8315",
  nomenclature: "ARMY, BUCKLE, CLIPS, E", itemName: "ARMY", milSpec: true,
  quantity: 57000, prNumber: "7018560662", status: "open", setAside: "small_business",
  techDocs: "spec_only", issueDate: "2026-10-20", returnByDate: "2026-11-20",
  pdfUrl: null, dibbsUrl: "https://www.dibbs.bsm.dla.mil/RFQ/RFQRec.aspx?sn=SPE1C127Q0030" });
expect(issue.rows[1]).toMatchObject({
  solicitationNumber: "SPE1C127Q0088", status: "removed", setAside: "unrestricted", techDocs: "none",
  quantity: 1500, pdfUrl: "https://dibbs2.bsm.dla.mil/Downloads/RFQ/8/SPE1C127Q0088.PDF" });
const post = parseRecordsPage(fixture("records-post-p1.html"), IsoDate.parse("2026-10-20"));
expect(post.rows.length).toBe(50);
expect(post.rows.every(r => r.postedDate === "2026-10-20")).toBe(true);
expect(post.rows.filter(r => r.pdfUrl).length).toBeGreaterThan(0);
expect(parseRecordsPage("<html></html>", IsoDate.parse("2026-10-20"))).toMatchObject({ totalRecords: 0, rows: [], nextPage: null });
// dates
const dates = parseRecentDates(fixture("dates-recent.html"));
expect(dates.length).toBeGreaterThan(0);
expect([...dates].sort().reverse()).toEqual(dates);
// fsc: assert one known code/name pair read from the fixture
// form
expect(isConsentPage(fixture("consent.html"))).toBe(true);
expect(isConsentPage(fixture("records-post-p1.html"))).toBe(false);
const c = consentRequest(fixture("consent.html"), "https://www.dibbs.bsm.dla.mil/dodwarning.aspx?goto=/rfq/");
expect(c.body.get("butAgree")).toBe("OK");
expect(c.body.get("__VIEWSTATEFIELDCOUNT")).toBe("24");
const p = pageRequestBody(fixture("records-post-p1.html"), 2);
expect(p.get("__EVENTARGUMENT")).toBe("Page$2");
expect(p.get("__EVENTTARGET")).toBe("ctl00$cph1$grdRfqSearch");
expect(p.get("__EVENTVALIDATION")).toBeTruthy();
```

(Row order in `records-issue-p1.html`: first data row is SPE1C127Q0030, second SPE1C127Q0088 — verified from the captured HTML.)
- [ ] **Step 3:** `bun test tests/dibbs` → FAIL.
- [ ] **Step 4:** Implement with cheerio (`cheerio.load`). Keep `parse-records.ts` ≤ 300 lines; put per-cell extractors as small pure functions.
- [ ] **Step 5:** `bun test tests/dibbs` → PASS.
- [ ] **Step 6:** Commit `feat(dibbs): consent/postback forms and page parsers with real fixtures`.

---

### Task 4: DIBBS HTTP session and client

**Files:**
- Create: `src/dibbs/http.ts`, `src/dibbs/client.ts`
- Test: `tests/dibbs/client.test.ts`

**Interfaces:**
- Consumes: Task 3 `form.ts`, parsers; `toUsDate`.
- Produces:
  - `type FetchLike = (url: string, init?: RequestInit) => Promise<Response>`
  - `createDibbsHttp(opts: { fetch: FetchLike; delayMs: number; sleep?: (ms: number) => Promise<void>; maxRetries?: number }): DibbsHttp`
  - `DibbsHttp = { get(url: string): Promise<HttpPage>; post(url: string, body: URLSearchParams): Promise<HttpPage> }`, `HttpPage = { html: string; url: string; reconsented: boolean }`. Cookie jar per host (parse `getSetCookie()`), `redirect: "manual"` loop (max 10), delay before every request, retries on network error/5xx with 1s/2s/4s. If the final HTML `isConsentPage`, POST `consentRequest` (cookies kept) and return that result with `reconsented: true`.
  - `createDibbsClient(http: DibbsHttp, baseUrl?: string): DibbsClient`
  - `DibbsClient = { listPostingDates(): Promise<IsoDate[]>; fetchDay(date: IsoDate, onPage: (page: RecordsPage) => Promise<void>): Promise<DayFetchResult>; fetchFscNames(): Promise<{ code: Fsc; name: string }[]> }`
  - `DayFetchResult = { expected: number; parsed: number; invalid: number; pages: number }`
  - `fetchDay`: GET day URL → page 1 → `onPage` → while `nextPage`: POST same URL with `pageRequestBody(currentHtml, nextPage)` → `onPage`. If any postback returns `reconsented: true`, restart the day from page 1 (max 2 restarts, then throw `DayFetchError("session lost")`). Sanity: if `nextPage` ≠ previous+1 or parsed `currentPage` ≠ requested page → throw `DayFetchError("paging mismatch")`.

- [ ] **Step 1: Failing tests** using a fake `FetchLike` that serves fixtures by URL/body and records calls (`sleep` = no-op):

```ts
test("accepts consent then returns target page", ...) // 1st GET → consent.html, POST → records → reconsented true, cookie sent on POST
test("follows postback paging until no next page", ...) // page1 (nextPage 2) → page2 html (fake: records page with pager span 2, no Page$3) ; onPage called twice; result {expected:1160?...}
test("restarts day after reconsent", ...) // postback for page 2 answers consent first → day restarts at page 1, onPage receives page 1 twice, completes
test("gives up after 2 restarts", ...) // always reconsent on postback → rejects DayFetchError /session lost/
test("retries 5xx 3 times then throws", ...) // 4 calls total, sleep called with 1000, 2000, 4000
```

For page-2 fixtures, derive from `records-post-p1.html` by replacing the pager (span `1` → link, `2` → span) and removing the `Page$3` link — do it in a test helper, not a new file.
- [ ] **Step 2:** `bun test tests/dibbs/client.test.ts` → FAIL.
- [ ] **Step 3:** Implement `http.ts` then `client.ts`.
- [ ] **Step 4:** PASS. Then **live smoke** (one call, polite): `bun -e 'import {createDibbsHttp} from "./src/dibbs/http"; import {createDibbsClient} from "./src/dibbs/client"; const c=createDibbsClient(createDibbsHttp({fetch, delayMs:1000})); console.log(await c.listPostingDates())'` → prints ISO dates, newest first.
- [ ] **Step 5:** Commit `feat(dibbs): http session with consent, retries and sequential paging client`.

---

### Task 5: Shared API schemas and URL params

**Files:**
- Create: `src/shared/schemas.ts`, `src/shared/search-params.ts`
- Test: `tests/shared/search-params.test.ts`

**Interfaces:**
- Produces:
  - `RfqQuery` zod (version 1): `{ version: 1; q?: string (trim, 1..100); status: RfqStatus[] (default ["open"]); setAside: SetAside[]; fsc: Fsc[]; itemName: ItemName[]; closesWithinDays?: int 1..365; returnByFrom?: IsoDate; returnByTo?: IsoDate; postedOn: IsoDate[]; qtyMin?: int ≥ 0; qtyMax?: int ≥ 0; techDocs: "any" | TechDocs (default "any") }` + refines `qtyMin ≤ qtyMax`, `returnByFrom ≤ returnByTo`.
  - `SortField = "posted" | "returnBy" | "qty" | "nsn" | "solicitation" | "itemName"`; `ListOptions = { sort: { field: SortField; dir: "asc" | "desc" }[] (default posted:desc, returnBy:asc; max 3); page: int ≥ 1 (1); pageSize: int 1..200 (50) }`.
  - `FacetName = "status" | "setAside" | "fsc" | "itemName" | "postedOn" | "techDocs"`.
  - DTOs: `Rfq` (spec §6.1 fields + `id`, `firstSeenAt`, `lastSeenAt`, `links: { dibbs: string; pdf: string | null; techDocs: string | null; nsnHistory: string | null }`), `RfqListResponse { items, total, page, pageSize }`, `FacetBucket { value: string; count: number }`, `Facets = Record<FacetName, FacetBucket[]>`, `SyncDay { date, status: "pending"|"running"|"complete"|"partial"|"failed", expected: number|null, parsed: number, invalid: number, page: number, pages: number|null, error?: string }`, `SyncRun { id: SyncRunId; trigger: "scheduled"|"manual"; status: "queued"|"running"|"complete"|"partial"|"failed"; requestedAt; startedAt|null; finishedAt|null; windowDates: IsoDate[]; days: SyncDay[]; error: string|null }`, `Meta { windowDays: number; windowDates: IsoDate[]; dataAsOf: string|null; lastRun: SyncRun|null; activeRun: SyncRun|null; fscNames: Record<string,string> }`.
  - `parseSearchParams(p: URLSearchParams): { ok: true; query: RfqQuery; options: ListOptions } | { ok: false; issues: z.core.$ZodIssue[] }` — multi-values as comma-separated; `sort=posted:desc,returnBy:asc`.
  - `toSearchParams(query: RfqQuery, options: ListOptions): URLSearchParams` — omits defaults (so `/` = default view).

- [ ] **Step 1: Failing tests:**

```ts
test("empty params → defaults", () => {
  const r = parseSearchParams(new URLSearchParams(""));
  expect(r).toMatchObject({ ok: true, query: { version: 1, status: ["open"], techDocs: "any", postedOn: [] },
    options: { page: 1, pageSize: 50, sort: [{ field: "posted", dir: "desc" }, { field: "returnBy", dir: "asc" }] } });
});
test("round trip", () => {
  const p = new URLSearchParams("q=pad&fsc=8315,6515&setAside=small_business&qtyMin=100&sort=qty:desc&page=2");
  const r = parseSearchParams(p); if (!r.ok) throw 0;
  expect(parseSearchParams(toSearchParams(r.query, r.options))).toEqual(r);
});
test("defaults are omitted", () => expect(toSearchParams(...defaults).toString()).toBe(""));
test("rejects invalid params", () => {
  for (const s of ["pageSize=10000", "sort=foo:asc", "qtyMin=5&qtyMax=1", "returnByFrom=bogus", "fsc=12"])
    expect(parseSearchParams(new URLSearchParams(s)).ok).toBe(false);
});
```

- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `bun test tests/shared` PASS.
- [ ] **Step 5:** Commit `feat(shared): RfqQuery/ListOptions schemas, DTOs and URL params`.

---

### Task 6: Migrations and pure query builder

**Files:**
- Create: `src/db/sql.ts`, `src/db/migrate.ts`, `src/db/migrations/001_init.sql`, `src/db/rfq-query.ts`, `tests/helpers/db.ts`
- Test: `tests/db/rfq-query.test.ts`, `tests/db/migrate.test.ts`

**Interfaces:**
- Produces:
  - `createSql(url: string): SQL` (Bun `new SQL(url)`).
  - `migrate(sql: SQL): Promise<string[]>` — applies `src/db/migrations/*.sql` in name order inside a transaction each, tracked in `schema_migrations(name text primary key, applied_at timestamptz default now())`; returns applied names. `src/db/migrate.ts` also runs as a script (`import.meta.main`).
  - `001_init.sql`: exactly §4 tables (incl. `first_seen_run_id bigint not null`, generated `item_key`, generated `search_text`, `rfqs_one_item_id`, `rfqs_identity`), `create extension if not exists pg_trgm`, and every index of §4.1 with the names given there (`rfqs_window_default`, `rfqs_return_by`, `rfqs_quantity`, `rfqs_fsc`, `rfqs_item_name`, `rfqs_search_trgm`, `sync_runs_one_active`, `sync_runs_latest`), `fsc_names`.
  - `tests/helpers/db.ts`: `freshDb(): Promise<SQL>` — connects to `TEST_DATABASE_URL`, `drop schema public cascade; create schema public;`, `migrate`.
  - `type SqlQuery = { text: string; values: unknown[] }`
  - `buildListQuery(query: RfqQuery, options: ListOptions, windowDates: IsoDate[]): SqlQuery` — selects all rfq columns plus `count(*) over() as total`; `limit/offset`.
  - `buildFacetQuery(facet: FacetName, query: RfqQuery, windowDates: IsoDate[]): SqlQuery` — `select <col> as value, count(*)::int as count … group by 1 order by 2 desc, 1 limit 200`, applying every predicate except the facet's own.
  - `escapeLike(s: string): string` — escapes `\`, `%`, `_`.
  - Internals: `predicates: Record<keyof RfqQuery-filter-fields, (q, add) => string | null>`, one per field (§12 hook). `postedOn` empty → `posted_date = any($windowDates)`. `q`: `search_text ilike $1 escape '\'` with `%escaped%`; if q contains `-` add OR with dash-stripped q; if q matches `/^\d{1,3}(,\d{3})+$|^\d+$/` add `OR quantity = <n>`. `closesWithinDays` → `return_by_date between current_date and current_date + n`. Sort map: posted→posted_date, returnBy→return_by_date (nulls last), qty→quantity (nulls last), nsn→item_key, solicitation→solicitation_number, itemName→item_name; always append `id`.

- [ ] **Step 1: Failing tests** (`rfq-query.test.ts`, pure, no DB):

```ts
const W = [IsoDate.parse("2026-10-20")];
test("default query filters window and open, sorts by posted desc", () => {
  const { text, values } = buildListQuery(defaultQuery, defaultOptions, W);
  expect(text).toContain("posted_date = any(");
  expect(text).toMatch(/order by posted_date desc, return_by_date asc nulls last, id/i);
  expect(values).toContainEqual(["open"]);
});
test("escapes like wildcards", () => {
  expect(escapeLike("50%_a\\b")).toBe("50\\%\\_a\\\\b");
  expect(buildListQuery({ ...defaultQuery, q: "50%" }, defaultOptions, W).values).toContain("%50\\%%");
});
test("numeric q also matches quantity", () => {
  const { text, values } = buildListQuery({ ...defaultQuery, q: "57,000" }, defaultOptions, W);
  expect(text).toContain("quantity =");
  expect(values).toContain(57000);
});
test("dashed q also matches undashed", () => expect(buildListQuery({ ...defaultQuery, q: "8315-01" }, defaultOptions, W).values).toContain("%831501%"));
test("facet excludes its own filter", () => {
  const q = { ...defaultQuery, setAside: ["small_business"], fsc: ["8315"] };
  const f = buildFacetQuery("setAside", q, W);
  expect(f.values).not.toContainEqual(["small_business"]);
  expect(f.values).toContainEqual(["8315"]);
});
test("paging", () => expect(buildListQuery(defaultQuery, { ...defaultOptions, page: 3, pageSize: 20 }, W).text).toMatch(/limit \$\d+ offset \$\d+/));
```

And `migrate.test.ts` (DB): `freshDb()` twice is idempotent; inserting two `sync_runs` with status `queued` → second insert throws unique violation; inserting an rfq with both nsn and part_number null → check violation; `select indexname from pg_indexes where tablename='rfqs'` contains all §4.1 names.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `bun test tests/db` PASS (db container running).
- [ ] **Step 5:** Commit `feat(db): schema, indexes, migrations and pure query builder`.

---

### Task 7: Repositories

**Files:**
- Create: `src/db/rfq-repo.ts`, `src/db/rfq-row.ts`, `src/db/sync-repo.ts`
- Test: `tests/db/rfq-repo.test.ts`, `tests/db/sync-repo.test.ts`, `tests/helpers/factory.ts` (`scraped(overrides): ScrapedRfq`)

**Interfaces:**
- Consumes: Task 6 builder/migrations, Task 5 DTOs, `ScrapedRfq`.
- Produces:
  - `upsertRfqs(sql: SQL, rows: ScrapedRfq[], runId: SyncRunId): Promise<number>` — dedupe by (solicitation, nsn ?? partNumber, pr) keeping last; single multi-row `insert … on conflict on constraint rfqs_identity do update set` all mutable columns, `last_seen_at = now()`, `last_sync_run_id = excluded.last_sync_run_id`, `posted_date = least(rfqs.posted_date, excluded.posted_date)`; `first_seen_at`/`first_seen_run_id` only on insert.
  - `listRfqs(sql, query: RfqQuery, options: ListOptions, windowDates: IsoDate[]): Promise<RfqListResponse>`
  - `getFacets(sql, query: RfqQuery, windowDates: IsoDate[]): Promise<Facets>` — 6 queries via `Promise.all`.
  - `upsertFscNames(sql, names: { code: Fsc; name: string }[]): Promise<void>`; `getFscNames(sql): Promise<Record<string, string>>`
  - `rowToRfq(row: RfqRow): Rfq` (pure; `links.nsnHistory` only for NSN rows).
  - `sync-repo.ts`: `enqueueRun(sql, trigger): Promise<SyncRun>` (insert … on conflict do nothing, then select active); `claimNextRun(sql): Promise<SyncRun | null>` (`for update skip locked`, sets running + started_at); `setWindow(sql, id, dates: IsoDate[], days: SyncDay[])`; `saveDays(sql, id, days: SyncDay[])`; `finishRun(sql, id, status: "complete"|"partial"|"failed", error?: string)`; `reapStaleRuns(sql, staleAfterMinutes: number): Promise<number>` (error "worker stopped"); `getRun(sql, id)`, `getActiveRun(sql)`, `getLatestFinishedRun(sql)` (status complete|partial|failed); `getWindowDates(sql): Promise<IsoDate[]>` (window of latest finished run with status complete|partial, else `[]`).

- [ ] **Step 1: Failing tests** (`freshDb()` in `beforeEach`):

```ts
test("insert then update keeps first_seen", ...)    // upsert run 1, change status → upsert run 2: status updated, first_seen_run_id 1, last_sync_run_id 2
test("dedupes within batch", ...)                   // same identity twice in one call → resolves, 1 row
test("keeps earliest posted date", ...)             // posted 10-20 then 10-17 then 10-21 → 2026-10-17
test("list filters, search and total", ...)          // 3 rows; q "cathet" hits 1; total reflects filter; status default hides removed
test("qty sort and numeric search", ...)            // sort qty desc order; q "1,500" hits qty 1500 row
test("facet counts ignore own filter", ...)
test("enqueue returns the active run instead of stacking", ...) // two enqueues → same id
test("claim is exclusive", ...)                      // Promise.all two claims → exactly one non-null
test("reaps stale runs", ...)                        // started_at = now() - 31 min → failed, "worker stopped"
```

- [ ] **Step 2:** FAIL → **Step 3:** implement (Bun SQL: `sql.unsafe(text, values)` for built queries; `sql\`insert into rfqs ${sql(rows, ...cols)}\`` for batch insert) → **Step 4:** `bun test tests/db` PASS.
- [ ] **Step 5:** Commit `feat(db): rfq and sync repositories`.

---

### Task 8: Sync job, worker, CLI

**Files:**
- Create: `src/worker/sync-status.ts`, `src/worker/sync-job.ts`, `src/worker/index.ts`, `src/cli/sync.ts`
- Test: `tests/worker/sync-status.test.ts`, `tests/worker/sync-job.test.ts`

**Interfaces:**
- Consumes: `DibbsClient` (Task 4), repos (Task 7), `Config`.
- Produces:
  - `dayStatus(r: { expected: number; parsed: number; invalid: number }): "complete" | "partial" | "failed"` — failed if `expected > 0 && parsed === 0`; complete if `parsed === expected && invalid === 0`; else partial.
  - `runStatus(days: SyncDay[]): "complete" | "partial" | "failed"` — all complete → complete; none complete/partial → failed; else partial.
  - `type SyncJobStore = { setWindow; saveDays; finishRun; upsertRfqs; upsertFscNames }` (the repo functions with `sql` bound).
  - `runSync(deps: { client: DibbsClient; store: SyncJobStore; windowDays: number; log: (msg: string, extra?: object) => void }, run: SyncRun): Promise<"complete" | "partial" | "failed">` — §5.2: dates = `listPostingDates().slice(0, windowDays)`; FSC refresh (catch + log); for each date sequentially: day running → `fetchDay(date, page => upsertRfqs(page.rows) + log invalid + saveDays(progress))` → `dayStatus`; per-day errors → day failed with message, continue; `listPostingDates` failure → run failed. Always `finishRun`.
  - `worker/index.ts`: `getConfig()`, `migrate`, then loop every 3 s: `reapStaleRuns` → `claimNextRun` → `runSync`. Scheduler: `enqueueRun("scheduled")` at startup and every `syncIntervalMinutes`. SIGINT/SIGTERM: stop loop after current run, close sql.
  - `cli/sync.ts`: `enqueueRun("manual")`, print id, poll `getRun` every 2 s printing `date page/pages parsed/expected` until finished; exit code 0 complete, 1 otherwise. `--no-wait` just enqueues.

- [ ] **Step 1: Failing tests** with fake client + in-memory store:

```ts
expect(dayStatus({ expected: 100, parsed: 100, invalid: 0 })).toBe("complete");
expect(dayStatus({ expected: 100, parsed: 98, invalid: 2 })).toBe("partial");
expect(dayStatus({ expected: 100, parsed: 0, invalid: 0 })).toBe("failed");
expect(dayStatus({ expected: 0, parsed: 0, invalid: 0 })).toBe("complete");
test("syncs newest windowDays dates, all complete", ...)  // 3 dates listed, windowDays 2 → fetchDay called for the 2 newest; finishRun complete
test("one day failing → partial, others still synced", ...)
test("listPostingDates failing → failed with error", ...)
test("fsc failure is not fatal", ...)
```

- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `bun test tests/worker` PASS.
- [ ] **Step 5: Live check:** `SYNC_WINDOW_DAYS=1 bun run worker` in one terminal, `bun run sync` in another → CLI ends `complete` with `parsed == expected` for the newest date (~3–4 min worst case at 1 req/s; stop worker after). If parsed ≠ expected, debug with superpowers:systematic-debugging before continuing.
- [ ] **Step 6:** Commit `feat(worker): sync job, polling worker, scheduler and sync CLI`.

---

### Task 9: HTTP API

**Files:**
- Create: `src/server/http.ts`, `src/server/routes/rfqs.ts`, `src/server/routes/sync.ts`, `src/server/routes/meta.ts`, `src/server/app.ts`, `src/server/index.ts`
- Test: `tests/server/api.test.ts`

**Interfaces:**
- Consumes: repos, `parseSearchParams`, `Config`.
- Produces:
  - `createServer(deps: { sql: SQL; config: Config; port?: number; index?: HTMLBundle }): Server` — routes `GET /api/rfqs`, `GET /api/rfqs/facets`, `GET /api/meta`, `POST /api/sync` (202), `GET /api/sync/latest`, `GET /api/sync/:id`, `/*` → index (if given). Unknown `/api/*` → 404 JSON.
  - `http.ts`: `json(data: unknown, status = 200): Response`; `apiError(status, code, message, issues?)`; `withErrors(handler)` — ZodError → 400 `invalid_request`; Postgres connection errors (`ECONNREFUSED`, `ERR_POSTGRES_CONNECTION_CLOSED`) → 503 `db_unavailable`; else 500 `internal` (logged).
  - `index.ts`: `getConfig()`, `migrate`, `createServer({ index: import("../web/index.html") , … })` with `development: { hmr: true, console: true }` when not production.

- [ ] **Step 1: Failing tests** (`createServer({ port: 0 })`, real `freshDb()`, seeded via `upsertRfqs` + a finished run so the window exists):

```ts
test("lists with defaults", ...)          // 200, items.length, total, pageSize 50, removed hidden
test("400 on bad params", ...)            // /api/rfqs?pageSize=10000 → 400 { error: { code: "invalid_request", issues: [...] } }
test("facets", ...)                       // keys status,setAside,fsc,itemName,postedOn,techDocs
test("meta", ...)                         // windowDays from config, windowDates, dataAsOf non-null, fscNames
test("force sync is idempotent", ...)     // two POST /api/sync → 202 both, same run id
test("sync by id 404 on unknown", ...)
```

- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `bun test tests/server` PASS.
- [ ] **Step 5:** Commit `feat(server): RFQ, facets, meta and sync API`.

---

### Task 10: Web shell — scaffold, data layer, table

**Files:**
- Create: `bunfig.toml`, `components.json`, `src/web/index.html`, `src/web/styles.css`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/api.ts`, `src/web/use-url-state.ts`, `src/web/format.ts`, `src/web/components/{RfqTable,Pagination,SearchBox,DodHint}.tsx`, `src/web/components/ui/*`, `src/web/lib/utils.ts`
- Test: `tests/web/format.test.ts`

**Interfaces:**
- Consumes: shared schemas/search-params/format, API.
- Produces:
  - `api.ts`: `fetchRfqs(p: URLSearchParams): Promise<RfqListResponse>`, `fetchFacets(p)`, `fetchMeta()`, `startSync(): Promise<SyncRun>`, `fetchSyncRun(id)` — each parses the response with its zod schema; non-2xx → throws `ApiError { status, code, message }`.
  - `useUrlState(): { query: RfqQuery; options: ListOptions; set(next: Partial<RfqQuery>, opts?: Partial<ListOptions>): void }` — reads `location.search` via `parseSearchParams`; invalid → `history.replaceState` to defaults + sonner toast "Some filters in the link were invalid and were reset"; filter changes reset `page` to 1; writes with `pushState`; listens to `popstate`.
  - `format.ts`: `returnByLabel(returnBy: IsoDate | null, today: IsoDate): { text: string; urgent: boolean }` — `"in 5d"`, `"today"`, `"2d ago"`; urgent when 0 ≤ days < 3. `formatQty(n: number | null): string` (`57,000`, `—`).
  - `DodHint`: `useDodHint(): (url: string) => void` — opens url in new tab; first time (per `localStorage` key `dodHintDismissed`, try/catch) shows dialog with the exact copy from Global Constraints, buttons "Continue" and "Don't show again".

- [ ] **Step 1:** Scaffold shadcn for Bun HTML imports: `bun add -d tailwindcss bun-plugin-tailwind` and `bun add class-variance-authority clsx tailwind-merge lucide-react`; `bunfig.toml` `[serve.static] plugins = ["bun-plugin-tailwind"]`; `styles.css` `@import "tailwindcss";` + shadcn theme tokens; `components.json` with aliases `@/components` → `src/web/components`, `@/lib` → `src/web/lib` (add `paths` `"@/*": ["./src/web/*"]` to `tsconfig.json`, `"lib": ["ESNext","DOM"]`). Then `bunx shadcn@latest add button input table badge popover command checkbox tooltip dialog skeleton sonner separator`. Verify: `bun run dev` serves `/` with a styled shadcn `Button`.
- [ ] **Step 2: Failing tests** `format.test.ts`:

```ts
const T = IsoDate.parse("2026-10-21");
expect(returnByLabel(IsoDate.parse("2026-10-26"), T)).toEqual({ text: "in 5d", urgent: false });
expect(returnByLabel(IsoDate.parse("2026-10-23"), T)).toEqual({ text: "in 2d", urgent: true });
expect(returnByLabel(T, T)).toEqual({ text: "today", urgent: true });
expect(returnByLabel(IsoDate.parse("2026-10-19"), T)).toEqual({ text: "2d ago", urgent: false });
expect(formatQty(57000)).toBe("57,000"); expect(formatQty(null)).toBe("—");
```

- [ ] **Step 3:** FAIL → implement `format.ts` → PASS.
- [ ] **Step 4:** Build `App` (QueryClientProvider, Toaster) with `SearchBox` (debounce 200 ms, placeholder copy, `/` focuses), `RfqTable` (columns per spec §7 Table: Solicitation→PDF or package + "package" label, NSN with copy + Mil-Spec badge, Nomenclature + tooltip, Qty right-aligned, Set-aside badge, Posted, Return by + `returnByLabel` amber when urgent, Status muted rows, actions PDF/Open on DIBBS ↗/NSN history via `useDodHint`; sortable headers update `options.sort` single-key with dir toggle), `Pagination` (prev/next, page x of y, page size 25/50/100/200). Query: `useQuery({ queryKey: ["rfqs", params], queryFn, placeholderData: keepPreviousData })`. States: skeleton rows on first load, empty state with "Clear filters", error banner with retry.
- [ ] **Step 5: Verify in browser:** with DB synced (Task 8 live check), `bun run dev`, open `http://localhost:3000` (use the `run` skill / Playwright): table shows rows, search `cathet` narrows, sorting Qty works, URL updates, back button restores, PDF link opens `dibbs2…PDF` in new tab after hint.
- [ ] **Step 6:** Commit `feat(web): shadcn shell, URL state, RFQ table with search, sort, paging`.

---

### Task 11: Web filters, facets, sync control, keyboard

**Files:**
- Create: `src/web/components/{FilterBar,MultiSelectFilter,RangeFilters,ActiveChips,Header,SyncControl}.tsx`, `src/web/use-row-keyboard.ts`
- Test: `tests/web/keyboard.test.ts`

**Interfaces:**
- Consumes: Task 10 hooks/api.
- Produces:
  - `MultiSelectFilter({ label, options: FacetBucket[], selected: string[], onChange, renderLabel?: (v) => string, searchable?: boolean })` — shadcn Popover + Command with counts; FSC label `code – name` from `meta.fscNames`.
  - `RangeFilters`: Closes within (3/7/14 presets + from/to dates), Quantity min/max (numeric inputs, applied on blur/Enter), Tech docs (any/available/spec only/none).
  - `ActiveChips`: one removable chip per active non-default filter + "Clear all".
  - `Header`: title, data badge from `meta` ("Data as of HH:MM · x/N days ✓"; amber partial, red failed; tooltip lists per-day `parsed/expected`), `SyncControl`: "Sync now" → `startSync`; while a run is active poll `fetchSyncRun` every 2 s, show "Syncing 3/7 days · page 12/24", on finish invalidate `rfqs`, `facets`, `meta` queries and toast the outcome. Empty DB (`meta.lastRun === null` and no rows) → centered "No data yet" with the same Sync button.
  - `nextRowIndex(key: string, current: number, rowCount: number): number` (pure; `j`/ArrowDown +1, `k`/ArrowUp −1, clamped) and `useRowKeyboard(rows: Rfq[], open: (url: string) => void)` — `p` opens focused row's `links.pdf` (no-op if null), `Enter` opens `links.dibbs`; ignored while typing in inputs.

- [ ] **Step 1: Failing test:** `nextRowIndex("j",0,3)===1`, `nextRowIndex("j",2,3)===2`, `nextRowIndex("k",0,3)===0`, `nextRowIndex("ArrowUp",2,3)===1`, `nextRowIndex("x",1,3)===1`.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Implement components; facets via `useQuery(["facets", params])`, meta via `useQuery(["meta"])` (refetch every 60 s).
- [ ] **Step 4: Verify in browser:** each filter changes results and counts; chips remove filters; FSC search works; Sync now shows progress then refreshes; double click doesn't start a second run; `j/k/p/Enter` work; hand-edit URL `?pageSize=9999` → reset + toast.
- [ ] **Step 5:** Commit `feat(web): filters with facet counts, sync control, data badge, keyboard nav`.

---

### Task 12: Performance check, README, final verification

**Files:**
- Create: `scripts/seed.ts`, `scripts/explain.ts`
- Modify: `README.md`

**Interfaces:**
- Produces: `bun scripts/seed.ts <count>` inserts synthetic rows (spread over 250 posting dates, realistic FSC/item names/quantities) into `DATABASE_URL` in batches of 1000 via `upsertRfqs`; `bun scripts/explain.ts` prints `EXPLAIN (ANALYZE, BUFFERS)` for: default list, `q=cathet`, `sort=qty:desc`, `closesWithinDays=7`, and the `fsc` facet, using `buildListQuery`/`buildFacetQuery` with the latest 7 dates.

- [ ] **Step 1:** Write scripts. Run against a scratch DB: `createdb`-equivalent `docker compose exec db psql -U rfq -c 'create database rfq_perf'`, then `DATABASE_URL=postgres://rfq:rfq@localhost:5432/rfq_perf bun run migrate && … bun scripts/seed.ts 300000 && … bun scripts/explain.ts`. Expected: default list uses `rfqs_window_default` (no Sort node or only top-N), `q` uses `rfqs_search_trgm`, each query < 50 ms. If not, adjust indexes in a new migration `002_*.sql` and record why in spec §4.1.
- [ ] **Step 2:** README: what it is, setup (`bun install`, `cp .env.example .env`, `bun run db:up`, `bun run migrate`, `bun run worker`, `bun run dev`, `bun run sync`), config table, filter rationale (spec §7 "Why these filters"), DoD notice note, architecture sketch, known limits (§11), future alerts (§12).
- [ ] **Step 3:** Full verification: `bun check` → 0 errors; `bun test` → all pass; fresh clone flow from README works end to end (worker sync with default window, UI loads, filters, PDF/DIBBS links).
- [ ] **Step 4:** Request a whole-branch review (superpowers:requesting-code-review), fix findings.
- [ ] **Step 5:** Commit `docs: README; chore: seed and explain scripts`.
