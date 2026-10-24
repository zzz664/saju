import { createHash } from "node:crypto";

/** Pure helpers shared by the collector and the summarizer; tested without network. */
export function digestText(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Strip MediaWiki markup to plain text. Conservative: keeps CJK prose, drops templates/links/tags. */
export function stripWikitext(source) {
  return source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/'{2,}/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HEADING = /^(={2,6})\s*(.*?)\s*\1\s*$/;

/**
 * Convert the rendered page HTML (action=parse prop=text) into the same line-oriented shape as
 * wikitext: `== heading ==` lines and one paragraph per line. Rendered HTML resolves transcluded
 * subpages and ProofreadPage `<pages>` blocks that the raw wikitext does not contain.
 */
export function htmlToText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<span class="mw-editsection">[\s\S]*?<\/span>/g, "")
    .replace(/<h([2-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => {
      const bar = "=".repeat(Number(level));
      return `\n${bar} ${inner.replace(/<[^>]+>/g, "").trim()} ${bar}\n`;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|blockquote|section|div)>/gi, "\n\n") // paragraph boundary = blank line
    .replace(/<\/(li|tr|dd|dt|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t　]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Headings of a page as plain text, in order — used by `--inspect` to show what exists. */
export function listHeadings(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.match(HEADING))
    .filter(Boolean)
    .map((match) => `${"#".repeat(match[1].length - 1)} ${stripWikitext(match[2])}`);
}

/** Raw body lines under the first heading that equals or starts with `heading`, else null. */
function headingBody(lines, heading) {
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(HEADING);
    // Exact or prefix match only: "甲木" must not pick the "三春甲木" chapter heading.
    if (!match || !stripWikitext(match[2]).startsWith(heading)) continue;
    const level = match[1].length;
    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const next = lines[cursor].match(HEADING);
      if (next && next[1].length <= level) break;
      body.push(lines[cursor]);
    }
    return body;
  }
  return null;
}

function extractHeadingSection(lines, locator) {
  const body = headingBody(lines, locator);
  if (!body) return null;
  const text = stripWikitext(body.join("\n"));
  return text.length ? text : null;
}

const MONTHS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
const MONTH_NUMERAL = /^[正一二三四五六七八九十]$/;
const SEASONS = ["三春", "三夏", "三秋", "三冬"];
const monthPrefixPattern = (subject) =>
  new RegExp(`^([正一二三四五六七八九十、，\\s月]{1,16}月)${subject}`);

/**
 * Month numbers named in a prefix such as "五六月", "十一、十二月" or "正、二月". In a glued run a
 * bare 一/二 right after a 十-token means 十一/十二 ("十一二月" = 11, 12).
 */
export function monthsInPrefix(prefix) {
  const months = [];
  const chars = [...prefix.replace(/月/g, "")].filter((char) => MONTH_NUMERAL.test(char));
  for (let index = 0; index < chars.length; index++) {
    const char = chars[index];
    if (char === "十") {
      const next = chars[index + 1];
      if (next === "一" || next === "二") {
        months.push(next === "一" ? 11 : 12);
        index++;
      } else months.push(10);
      continue;
    }
    const value = MONTHS.indexOf(char) + 1;
    const previous = months[months.length - 1];
    if (value >= 1 && value <= 2 && previous >= 10) months.push(10 + value);
    else if (value > 0) months.push(value);
  }
  return months;
}

/**
 * "五月甲木" also matches a paragraph that starts "五六月甲木，…" or "四、五、六月甲木，…":
 * 窮通寶鑑 groups months whose advice is shared. Inside the subject's own season section
 * ("三夏丁火") the text is terser still: "六月之丁，…", "十一二月嚴寒冰凍，…" (no subject at all),
 * "冬月之木，…" (the whole season). `monthsOf(line, scoped)` reads those forms only when `scoped`.
 * Returns null for non-month locators.
 */
export function monthLocator(locator) {
  const match = locator.match(/^(正|二|三|四|五|六|七|八|九|十一|十二|十)月(.+)$/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]) + 1;
  const subject = match[2];
  const stem = subject.slice(0, 1);
  const element = subject.slice(1);
  const strict = monthPrefixPattern(subject);
  const scopedPattern = new RegExp(
    `^((?:[正一二三四五六七八九十、，\\s月]{1,16}|[春夏秋冬])月)(?:之)?(?:${stem}(?:${element})?)?`,
  );
  return {
    month,
    subject,
    season: SEASONS[Math.floor((month - 1) / 3)] + subject,
    /** Months a line's prefix names, or null when the line does not open a month paragraph. */
    monthsOf(line, scoped = false) {
      const found = line.match(scoped ? scopedPattern : strict);
      if (!found) return null;
      const seasonAt = "春夏秋冬".indexOf(found[1][0]);
      if (seasonAt >= 0) return [1, 2, 3].map((offset) => seasonAt * 3 + offset);
      return monthsInPrefix(found[1]);
    },
    test(line, scoped = false) {
      return Boolean(this.monthsOf(line, scoped)?.includes(month));
    },
    /** Like `test`, but a season-wide opener ("冬月之木") does not count: the month must be named. */
    exact(line, scoped = false) {
      return this.test(line, scoped) && !/^[春夏秋冬]月/.test(line);
    },
  };
}

