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

/**
 * Find the section whose heading text contains the locator, then return its body up to the next
 * heading of the same or higher level. Returns null when the heading is absent.
 */
export function extractSection(wikitext, locator) {
  const lines = wikitext.split(/\r?\n/);
  const heading = /^(={2,6})\s*(.*?)\s*\1\s*$/;
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].match(heading);
    if (!match || !stripWikitext(match[2]).includes(locator)) continue;
    const level = match[1].length;
    const body = [];
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const next = lines[cursor].match(heading);
      if (next && next[1].length <= level) break;
      body.push(lines[cursor]);
    }
    const text = stripWikitext(body.join("\n"));
    return text.length ? text : null;
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
    prop: "wikitext",
    format: "json",
    formatversion: "2",
  });
  return `https://zh.wikisource.org/w/api.php?${params}`;
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
