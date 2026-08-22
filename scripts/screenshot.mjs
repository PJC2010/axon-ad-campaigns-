// Capture page screenshots against a running dev/prod server.
// Usage: node scripts/screenshot.mjs [baseUrl] [path ...]
//   node scripts/screenshot.mjs                        -> all pages against http://localhost:3000
//   node scripts/screenshot.mjs http://localhost:3000 /campaigns
import { chromium } from "playwright-core";
import fs from "node:fs";

const EXECUTABLE = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const args = process.argv.slice(2);
const base = args[0]?.startsWith("http") ? args.shift() : "http://localhost:3000";
const paths = args.length
  ? args
  : ["/", "/campaigns", "/campaigns/new", "/creatives", "/import", "/recommendations", "/settings"];

fs.mkdirSync(".screenshots", { recursive: true });

const browser = await chromium.launch({ executablePath: EXECUTABLE });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

for (const p of paths) {
  const name = p === "/" ? "dashboard" : p.replace(/^\//, "").replace(/[/?=&]+/g, "-");
  await page.goto(base + p, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `.screenshots/${name}.png`, fullPage: true });
  console.log(`captured ${p} -> .screenshots/${name}.png`);
}

await browser.close();