/** Example charts ("時日月年" then a row of four stems and four branches) are not prose: drop them. */
const CHART_LINE = /^(時日月年|[甲乙丙丁戊己庚辛壬癸]{4}|[子丑寅卯辰巳午未申酉戌亥]{4})$/;
const plainLines = (lines) =>
  lines.map((line) => {
    if (HEADING.test(line)) return "";
    const plain = stripWikitext(line);
    return CHART_LINE.test(plain) ? "" : plain;
  });

/** A month block runs from its opening paragraph to the next month paragraph or a heading. */
function monthBlock(lines, plain, index, grouped, scoped) {
  const body = [];
  for (let cursor = index; cursor < lines.length; cursor++) {
    if (HEADING.test(lines[cursor])) break;
    if (cursor > index && grouped.monthsOf(plain[cursor], scoped)) break;
    body.push(plain[cursor]);
  }
  const text = body
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length ? text : null;
}

/**
 * Many classical texts on Wikisource have no per-month headings: "正月甲木，…" is the first clause
 * of a paragraph. For a month locator, look inside the subject's season section first (terse forms
 * allowed), then page-wide with the full "N月+subject" form. Otherwise take the paragraph that starts
 * with the locator; as a last resort a prose line (≥ 20 characters, so link lists are skipped)
 * containing it. A non-month paragraph ends at the first blank line.
 */
function extractParagraph(lines, locator) {
  const grouped = monthLocator(locator);
  if (grouped) {
    const season = headingBody(lines, grouped.season);
    if (season) {
      const plain = plainLines(season);
      // Every paragraph naming the month ("正月甲木，…" and the shared "正二月甲木，…") is part of
      // the slot, in order. Only when none names it does a season-wide opener ("春月之木") count.
      const exact = plain.flatMap((line, at) => (grouped.exact(line, true) ? [at] : []));
      const starts = exact.length
        ? exact
        : plain.flatMap((line, at) => (grouped.test(line, true) ? [at] : []));
      if (starts.length) {
        const blocks = starts
          .map((at) => monthBlock(season, plain, at, grouped, true))
          .filter(Boolean);
        return blocks.length ? blocks.join("\n\n") : null;
      }
    }
  }
  const plain = plainLines(lines);
  let index = plain.findIndex((line) => line.startsWith(locator));
  if (index < 0 && grouped) index = plain.findIndex((line) => grouped.test(line));
  if (index >= 0 && grouped) return monthBlock(lines, plain, index, grouped, false);
  if (index < 0) index = plain.findIndex((line) => line.length >= 20 && line.includes(locator));
  if (index < 0) return null;
  const body = [];
  for (let cursor = index; cursor < lines.length && plain[cursor].length; cursor++) {
    if (HEADING.test(lines[cursor])) break;
    body.push(plain[cursor]);
  }
  const text = body.join("\n").trim();
  return text.length ? text : null;
}

/**
 * 窮通寶鑑 writes some chapters per season only ("三夏己土，…" with no month paragraphs). When a
 * month has no paragraph of its own, use its season section minus the blocks that belong to other
 * months of the same subject. Returns null when the season heading is absent or nothing remains.
 */
