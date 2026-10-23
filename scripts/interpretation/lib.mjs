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

function extractHeadingSection(lines, locator) {
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(HEADING);
    // Exact or prefix match only: "甲木" must not pick the "三春甲木" chapter heading.
    if (!match || !stripWikitext(match[2]).startsWith(locator)) continue;
    const level = match[1].length;
    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const next = lines[cursor].match(HEADING);
      if (next && next[1].length <= level) break;
      body.push(lines[cursor]);
    }
    const text = stripWikitext(body.join("\n"));
    return text.length ? text : null;
  }
  return null;
}

/**
 * Many classical texts on Wikisource have no per-month headings: "正月甲木，…" is the first clause
 * of a paragraph. Fall back to the paragraph (consecutive non-empty lines) that starts with the
 * locator; as a last resort a prose line (≥ 20 characters, so link lists are skipped) containing it.
 */
function extractParagraph(lines, locator) {
  const plain = lines.map((line) => (HEADING.test(line) ? "" : stripWikitext(line)));
  const grouped = monthLocator(locator);
  let index = plain.findIndex((line) => line.startsWith(locator));
  if (index < 0 && grouped) index = plain.findIndex((line) => grouped.test(line));
  if (index < 0) index = plain.findIndex((line) => line.length >= 20 && line.includes(locator));
  if (index < 0) return null;
  // The paragraph ends at a blank line, a heading, or the next month paragraph of the same subject.
  const nextMonth = grouped
    ? new RegExp(`^[正一二三四五六七八九十、，\\s月]{1,16}月${grouped.subject}`)
    : null;
  const body = [];
  for (let cursor = index; cursor < lines.length && plain[cursor].length; cursor++) {
    if (cursor > index && nextMonth?.test(plain[cursor])) break;
    body.push(plain[cursor]);
  }
  const text = body.join("\n").trim();
  return text.length ? text : null;
}

const MONTHS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
const MONTH_NUMERAL = /^[正一二三四五六七八九十]$/;

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
 * 窮通寶鑑 groups months whose advice is shared. Returns null for non-month locators.
 */
export function monthLocator(locator) {
  const match = locator.match(/^(正|二|三|四|五|六|七|八|九|十一|十二|十)月(.+)$/);
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]) + 1;
  const subject = match[2];
  const prefixPattern = new RegExp(`^([正一二三四五六七八九十、，\\s月]{1,16}月)${subject}`);
  return {
    month,
    subject,
    test(line) {
      const found = line.match(prefixPattern);
      return Boolean(found) && monthsInPrefix(found[1]).includes(month);
    },
  };
}

/** Lines that name the locator's subject near their start — shown for slots that stay missing. */
export function candidateLines(text, locator, limit = 6) {
  const subject = monthLocator(locator)?.subject ?? locator;
  return text
    .split(/\r?\n/)
    .map((line) => (HEADING.test(line) ? "" : stripWikitext(line)))
    .filter((line) => {
      const at = line.indexOf(subject);
      return at >= 0 && at <= 20;
    })
    .slice(0, limit)
    .map((line) => line.slice(0, 48));
}

/**
 * Locate a passage. A `·`-joined locator ("論印綬·論食神") means both parts, concatenated; it is
 * null unless every part is found. Each part is looked up first as a heading (body up to the next
 * heading of the same or higher level), then as a paragraph that begins with the locator.
 */
export function extractSection(text, locator) {
  const parts = locator
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    const found = parts.map((part) => extractSection(text, part));
    return found.every(Boolean) ? found.join("\n\n") : null;
  }
  const lines = text.split(/\r?\n/);
  return extractHeadingSection(lines, locator) ?? extractParagraph(lines, locator);
}

/** Normalized rendered text when present, else the raw wikitext. */
export function pageTextOf(page) {
  return page.text ? htmlToText(page.text) : page.wikitext;
}

/** First match across several renderings of the same page (rendered zh-hant text, then wikitext). */
export function extractFromPage(page, locator) {
  for (const candidate of [page.text ? htmlToText(page.text) : null, page.wikitext])
    if (candidate) {
      const section = extractSection(candidate, locator);
      if (section) return section;
    }
  return null;
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
    max_output_tokens: 5,
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
