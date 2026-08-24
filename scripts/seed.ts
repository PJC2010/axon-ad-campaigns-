// CLI entry: npm run seed [-- --force]
import { openDb } from "../src/lib/db/open";
import { DB_PATH, UPLOADS_DIR } from "../src/lib/env";
import { hasAnyData, seed } from "../src/lib/seed";

const force = process.argv.includes("--force");
const db = openDb(DB_PATH);

if (hasAnyData(db) && !force) {
  console.error(
    "The database already has campaigns. Re-run with --force to add seed data anyway,\n" +
      "or delete data/app.db for a clean slate.",
  );
  process.exit(1);
}

const result = seed(db, UPLOADS_DIR);
console.log(
  `Seeded ${result.campaigns} campaigns, ${result.adSets} ad sets, ${result.ads} ads, ` +
    `${result.creatives} creatives, ${result.metricRows} daily metric rows (${result.from} to ${result.to}).`,
);
