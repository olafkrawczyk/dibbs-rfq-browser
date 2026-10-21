# DIBBS RFQ Browser — Design

Date: 2026-10-21
Status: Draft for review

## 1. Goal

A small web app that pulls recent Requests for Quotation (RFQs) from DIBBS
(`dibbs.bsm.dla.mil`) and lets a vendor quickly browse, search and filter
them, then jump to the original solicitation on DIBBS.

Target user: a small/medium vendor scanning each day's new RFQs to decide
which ones are worth quoting. Success means: fast to scan, filters that match
how vendors qualify a bid, and data that is never silently wrong (the app
always says how fresh and how complete its data is).

Scope is an MLP: small, but trustworthy and complete end to end.

## 2. Source: what DIBBS looks like (verified 2026-10-21)

- Source table: *RFQs → Recent RFQs → <date>*:
  `https://www.dibbs.bsm.dla.mil/RFQ/RfqRecs.aspx?category=post&TypeSrch=dt&Value=MM-DD-YYYY`.
  The list of available dates comes from `RfqDates.aspx?category=recent`
  (links of the form `RfqRecs.aspx?...&Value=MM-DD-YYYY`).
- **DoD consent wall.** Any request without the consent cookie is redirected
  to `dodwarning.aspx?goto=<original path>`. Accepting = POST of the page's
  hidden ASP.NET fields (`__VIEWSTATE`, `__VIEWSTATE1..N`,
  `__VIEWSTATEFIELDCOUNT`, `__VIEWSTATEGENERATOR`, `__EVENTVALIDATION`) plus
  `butAgree=OK`. Cookies (`SessionId`, `dw`, `di`, `TS…`) must be kept.
  Consequence for users: a shared DIBBS link shows the DoD notice once per
  browser session, then forwards to the target page.
- **Paging.** 50 rows per page. Pages are ASP.NET postbacks:
  `__EVENTTARGET=ctl00$cph1$grdRfqSearch`, `__EVENTARGUMENT=Page$N`, plus all
  hidden fields of the *current* page. Event validation only allows page
  links rendered on the current page, so paging is strictly sequential
  (N → N+1). One day can hold ~1,200 records (~24 pages).
- **Total count**: `#ctl00_cph1_lblRecCount` ("Records Found: 1160").
- **Row fields** (spans `ctl00_cph1_grdRfqSearch_ctlXX_lbl*`):
  - `lblNsn`: NSN (`8315-01-683-9267`) *or* a part number; optional
    "Mil-Spec" tag; link to NSN history (`RFQNsn.aspx?value=`).
  - `lblNomenclature`: DoD-style `NOUN, MODIFIER` text, truncated by DIBBS at
    ~20–25 characters, sometimes with irregular spacing.
  - `lblTechnicalDocuments`: optional TDMT link; optional "*Spec/Stnd Only".
  - `lblSolicitation`: solicitation number (`SPE1C1-27-Q-0030`), link to the
    package (`RFQRec.aspx?sn=`) and/or RFQ PDF
    (`dibbs2.bsm.dla.mil/Downloads/RFQ/...PDF`), set-aside icon whose `alt`
    gives the type ("Small Business Set-Aside", "Unrestricted/Not Set Aside").
  - `lblStatus`: Open / Removed / … (text inside a coloured span).
  - `lblPr`: PR number and `QTY: <n>`.
  - `lblIssued`, `lblReturnBy`: `MM-DD-YYYY`.

## 3. Architecture

One Bun/TypeScript codebase, two processes, one Postgres (Docker Compose).

```
           ┌─────────────┐   HTML    ┌──────────────┐
 DIBBS ◀───│   worker    │──────────▶│  Postgres    │◀──── server (API + React)
           │ (scheduler, │  upserts  │ rfqs,        │           ▲
           │  sync jobs) │◀── polls ─│ sync_runs,   │           │ JSON
           └─────────────┘  queued   │ fsc_names    │      browser (React)
                              runs   └──────────────┘
```

