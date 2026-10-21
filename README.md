# DIBBS RFQ Browser

A fast, focused way to scan the Requests for Quotation (RFQs) that the Defense Logistics Agency posts
to [DIBBS](https://www.dibbs.bsm.dla.mil/RFQ/) every weekday. It syncs the most recent posting days into
Postgres, then lets a vendor search, filter and sort them, and jump straight to the solicitation's PDF or
its page on DIBBS.

Design: [`docs/superpowers/specs/2026-10-21-dibbs-rfq-browser-design.md`](docs/superpowers/specs/2026-10-21-dibbs-rfq-browser-design.md)

## Run it

Requires [Bun](https://bun.com) ≥ 1.4 and Docker.

```bash
bun install
cp .env.example .env        # adjust if needed
bun run db:up               # Postgres 17 in Docker (databases rfq + rfq_test)
bun run migrate
bun run worker              # syncs on start and every SYNC_INTERVAL_MINUTES
bun run dev                 # http://localhost:3000
```

Force a sync from the terminal with `bun run sync` (follows progress; `--no-wait` just queues it), or with
the **Sync now** button in the UI. Tests: `bun test`. Types: `bun check`.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | — | Postgres connection (required) |
| `SYNC_WINDOW_DAYS` | `7` | How many of the most recent DIBBS posting dates to keep in sync |
| `SYNC_INTERVAL_MINUTES` | `60` | Scheduled sync interval |
| `DIBBS_REQUEST_DELAY_MS` | `1000` | Pause before every DIBBS request (one request at a time) |
| `SYNC_STALE_AFTER_MINUTES` | `30` | A run stuck in `running` longer than this is marked failed |
| `SYNC_MAX_PAGES_PER_DAY` | unset | Optional dev/demo cap on pages (50 rows each) per posting day |
| `PORT` | `3000` | HTTP port |
| `TEST_DATABASE_URL` | — | Database the test suite wipes and migrates |

## How it works

```
 DIBBS ◀── worker (scheduler + sync job) ──▶ Postgres ◀── server (Bun.serve API + React) ◀── browser
```

- **One codebase, two processes.** The worker and the server share nothing but Postgres. A forced sync
  is a `queued` row in `sync_runs`; the worker polls for it. A partial unique index guarantees at most
  one queued/running sync, so double clicks never stack scrapes.
- **Scraping DIBBS.** Every DIBBS page sits behind a DoD consent notice (an ASP.NET form). The scraper
  accepts it, keeps the session cookies, and pages through each day's table with ASP.NET postbacks,
  strictly in order (DIBBS only accepts page links rendered on the current page).
- **Trust.** Each day's parsed rows are checked against DIBBS's own "Records Found". Days end `complete`,
  `partial` or `failed`, and the UI shows it. Rows that fail validation are logged and counted, never
  silently dropped. Removed or cancelled RFQs keep their status instead of disappearing.
- **Pure core, IO at the edges.** Parsers, normalizers, the SQL query builder and URL state are pure
  functions with zod schemas and branded IDs (`Nsn`, `SolicitationNumber`, `IsoDate`, …). Parsers are
  tested against real saved DIBBS HTML in `tests/fixtures`.
- **Fast queries.** Indexes were chosen for the actual query shapes (spec §4.1) and checked with
  `scripts/seed.ts` + `scripts/explain.ts`: with 300k rows, every list, search, sort and facet query runs
  in under 15 ms.

## Filters, and why

| Filter | Why a vendor cares |
|---|---|
| **Set-aside** (Small Business, SDVOSB, WOSB, HUBZone, 8(a), Unrestricted) | Eligibility: no point reading an RFQ you cannot legally bid on |
| **FSC** (Federal Supply Class, with names) | Vendors specialize by supply class: "is this my kind of part?" |
| **Item name** (noun from the nomenclature, e.g. `VALVE`, `PAD`) | The concrete thing being bought, finer than FSC |
| **Closes within** | Time left to prepare a quote |
| **Quantity** range (also sortable and searchable) | Fit with production capacity |
| **Tech docs** (available / spec only / none) | Without drawings you often cannot make the part |
| **Posted** date | What is new today versus earlier in the window |
| **Status** (Open by default) | Nothing disappears silently |

Search covers NSN (with or without dashes), part number, nomenclature, solicitation and PR number; a plain
number also matches quantity exactly.

## Good to know

- **DoD notice on DIBBS links.** DIBBS shows its consent notice once per browser session, and PDFs live on
  a second host with its own notice. Click OK and you land on the RFQ. Links go straight to DIBBS; the app
  does not proxy DIBBS content.
- **A full sync is slow** because DIBBS is: about 10 s per 50-row page, and a busy day has 40+ pages. Use
  `SYNC_MAX_PAGES_PER_DAY` for demos.
- **Not built yet** (designed for, spec §12): saved searches and alerts for specific part numbers or
  queries. The versioned `RfqQuery` filter object and `rfqs.first_seen_run_id` exist so these can be added
  without a migration of existing data.
