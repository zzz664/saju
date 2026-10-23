// Collects public-domain classical passages from Wikisource into
// src/infrastructure/interpretation/data/passages.json. No LLM, no key.
//
//   node scripts/interpretation/collect-passages.mjs            # fill missing slots
//   node scripts/interpretation/collect-passages.mjs --dry-run  # report only
//   node scripts/interpretation/collect-passages.mjs --only src.qtbj.gap-in
//   node scripts/interpretation/collect-passages.mjs --dry-run --inspect        # show page structure
//   node scripts/interpretation/collect-passages.mjs --dry-run --dump tmp/wikisource  # save page text
//
// The scaffold (conditions → locators) lives in src/infrastructure/interpretation/scaffold.ts.
// A locator that cannot be found is reported and left null; nothing is guessed or typed by hand.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  boundPassage,
  candidateLines,
  createWikitextLoader,
  pageTextOf,
  digestText,
  htmlToText,
  listHeadings,
  locateInPage,
  titleFromUrl,
  WikisourcePageError,
} from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const dataFile = path.join(root, "src/infrastructure/interpretation/data/passages.json");
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const inspect = args.has("--inspect");
const onlyIndex = process.argv.indexOf("--only");
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
const dumpIndex = process.argv.indexOf("--dump");
const dumpDir =
  dumpIndex >= 0 ? path.resolve(process.argv[dumpIndex + 1] ?? "tmp/wikisource") : null;

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
  const report = {
    collected: 0,
    skipped: 0,
    missing: [],
    relocated: [],
    adjusted: [],
    pageErrors: new Map(),
    unavailable: 0,
  };
  const pages = new Map(); // title -> page, for --inspect / --dump
  const missingByTitle = new Map(); // title -> locators, for --inspect candidates
  async function loadPage(title) {
    try {
      const page = await loader.load(title);
      pages.set(title, page);
      return page;
    } catch (error) {
      const code = error instanceof WikisourcePageError ? error.code : "FETCH_FAILED";
      report.pageErrors.set(title, code);
      return null;
    }
  }
  for (const entry of scaffold) {
    const { sourceId, url, locator } = entry.source;
    if (only && only !== sourceId) continue;
    if (file.passages[sourceId]) {
      report.skipped++;
      continue;
    }
    const title = titleFromUrl(url);
    const page = await loadPage(title);
    if (!page) {
      report.unavailable++;
      continue;
    }
    // Each `·` part is resolved on its own: 三命通會 spreads 論正官 / 論印綬 over different 卷.
    const parts = locator.split("·").map((part) => part.trim());
    const found = [];
    const foundTitles = new Set();
    for (const part of parts) {
      let hit = locateInPage(page, part);
      let foundIn = title;
      for (const sibling of siblingTitles(title)) {
        if (hit) break;
        const other = await loadPage(sibling);
        if (!other) continue;
        hit = locateInPage(other, part);
        if (hit) foundIn = sibling;
      }
      if (!hit) break;
      found.push(hit);
      foundTitles.add(foundIn);
    }
    if (found.length !== parts.length) {
      report.missing.push(`${sourceId} (${title} › ${locator})`);
      if (!missingByTitle.has(title)) missingByTitle.set(title, []);
      missingByTitle.get(title).push(locator);
      continue;
    }
    const passage = boundPassage(found.map((hit) => hit.passage).join("\n\n"));
    const record = {
      passage,
      retrievedAt: new Date().toISOString(),
      passageDigest: digestText(passage),
    };
    // Found on a sibling page only: keep the real page url with the passage and ask for a scaffold fix.
    if (foundTitles.size === 1 && !foundTitles.has(title)) {
      const [actual] = foundTitles;
      record.url = WIKI + encodeURIComponent(actual);
      report.relocated.push(
        `${sourceId}: ${title} → ${actual} (scaffold.ts url을 이 제목으로 고친다)`,
      );
    }
    // Matched a `|` alternative or fell back to the season section: record the locator that applies.
    const actualLocator = found.map((hit) => hit.locator).join("·");
    if (actualLocator !== locator) {
      record.locator = actualLocator;
      report.adjusted.push(
        `${sourceId}: ${locator} → ${actualLocator} (${found.map((hit) => hit.via).join("·")})`,
      );
    }
    file.passages[sourceId] = record;
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
        relocated: report.relocated.length,
        adjusted: report.adjusted.length,
        pagesFailed: report.pageErrors.size,
        slotsWithoutPage: report.unavailable,
      },
      null,
      2,
    ),
  );
  for (const line of report.missing) console.log("missing  " + line);
  for (const line of report.relocated) console.log("moved    " + line);
  for (const line of report.adjusted) console.log("adjusted " + line);
  if (inspect)
    for (const [title, locators] of missingByTitle) {
      const page = pages.get(title);
      if (!page) continue;
      const text = pageTextOf(page);
      for (const locator of locators) {
        const lines = candidateLines(text, locator);
        console.log(`near     ${title} › ${locator}: ${lines.length ? "" : "(후보 줄 없음)"}`);
        for (const line of lines) console.log(`         ${line}`);
      }
    }
  for (const [title, code] of report.pageErrors)
    console.log(
      `page     ${title}: ${code}` +
        (code === "MISSING_TITLE"
          ? " — 이 제목의 페이지가 없다. scaffold.ts의 url을 실제 Wikisource 제목으로 고친다."
          : code === "RATE_LIMITED"
            ? " — 요청 제한. 몇 분 뒤 다시 실행한다(페이지당 1회만 요청한다)."
            : ""),
    );
  if (inspect || dumpDir) describePages(pages, dumpDir);
  if (report.missing.length && !inspect)
    console.log(
      "hint     locator가 하나도 안 맞으면 --dry-run --inspect 로 페이지의 소제목·본문 모양을 확인하고 scaffold.ts의 locator를 고친다.",
    );
  if (report.pageErrors.size) process.exitCode = 1;
}