function extractSeason(lines, grouped) {
  const body = headingBody(lines, grouped.season);
  if (!body) return null;
  const plain = plainLines(body);
  const keep = [];
  let skipping = false;
  for (const line of plain) {
    const months = grouped.monthsOf(line, true);
    if (months) skipping = !months.includes(grouped.month);
    if (!skipping) keep.push(line);
  }
  const text = keep
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text.length ? text : null;
}

/** Lines that name the locator's subject near their start — shown for slots that stay missing. */
export function candidateLines(text, locator, limit = 6) {
  const subject = monthLocator(locator)?.subject ?? locator;
  return plainLines(text.split(/\r?\n/))
    .filter((line) => {
      const at = line.indexOf(subject);
      return at >= 0 && at <= 20;
    })
    .slice(0, limit)
    .map((line) => line.slice(0, 48));
}

/**
 * Locate one locator part. `|` separates alternatives tried in order ("論比肩|論劫財"). Each
 * alternative is looked up as a heading, then as a paragraph, then (month locators) as the season
 * section. Returns { passage, locator, via } so the collector can record what actually matched.
 */
function locatePart(lines, part) {
  for (const alternative of part
    .split("|")
    .map((alt) => alt.trim())
    .filter(Boolean)) {
    const heading = extractHeadingSection(lines, alternative);
    if (heading) return { passage: heading, locator: alternative, via: "heading" };
    const paragraph = extractParagraph(lines, alternative);
    if (paragraph) return { passage: paragraph, locator: alternative, via: "paragraph" };
    const grouped = monthLocator(alternative);
    const season = grouped ? extractSeason(lines, grouped) : null;
    if (season) return { passage: season, locator: grouped.season, via: "season" };
  }
  return null;
}

/**
 * Locate a passage. A `·`-joined locator ("論印綬·論食神") means both parts, concatenated; it is
 * null unless every part is found. Each part may list `|` alternatives.
 */
export function locate(text, locator) {
  const lines = text.split(/\r?\n/);
  const parts = locator
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  const found = parts.map((part) => locatePart(lines, part));
  if (!found.every(Boolean)) return null;
  return {
    passage: found.map((hit) => hit.passage).join("\n\n"),
    locator: found.map((hit) => hit.locator).join("·"),
    via: found.map((hit) => hit.via).join("·"),
  };
}

export function extractSection(text, locator) {
  return locate(text, locator)?.passage ?? null;
}

/** Normalized rendered text when present, else the raw wikitext. */
export function pageTextOf(page) {
  return page.text ? htmlToText(page.text) : page.wikitext;
}

/** First match across renderings of the same page (rendered zh-hant text, then wikitext). */
export function locateInPage(page, locator) {
  for (const candidate of [page.text ? htmlToText(page.text) : null, page.wikitext])
    if (candidate) {
      const hit = locate(candidate, locator);
      if (hit) return hit;
    }
  return null;
}

export function extractFromPage(page, locator) {
  return locateInPage(page, locator)?.passage ?? null;
}

/** Bound a passage so prompts and the catalog schema stay within their limits. */
export function boundPassage(text, maxCharacters = 4000) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > maxCharacters ? compact.slice(0, maxCharacters) : compact;
}

export function wikisourceApiUrl(title) {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "wikitext|text",
    variant: "zh-hant",
    disableeditsection: "1",
    disabletoc: "1",
    redirects: "1",
    format: "json",
    formatversion: "2",
  });
  return `https://zh.wikisource.org/w/api.php?${params}`;
}

export class WikisourcePageError extends Error {
  constructor(code, title) {
    super(`${code}: ${title}`);
    this.code = code; // MISSING_TITLE | RATE_LIMITED | HTTP_<status> | NO_WIKITEXT
    this.title = title;
  }
}

/**
 * Fetch each page title at most once per run, including failures, and pace requests so the
 * 141 slots never turn into 141 HTTP calls (Wikisource answers bursts with 429).
 * `fetchImpl`/`sleep` are injectable for offline tests.
 */
