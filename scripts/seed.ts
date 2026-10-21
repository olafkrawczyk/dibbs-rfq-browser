// Inserts synthetic RFQs for index/performance checks: bun scripts/seed.ts <count>
// Use a scratch database (DATABASE_URL=.../rfq_perf), never the real one.
import { getConfig } from "../src/config";
import { createSql } from "../src/db/sql";
import { migrate } from "../src/db/migrate";
import { upsertRfqs } from "../src/db/rfq-repo";
import { enqueueRun, finishRun, setWindow } from "../src/db/sync-repo";
import { ScrapedRfq } from "../src/dibbs/scraped";
import type { IsoDate } from "../src/shared/brand";

const count = Number(process.argv[2] ?? 300_000);
const DAYS = 250;
const BATCH = 1000;
const FSCS = ["5305", "5310", "5330", "5340", "4810", "6515", "6532", "8315", "8405", "2530", "3110", "5935", "5961", "6145", "4730"];
const NOUNS = ["VALVE", "SEAT", "PAD", "CATHETER", "STRAP", "BEARING", "SEAL", "GASKET", "SCREW", "BOLT", "NUT", "CONNECTOR", "COVER", "TUBE", "BRACKET", "SPRING", "WASHER", "FILTER", "HOSE", "CLAMP"];
const SET_ASIDES = ["unrestricted", "unrestricted", "unrestricted", "small_business", "sdvosb", "wosb"] as const;
const pick = <T>(xs: readonly T[], i: number) => xs[i % xs.length]!;

// Weekday posting dates going back from 2026-10-20.
const dates: IsoDate[] = [];
for (let d = new Date("2026-10-20T00:00:00Z"); dates.length < DAYS; d.setUTCDate(d.getUTCDate() - 1)) {
  if (d.getUTCDay() % 6 !== 0) dates.push(d.toISOString().slice(0, 10) as IsoDate);
}

function row(i: number): ScrapedRfq {
  const fsc = pick(FSCS, i * 7);
  const noun = pick(NOUNS, i * 13);
  const posted = dates[i % DAYS]!;
  const returnBy = new Date(`${posted}T00:00:00Z`);
  returnBy.setUTCDate(returnBy.getUTCDate() + 10 + (i % 40));
  const sol = `SPE${String(i).padStart(10, "0")}`;
  return ScrapedRfq.parse({
    solicitationNumber: sol, nsn: `${fsc}${String(i).padStart(9, "0")}`, partNumber: null, fsc,
    nomenclature: `${noun}, ITEM ${i % 997}`, itemName: noun, milSpec: i % 11 === 0,
    quantity: i % 17 === 0 ? null : 1 + ((i * 37) % 50_000), prNumber: String(7_000_000_000 + i),
    status: i % 25 === 0 ? "removed" : "open", statusRaw: i % 25 === 0 ? "Removed" : "Open",
    setAside: pick(SET_ASIDES, i), setAsideRaw: null, techDocs: pick(["none", "available", "spec_only"] as const, i),
    postedDate: posted, issueDate: posted, returnByDate: returnBy.toISOString().slice(0, 10),
    dibbsUrl: `https://www.dibbs.bsm.dla.mil/RFQ/RFQRec.aspx?sn=${sol}`, pdfUrl: null, techDocsUrl: null,
  });
}

const sql = createSql(getConfig().databaseUrl);
await migrate(sql);
const run = await enqueueRun(sql, "manual");
const started = performance.now();
for (let start = 0; start < count; start += BATCH) {
  const rows = Array.from({ length: Math.min(BATCH, count - start) }, (_, k) => row(start + k));
  await upsertRfqs(sql, rows, run.id);
  if ((start / BATCH) % 50 === 0) console.log(`${start + rows.length}/${count}`);
}
await setWindow(sql, run.id, dates.slice(0, 7), []);
await finishRun(sql, run.id, "complete");
await sql`analyze rfqs`;
console.log(`Seeded ${count} rows in ${((performance.now() - started) / 1000).toFixed(1)}s`);
await sql.close();