- **server**: `Bun.serve` serving the React app (HTML import) and `/api/*`.
- **worker**: scheduled syncs, executes queued sync runs. Postgres is the
  only contract between server and worker.
- **CLI**: `bun run sync` enqueues a manual run (same path as the UI button).

Principles: IO at the edges, pure functions in the middle (parsing,
normalizing, query building); zod at every input boundary (env, HTTP, scraped
rows); branded types for identifiers; files ≤ ~300 lines.

### 3.1 Configuration (`src/config.ts`)

zod-validated env; the process refuses to start on invalid config.

| Var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — (required) | Postgres connection |
| `SYNC_WINDOW_DAYS` | `7` | Number of most recent DIBBS posting dates kept in sync |
| `SYNC_INTERVAL_MINUTES` | `60` | Scheduled sync interval |
| `DIBBS_REQUEST_DELAY_MS` | `1000` | Delay between DIBBS requests |
| `SYNC_STALE_AFTER_MINUTES` | `30` | A `running` run older than this is marked `failed` |
| `PORT` | `3000` | HTTP port |

The window counts *posting dates listed by DIBBS*, not calendar days.

### 3.2 Units

| Unit | Kind | Responsibility |
|---|---|---|
| `shared/brand.ts`, `shared/schemas.ts` | pure | Branded types and zod schemas shared by server and web |
| `domain/normalize.ts` | pure | NSN/part number, FSC, item name, set-aside, status, tech docs, dates |
| `dibbs/form.ts` | pure | Extract hidden ASP.NET fields; build consent/postback bodies |
| `dibbs/parse-records.ts` | pure | Records page HTML → `{ totalRecords, rows, hasNextPage }` |
| `dibbs/parse-dates.ts` | pure | Dates page HTML → posting dates (newest first) |
| `dibbs/parse-fsc.ts` | pure | FSC page HTML → `{ code, name }[]` |
| `dibbs/http.ts` | IO | Fetch with cookie jar, consent handling, delay, retries |
| `dibbs/client.ts` | IO | `listPostingDates()`, `fetchDay(date, onPage)`, `fetchFscNames()` |
| `db/migrate.ts` + `db/migrations/*.sql` | IO | Plain SQL migrations, run on start |
| `db/rfq-query.ts` | pure | `RfqQuery` → parameterized SQL (`{ text, values }`) for list and facets; built from one small predicate function per filter field |
| `db/rfq-repo.ts` | IO | Upsert rows, run list/facet queries |
| `db/sync-repo.ts` | IO | Enqueue, claim, progress, finish, reap stale runs |
| `worker/sync-job.ts` | orchestration | Runs one sync run end to end |
| `worker/index.ts` | IO | Poll loop + scheduler |
| `server/index.ts`, `server/routes/*.ts` | IO | HTTP routes, zod-parse input, call repos |
| `web/*` | UI | React app |

HTML parsing uses `cheerio`.

### 3.3 Domain types (branded)

`Nsn` (13 digits, stored undashed, shown `XXXX-XX-XXX-XXXX`), `PartNumber`,
`SolicitationNumber` (stored undashed, shown as on DIBBS), `PrNumber`, `Fsc`
(4 digits = first 4 of NSN; null for part numbers), `ItemName`, `IsoDate`,
`SyncRunId`.

Normalizers (all pure, unit tested):
- **item name**: nomenclature → collapse whitespace → upper-case → text
  before the first comma, or the whole string if no comma. The raw
  nomenclature is always kept and shown, so a bad heuristic is visible.
- **set-aside**: icon `alt` → `small_business | unrestricted | other(<raw>)`;
  unknown values are kept as `other` with the raw text, never dropped.
- **status**: `open | removed | cancelled | awarded | other(<raw>)`.
- **tech docs**: `available | spec_only | none`.

## 4. Data model