export function createWikitextLoader({
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  delayMs = 1500,
  maxRetries = 1,
} = {}) {
  const cache = new Map(); // title -> { text } | { error }
  let requests = 0;
  async function request(title) {
    for (let attempt = 0; ; attempt++) {
      if (requests > 0) await sleep(delayMs);
      requests++;
      const response = await fetchImpl(wikisourceApiUrl(title), {
        headers: {
          "user-agent":
            "saju-interpretation-collector/1.1 (local developer script; contact repo owner)",
          accept: "application/json",
        },
      });
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 10_000);
        continue;
      }
      if (response.status === 429) throw new WikisourcePageError("RATE_LIMITED", title);
      if (!response.ok) throw new WikisourcePageError(`HTTP_${response.status}`, title);
      const body = await response.json();
      if (body?.error?.code === "missingtitle")
        throw new WikisourcePageError("MISSING_TITLE", title);
      const wikitext = body?.parse?.wikitext;
      if (typeof wikitext !== "string") throw new WikisourcePageError("NO_WIKITEXT", title);
      const text = body?.parse?.text;
      // { wikitext, text }: raw source and rendered HTML (zh-hant variant, transclusions resolved).
      return { wikitext, text: typeof text === "string" ? text : null };
    }
  }
  return {
    async load(title) {
      if (!cache.has(title)) {
        try {
          cache.set(title, { page: await request(title) });
        } catch (error) {
          cache.set(title, { error });
        }
      }
      const entry = cache.get(title);
      if (entry.error) throw entry.error;
      return entry.page;
    },
    get requests() {
      return requests;
    },
  };
}

/** Title is the last path segment of the scaffold url (already percent-encoded). */
export function titleFromUrl(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\/wiki\//, ""));
}

export const SUMMARY_PROMPT_VERSION = "1.0.0";
export const SUMMARY_INSTRUCTIONS = `당신은 한문 고전 명리 원전 구절을 한국어로 요약하는 번역 보조자다.
주어진 구절에 적힌 내용만 2~4문장의 한국어 평서문("~이다/~로 본다")으로 요약한다.
구절에 없는 조건·사건·성격·길흉·현대적 해석을 추가하지 않는다. 사람에게 조언하지 않는다.
구절이 특정 일간과 달에 대한 것이면 그 조건을 첫 문장에 명시한다. 요약은 800자 이내다.
출력은 요약 문장만 쓴다. 제목·번호·인용부호·설명·메타데이터를 쓰지 않는다.`;
export const ENTAILMENT_INSTRUCTIONS = `당신은 요약이 원문에서 벗어났는지 검사하는 판정자다.
원문 구절과 한국어 요약을 받는다. 요약의 모든 주장이 원문 구절에서 직접 뒷받침되면 PASS, 하나라도 원문에 없는 조건·사건·성격·길흉·조언이 추가되었으면 FAIL이다.
번역상의 자연스러운 표현 차이는 허용한다. 출력은 PASS 또는 FAIL 한 단어만 쓴다.`;

export function summaryRequestBody(model, passage, locator) {
  return {
    model,
    store: false,
    stream: false,
    instructions: SUMMARY_INSTRUCTIONS,
    input: [{ role: "user", content: `[출처 위치] ${locator}\n[원문]\n${passage}` }],
    max_output_tokens: 600,
  };
}
export function entailmentRequestBody(model, passage, summary) {
  return {
    model,
    store: false,
    stream: false,
    instructions: ENTAILMENT_INSTRUCTIONS,
    input: [{ role: "user", content: `[원문]\n${passage}\n\n[요약]\n${summary}` }],
    // The Responses API rejects anything below 16 with HTTP 400; the verdict itself is one word.
    max_output_tokens: 16,
  };
}

/** Responses API envelope → assistant output_text, or null when not a completed message. */
export function outputTextOf(envelope) {
  if (!envelope || envelope.status !== "completed" || !Array.isArray(envelope.output)) return null;
  const text = envelope.output
    .filter((item) => item.type === "message" && item.role === "assistant")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("")
    .trim();
  return text.length ? text : null;
}

export function parseEntailmentVerdict(text) {
  const normalized = (text ?? "").trim().toUpperCase();
  if (normalized === "PASS") return "passed";
  if (normalized === "FAIL") return "failed";
  return null;
}
