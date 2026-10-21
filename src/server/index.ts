import index from "../web/index.html";
import { getConfig } from "../config";
import { createSql } from "../db/sql";
import { migrate } from "../db/migrate";
import { createServer } from "./app";

const config = getConfig();
const sql = createSql(config.databaseUrl);
await migrate(sql);

const server = createServer({ sql, config, index, development: process.env.NODE_ENV !== "production" });
console.log(`DIBBS RFQ Browser on ${server.url}`);