```sql
rfqs (
  id                  bigserial primary key,
  solicitation_number text not null,
  nsn                 text,          -- 13 digits, null if part number
  part_number         text,          -- when not an NSN
  item_key            text generated always as (coalesce(nsn, part_number)) stored,
  fsc                 text,          -- 4 digits or null
  nomenclature        text not null,
  item_name           text not null,
  mil_spec            boolean not null default false,
  quantity            integer,
  pr_number           text not null,
  status              text not null,
  status_raw          text not null,
  set_aside           text not null,
  set_aside_raw       text,
  tech_docs           text not null,
  posted_date         date not null, -- DIBBS posting date the row was listed under
  issue_date          date,
  return_by_date      date,
  dibbs_url           text not null, -- RFQRec.aspx?sn=
  pdf_url             text,
  tech_docs_url       text,
  first_seen_at       timestamptz not null,
  first_seen_run_id   bigint not null, -- sync run that first inserted the row (alerts hook, §12)
  last_seen_at        timestamptz not null,
  last_sync_run_id    bigint not null,
  search_text         text generated always as (
                        solicitation_number || ' ' || coalesce(nsn, '') || ' ' ||
                        coalesce(part_number, '') || ' ' || pr_number || ' ' ||
                        nomenclature) stored,
  constraint rfqs_one_item_id check (num_nonnulls(nsn, part_number) = 1),
  constraint rfqs_identity unique (solicitation_number, item_key, pr_number)
)

sync_runs (
  id            bigserial primary key,
  trigger       text not null,   -- scheduled | manual
  status        text not null,   -- queued | running | complete | partial | failed
  requested_at  timestamptz not null,
  started_at    timestamptz,
  finished_at   timestamptz,
  window_dates  date[],
  days          jsonb not null default '[]',
     -- [{ date, status: pending|running|complete|partial|failed,
     --    expected, parsed, page, pages, error? }]
  error         text
)

fsc_names (code text primary key, name text not null, updated_at timestamptz)
```

Upserts use `ON CONFLICT ON CONSTRAINT rfqs_identity` and update every
mutable column plus `last_seen_at`; `first_seen_at` is never overwritten.
Rows are never deleted; rows outside the current window stay in the DB but
are not shown by default.

### 4.1 Indexes

Sizing: the window holds ~8k rows, but history is kept, so the table grows
~1.2k rows per posting day (~300k/year). Indexes are chosen for that growth,
for the actual query shapes in §6, and to keep the per-sync upsert of ~8k
rows cheap.

| Index | Definition | Serves |
|---|---|---|
| `rfqs_identity` (unique) | `(solicitation_number, item_key, pr_number)` | Upsert conflict target; solicitation-number lookups (leading column) |
| `rfqs_window_default` | `(posted_date desc, return_by_date, id)` | Window filter (`posted_date = any(...)`, the most selective predicate once history grows) **and** the default sort, so `limit 50` reads index order without a sort step |
| `rfqs_return_by` | `(return_by_date, id)` | `closesWithinDays` / `returnBy` range and `returnBy` sort |
| `rfqs_quantity` | `(quantity, id)` | Qty range, Qty sort, numeric `q` exact match |
| `rfqs_fsc` | `(fsc)` | FSC filter (~hundreds of distinct values) |
| `rfqs_item_name` | `(item_name)` | Item-name filter (~thousands of distinct values) |
| `rfqs_search_trgm` | `gin (search_text gin_trgm_ops)` | `q` substring search (requires `create extension pg_trgm`) |

Deliberately **not** indexed:
- `status`, `set_aside`, `tech_docs`: a handful of values each, so the
  planner would not use a btree on them; they are applied as filters on top
  of the window index.
- `last_seen_at`, `last_sync_run_id`: they change on every sync. Keeping
  them unindexed lets Postgres do HOT updates (no index writes) for rows
  whose indexed columns did not change, which is most rows on a re-sync.