const WIKI = "https://zh.wikisource.org/wiki/";
const VOLUMES = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

/**
 * 三命通會 is split into 卷 pages and the scaffold may name the wrong one. For "三命通會/卷五"
 * the neighbours 卷六, 卷四, 卷七, 卷三 are tried in that order; other titles have no siblings.
 */
function siblingTitles(title) {
  const match = title.match(/^(.*\/卷)(.+)$/);
  if (!match) return [];
  const index = VOLUMES.indexOf(match[2]);
  if (index < 0) return [];
  return [index + 1, index - 1, index + 2, index - 2]
    .filter((at) => at >= 0 && at < VOLUMES.length)
    .map((at) => `${match[1]}${VOLUMES[at]}`);
}

/** Print what each page actually looks like so locators can be fixed without guessing. */
function describePages(pages, dir) {
  if (dir) mkdirSync(dir, { recursive: true });
  for (const [title, page] of pages) {
    const rendered = page.text ? htmlToText(page.text) : "";
    const transcluded = /<pages\s|\{\{:/.test(page.wikitext);
    const headings = listHeadings(rendered || page.wikitext);
    console.log(
      `inspect  ${title}: wikitext ${page.wikitext.length}자, rendered ${rendered.length}자, headings ${headings.length}` +
        (transcluded ? ", 하위 페이지/ProofreadPage 전사 포함(렌더링 본문 사용)" : ""),
    );
    for (const heading of headings) console.log(`         ${heading}`);
    const sample = (rendered || page.wikitext).replace(/\s+/g, " ").slice(0, 240);
    console.log(`         본문 앞부분: ${sample}`);
    if (dir) {
      const base = path.join(dir, title.replace(/[\\/:*?"<>|]/g, "_"));
      writeFileSync(`${base}.wikitext.txt`, page.wikitext, "utf8");
      if (rendered) writeFileSync(`${base}.rendered.txt`, rendered, "utf8");
      console.log(`         저장: ${base}.{wikitext,rendered}.txt`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Collector failed.");
  process.exitCode = 1;
});
