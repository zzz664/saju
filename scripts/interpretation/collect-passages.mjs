// Collects public-domain classical passages from Wikisource into
// src/infrastructure/interpretation/data/passages.json. No LLM, no key.
//
//   node scripts/interpretation/collect-passages.mjs            # fill missing slots
//   node scripts/interpretation/collect-passages.mjs --dry-run  # report only
//   node scripts/interpretation/collect-passages.mjs --only src.qtbj.gap-in
//
// The scaffold (conditions → locators) lives in src/infrastructure/interpretation/scaffold.ts.
// A heading that cannot be found is reported and left null; nothing is guessed or typed by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  boundPassage,
  digestText,
  extractSection,
  titleFromUrl,
  wikisourceApiUrl,
} from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dataFile = path.join(root, "src/infrastructure/interpretation/data/passages.json");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

if (process.env.NODE_ENV === "production" || process.env.CI) {
  console.error("Collector runs only in a developer environment.");
  process.exit(1);
}

async function loadScaffold() {
  // The scaffold is TypeScript; load it through tsx so there is one definition.
  const { pathToFileURL } = await import("node:url");
  const tsx = await import("tsx/esm/api");
  const unregister = tsx.register();
  try {
    const loaded = await import(
      pathToFileURL(path.join(root, "src/infrastructure/interpretation/scaffold.ts")).href
    );
    return loaded.buildScaffold();
  } finally {
    unregister();
  }
}

async function fetchWikitext(title) {
  const response = await fetch(wikisourceApiUrl(title), {
    headers: { "user-agent": "saju-interpretation-collector/1.0 (local developer script)" },
  });
  if (!response.ok) throw new Error(`Wikisource ${response.status}`);
  const body = await response.json();
  const wikitext = body?.parse?.wikitext;
  if (typeof wikitext !== "string") throw new Error("Wikisource response had no wikitext");
  return wikitext;
}

async function main() {
  const scaffold = await loadScaffold();
  const file = JSON.parse(readFileSync(dataFile, "utf8"));
  const pages = new Map();
  const report = { collected: 0, skipped: 0, missing: [], errors: [] };
  for (const entry of scaffold) {
    const { sourceId, url, locator } = entry.source;
    if (only && only !== sourceId) continue;
    if (file.passages[sourceId]) {
      report.skipped++;
      continue;
    }
    const title = titleFromUrl(url);
    try {
      if (!pages.has(title)) pages.set(title, await fetchWikitext(title));
      const section = extractSection(pages.get(title), locator);
      if (!section) {
        report.missing.push(`${sourceId} (${title} › ${locator})`);
        continue;
      }
      const passage = boundPassage(section);
      file.passages[sourceId] = {
        passage,
        retrievedAt: new Date().toISOString(),
        passageDigest: digestText(passage),
      };
      report.collected++;
    } catch (error) {
      report.errors.push(`${sourceId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  if (!dryRun && report.collected > 0)
    writeFileSync(dataFile, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(
    JSON.stringify(
      {
        dryRun,
        collected: report.collected,
        skipped: report.skipped,
        missing: report.missing.length,
        errors: report.errors.length,
      },
      null,
      2,
    ),
  );
  for (const line of report.missing) console.log("missing  " + line);
  for (const line of report.errors) console.log("error    " + line);
  if (report.errors.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Collector failed.");
  process.exitCode = 1;
});