- `nomenclature`, `nsn`, `pr_number` individually: covered by the single
  trigram index on `search_text`, so one predicate replaces a 5-way `OR`
  across five GIN indexes.

Search details: NSN and solicitation are stored undashed. The query builder
matches `search_text ILIKE '%' || q || '%'` and, if `q` contains dashes,
also the dash-stripped `q`. Trigram indexes need ≥ 3 characters; for shorter
`q` the planner falls back to the window index, which is fine at window size.

Facets run `group by <column>` over the window-filtered rows (~8k), so
they use `rfqs_window_default` plus a hash aggregate; no per-facet index.

`sync_runs`:
- `sync_runs_one_active` — `unique ((true)) where status in ('queued',
  'running')`. At most one active run is enforced by the database, not by
  application timing.
- `sync_runs_latest` — `(id desc) where status in ('complete', 'partial',
  'failed')` for "last finished run".

Verification: a seed script inserts ~300k synthetic rows, and the plan
includes running `EXPLAIN ANALYZE` on the default list, a search, a qty
sort and the facet queries to confirm the indexes are used.

## 5. Sync

### 5.1 Triggers and queue

- `POST /api/sync`, `bun run sync` and the scheduler all insert a
  `sync_runs` row with `status='queued'` via `INSERT … ON CONFLICT DO
  NOTHING` against `sync_runs_one_active`, then select the active run. If a
  run is already `queued` or `running`, that run is returned instead (no
  stacking, race-free because the database enforces it).
- The worker polls every 3 s and claims one run with
  `UPDATE … WHERE id = (SELECT id … WHERE status='queued' ORDER BY id
  FOR UPDATE SKIP LOCKED LIMIT 1)`.
- On worker start and each poll: runs `running` longer than
  `SYNC_STALE_AFTER_MINUTES` are set to `failed` ("worker stopped").
- Every sync (scheduled or manual) re-fetches **all** days in the window,
  because statuses change after posting.

### 5.2 Run algorithm (`worker/sync-job.ts`)

1. Accept consent; `listPostingDates()`; take the newest `SYNC_WINDOW_DAYS`;
   store them in `window_dates`, `days` = pending.
2. Refresh `fsc_names` (failure is logged, not fatal).
3. For each date (sequentially): fetch page 1, then postback N → N+1 until
   no next page. After each page: upsert its rows, update day progress
   (`page/pages`, `parsed`). On consent redirect mid-way: re-consent and
   restart that day.
4. Day result: `complete` if `parsed == expected`; `partial` if fewer rows or
   some rows failed validation; `failed` on an unrecoverable error (after 3
   retries with backoff per request).
5. Run result: `complete` if all days complete; `failed` if no day
   completed; otherwise `partial`.

Rows failing zod validation are logged with the raw HTML snippet and counted;
they never silently disappear from the totals.

## 6. API

All JSON. Schemas in `shared/schemas.ts`. Errors:
`{ error: { code, message, issues? } }`; zod failures → `400`.

| Endpoint | Purpose |
|---|---|
| `GET /api/rfqs` | Search/filter/sort/page |
| `GET /api/rfqs/facets` | Option counts for the current query |
| `GET /api/meta` | Window config + dates, data-as-of, last sync summary, FSC names |
| `POST /api/sync` | Force sync → `202 { run }` (or the active run) |
| `GET /api/sync/latest`, `GET /api/sync/:id` | Run status + per-day progress |

### 6.1 `GET /api/rfqs` query

The query params parse into one canonical zod schema, `RfqQuery`
(`shared/schemas.ts`), with `version: 1`. It is plain serializable data: the
URL, the API and the SQL builder all use it, and a future saved search is
simply a stored `RfqQuery` (§12). Paging and sort live in a separate
`ListOptions` schema so the filter part stays reusable on its own.

