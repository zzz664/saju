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
  createWikitextLoader,
  digestText,
  extractSection,
  titleFromUrl,
  WikisourcePageError,
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

async function main() {
  const scaffold = await loadScaffold();
  const file = JSON.parse(readFileSync(dataFile, "utf8"));
  // One request per page title (3 pages for the full scaffold), paced to respect Wikisource.
  const loader = createWikitextLoader();
  const report = { collected: 0, skipped: 0, missing: [], pageErrors: new Map(), unavailable: 0 };
  for (const entry of scaffold) {
    const { sourceId, url, locator } = entry.source;
    if (only && only !== sourceId) continue;
    if (file.passages[sourceId]) {
      report.skipped++;
      continue;
    }
    const title = titleFromUrl(url);
    let wikitext;
    try {
      wikitext = await loader.load(title);
    } catch (error) {
      const code = error instanceof WikisourcePageError ? error.code : "FETCH_FAILED";
      report.pageErrors.set(title, code);
      report.unavailable++;
      continue;
    }
    const section = extractSection(wikitext, locator);
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
  }
  if (!dryRun && report.collected > 0)
    writeFileSync(dataFile, JSON.stringify(file, null, 2) + "\n", "utf8");
  console.log(
    JSON.stringify(
      {
        dryRun,
        httpRequests: loader.requests,
        collected: report.collected,
        skipped: report.skipped,
        missing: report.missing.length,
        pagesFailed: report.pageErrors.size,
        slotsWithoutPage: report.unavailable,
      },
      null,
      2,
    ),
  );
  for (const line of report.missing) console.log("missing  " + line);
  for (const [title, code] of report.pageErrors)
    console.log(
      `page     ${title}: ${code}` +
        (code === "MISSING_TITLE"
          ? " — 이 제목의 페이지가 없다. scaffold.ts의 url을 실제 Wikisource 제목으로 고친다."
          : code === "RATE_LIMITED"
            ? " — 요청 제한. 몇 분 뒤 다시 실행한다(페이지당 1회만 요청한다)."
            : ""),
    );
  if (report.pageErrors.size) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Collector failed.");
  process.exitCode = 1;
});