| Param | Example | Notes |
|---|---|---|
| `q` | `cathet`, `8315-01-683`, `SPE1C1-27`, `57000` | Trigram/ILIKE over NSN (dashes ignored), part number, nomenclature, solicitation, PR; if `q` is a number (commas allowed, e.g. `57,000`) it also matches `quantity` exactly |
| `status` | `open` | Multi; default `open` |
| `setAside` | `small_business` | Multi |
| `fsc` | `8315,6515` | Multi |
| `itemName` | `PAD,STRAP` | Multi |
| `closesWithinDays` | `7` | Or `returnByFrom` / `returnByTo` (ISO dates) |
| `postedOn` | `2026-10-20` | Multi; default = current window dates |
| `qtyMin`, `qtyMax` | `100` | Inclusive quantity range |
| `techDocs` | `available` | `any` (default), `available`, `spec_only`, `none` |
| `sort` | `posted:desc` | `posted`, `returnBy`, `qty`, `nsn`, `solicitation`, `itemName`; `id` tiebreak |
| `page`, `pageSize` | `1`, `50` | `pageSize` ≤ 200 |

Default sort: `posted:desc, returnBy:asc`.

Response: `{ items: Rfq[], total, page, pageSize }` where `Rfq` contains the
normalized fields above plus
`links: { dibbs, pdf?, techDocs?, nsnHistory? }`.

### 6.2 Facets

`status`, `setAside`, `fsc`, `itemName`, `postedOn`, `techDocs`. Each facet
is computed with all filters applied **except its own**, queries run in
parallel. `fsc` and `itemName` return the top 200 options by count (the
selects are searchable).

## 7. UI

React + shadcn/ui + Tailwind via Bun HTML imports; TanStack Query
(`keepPreviousData`). All filter state lives in the URL query string
(shareable, back/forward work).

- **Header**: title; data badge ("Data as of 14:05 · 7/7 days ✓"),
  amber for `partial`, red for `failed`, tooltip lists per-day
  `parsed/expected`; **Sync now** button showing live progress while a run is
  active (polls `/api/sync/:id` every 2 s, refetches table on finish).
- **Search**: one box, debounced 200 ms; placeholder "Search NSN, item, solicitation, PR or quantity…".
- **Filter bar**: Status, Set-aside, FSC (code – name, searchable, counts),
  Item name (searchable, counts), Closes within (3/7/14 days or range),
  Posted (window dates), Quantity (min/max), Tech docs. Active filters as
  removable chips + "Clear all".
- **Table**: NSN (dashed, copy button, Mil-Spec tag) · Nomenclature (tooltip:
  "DIBBS truncates names — open the RFQ for the full description") · Qty ·
  Set-aside · Posted · Return by (date + relative "in 5d"; amber < 3 days) ·
  Status (non-open rows muted) · actions: **Open on DIBBS ↗**, PDF, NSN
  history. Sortable headers (incl. Qty, right-aligned with thousands separators), pagination with page size.
- **DoD notice hint**: on first outbound DIBBS click, a dismissible note
  ("DIBBS shows a DoD notice first — click OK and you'll land on this RFQ");
  "don't show again" stored in `localStorage` (wrapped in try/catch).
- **States**: skeleton rows; empty state with "Clear filters"; error banner
  with retry; empty DB → "No data yet" with Sync button.

Why these filters: set-aside = eligibility; FSC and item name = "is this my
kind of part" (broad and concrete); closes-within = time to prepare a quote;
quantity = capacity fit; tech docs = can I actually make it; posted = what's
new; status = nothing disappears silently.

## 8. Error handling summary

| Failure | Behaviour |
|---|---|
| Invalid env | Process exits with a readable zod error |
| DIBBS down / timeout | 3 retries with backoff, then day `failed`; run `partial`/`failed`; UI badge shows it |
| Consent expires mid-sync | Re-consent, restart current day |
| Layout change (parse finds 0 rows but count > 0) | Day `failed` with "parse mismatch"; old data kept |
| Invalid row | Logged + counted; day `partial` |
| Worker crash | Stale run reaped to `failed`; next run proceeds |
| Bad API input | `400` with zod issues |
| DB down | API `503`; UI error banner with retry |

## 9. Testing

`bun test`:
- **Parsers** against real saved DIBBS HTML fixtures (consent page, dates
  page, records page 1, a later page, a page with Removed rows, FSC page).
- **Normalizers**: NSN vs part number, FSC, item name edge cases
  (`OXYGEN MASK RECEIVE`, `ARMY,  BUCKLE,  CLIPS,  E`), set-aside, status.
- **Form builder**: consent and postback bodies.
- **Query builder**: filters → SQL/params, facet exclusion rule, numeric `q`
  also matching quantity, qty range, qty sort.
- **Sync job**: with a fake DIBBS client (complete, partial, failed paths).
- **Integration**: repos + API against dockerized Postgres.

## 10. Out of scope (MLP)

Saved searches / alerts (designed for in §12, not built), RFQ detail drawer, scraping per-solicitation detail
pages, CSV export, auth, deployment.

## 11. Risks

- DIBBS markup or consent flow changes → parser fixtures + count check make
  it loud, not silent.
- Sequential paging means a full window sync is ~170 requests (~3–4 min at
  1 req/s). Acceptable; progress is visible.
- Being polite to DIBBS: fixed delay, single worker, no parallel requests.

## 12. Future: saved searches and alerts (designed for, not built)

Goal: a vendor saves queries they care about (e.g. specific NSNs/part
numbers, "FSC 5340 + small business + qty ≥ 100") and is notified when a
sync finds new or changed matching RFQs.

### 12.1 Hooks included in the MLP

These are cheap now and expensive to retrofit:

1. **`RfqQuery` is the single, versioned, serializable filter object**
   (§6.1). A saved search stores it as JSON; an alert evaluates it with the
   same `db/rfq-query.ts` builder the list endpoint uses, so results match
   what the user sees in the UI.
2. **One predicate per filter field** in the query builder. Adding a filter
   (e.g. exact `nsn` / `partNumber` lists for watchlists) means adding one
   schema field and one predicate, with no change to callers.
3. **`rfqs.first_seen_run_id`** records which sync run inserted a row.
   "New since the last check" becomes `first_seen_run_id > <watermark>`,
   with no clock skew or timestamp edge cases.
4. **`sync_runs` is a durable event log.** A finished run (`complete` or
   `partial`, with `finished_at`) is the trigger an alert evaluator needs;
   it can poll for finished runs past its watermark, the same way the
   worker polls for queued runs. No in-process event bus is needed.

### 12.2 Sketch of the later feature (not migrated)

```sql
saved_searches (
  id, owner_id,                  -- requires auth, out of scope for MLP
  name, query jsonb,             -- RfqQuery, validated by zod on read
  alert_enabled boolean, channel text,  -- email | webhook
  last_evaluated_run_id bigint,  -- watermark
  created_at, updated_at
)
alert_hits (saved_search_id, rfq_id, sync_run_id, kind /* new|changed */,
            notified_at, primary key (saved_search_id, rfq_id, kind))
```

Evaluator: for each finished run past the watermark, run each enabled saved
search's `RfqQuery` plus `first_seen_run_id > watermark`, insert
`alert_hits` (the primary key makes it idempotent), send notifications,
advance the watermark.

Open points for that design (not decided now):
- **"Changed" alerts** (e.g. return-by extended, status → Removed) need a
  `changed_run_id` column set only when meaningful fields change.
- **Large watchlists** (thousands of NSNs) fit better as a
  `watch_items(saved_search_id, item_key)` table joined on `rfqs.item_key`,
  which would then need its own index on `item_key`.
- **Indexes**: likely `rfqs(first_seen_run_id)`; added with the feature, not
  now, to keep sync writes cheap.
- **Users and auth**, plus a delivery channel (email or webhook).
