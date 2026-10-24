import { describe, expect, it } from "vitest";
import {
  WikisourcePageError,
  boundPassage,
  candidateLines,
  createWikitextLoader,
  monthLocator,
  monthsInPrefix,
  digestText,
  entailmentRequestBody,
  parseEntailmentReason,
  extractFromPage,
  extractSection,
  htmlToText,
  listHeadings,
  locate,
  outputTextOf,
  partialTextOf,
  parseEntailmentVerdict,
  stripWikitext,
  summaryRequestBody,
  titleFromUrl,
  wikisourceApiUrl,
} from "../scripts/interpretation/lib.mjs";
import { buildScaffold } from "@/infrastructure/interpretation/scaffold";

const wikitext = `== 三春甲木 ==
總論。
=== 正月甲木 ===
初春尚有'''餘寒'''。{{template}}得丙癸透。[[富貴|富貴雙全]]。<ref>note</ref>
=== 二月甲木 ===
陽氣漸升。
== 三夏甲木 ==
夏木。`;

describe("interpretation collector helpers (offline)", () => {
  it("extracts exactly the located section and strips markup", () => {
    expect(extractSection(wikitext, "正月甲木")).toBe("初春尚有餘寒。得丙癸透。富貴雙全。");
    expect(extractSection(wikitext, "二月甲木")).toBe("陽氣漸升。");
    expect(extractSection(wikitext, "三春甲木")).toContain("總論");
    expect(extractSection(wikitext, "十二月癸水")).toBeNull();
    expect(stripWikitext("<b>甲</b>木 {{x}}")).toBe("甲木");
  });
  it("falls back to the paragraph that begins with the locator when there is no heading", () => {
    const prose = `== 三春甲木 ==
三春甲木總論。
正月甲木，初春尚有餘寒。得丙癸透，富貴雙全。
續段。

二月甲木，陽氣漸升。
目錄：[[穷通宝鉴#正月甲木|正月甲木]]
== 天干論 ==
甲木參天，脫胎要火。
乙木雖柔，刲羊解牛。`;
    expect(extractSection(prose, "正月甲木")).toBe(
      "正月甲木，初春尚有餘寒。得丙癸透，富貴雙全。\n續段。",
    );
    expect(extractSection(prose, "二月甲木")).toBe("二月甲木，陽氣漸升。\n目錄：正月甲木");
    expect(extractSection(prose, "甲木")).toBe("甲木參天，脫胎要火。\n乙木雖柔，刲羊解牛。");
    // No 三月 paragraph: the season section minus the other months' blocks stands in.
    expect(extractSection(prose, "三月甲木")).toBe("三春甲木總論。");
    expect(extractSection(prose, "七月甲木")).toBeNull();
    // A `·` locator needs every part; parts are concatenated in order.
    const smth = "== 論印綬 ==\n印者。\n== 論食神 ==\n食者。\n== 論正財 ==\n財者。";
    expect(extractSection(smth, "論印綬·論食神")).toBe("印者。\n\n食者。");
    expect(extractSection(smth, "論印綬·論偏印")).toBeNull();
  });
  it("matches grouped-month paragraphs such as 五六月甲木 and 十一、十二月戊土", () => {
    expect(monthsInPrefix("五六月")).toEqual([5, 6]);
    expect(monthsInPrefix("十一、十二月")).toEqual([11, 12]);
    expect(monthsInPrefix("十一二月")).toEqual([11, 12]);
    expect(monthsInPrefix("正、二月")).toEqual([1, 2]);
    expect(monthsInPrefix("十月十一月十二月")).toEqual([10, 11, 12]);
    expect(monthsInPrefix("四五六月")).toEqual([4, 5, 6]);
    const text = `== 三夏甲木 ==
四月甲木，退氣。
五六月甲木，木性虛焦。
== 三冬戊土 ==
十月戊土，時值小陽。
十一、十二月戊土，嚴寒冰凍。
== 三夏己土 ==
四五六月己土，雜氣財官。`;
    expect(extractSection(text, "五月甲木")).toBe("五六月甲木，木性虛焦。");
    expect(extractSection(text, "六月甲木")).toBe("五六月甲木，木性虛焦。");
    expect(extractSection(text, "四月甲木")).toBe("四月甲木，退氣。");
    expect(extractSection(text, "十二月戊土")).toBe("十一、十二月戊土，嚴寒冰凍。");
    expect(extractSection(text, "十月戊土")).toBe("十月戊土，時值小陽。");
    expect(extractSection(text, "五月己土")).toBe("四五六月己土，雜氣財官。");
    expect(extractSection(text, "七月己土")).toBeNull();
    expect(monthLocator("論印綬")).toBeNull();
    expect(monthLocator("七月己土")?.season).toBe("三秋己土");
    expect(candidateLines(text, "七月己土")).toEqual(["四五六月己土，雜氣財官。"]);
    expect(candidateLines(text, "論印綬")).toEqual([]);
  });
  it("reads the terse forms inside a season section and joins every paragraph naming the month", () => {
    const text = `=== 三春甲木 ===
春月之木，漸有生長之象。
正月甲木，初春尚有餘寒。
正二月甲木，素無取從才之理。
時日月年
庚甲戊庚
申寅寅申
二月甲木，庚金得所。
=== 三夏丁火 ===
五月丁火，時歸建祿。
六月之丁，陰柔退氣。
=== 三冬戊土 ===
十月戊土，時值小陽。
十一二月嚴寒冰凍，丙火為專。
=== 三冬乙木 ===
十月乙木，木不受氣。
十一月乙木，花木寒凍。
冬月之木，雖取戊制水。`;
    // Named-month paragraphs win over the season opener and are joined in order; charts are dropped.
    expect(extractSection(text, "正月甲木")).toBe(
      "正月甲木，初春尚有餘寒。\n\n正二月甲木，素無取從才之理。",
    );
    expect(extractSection(text, "二月甲木")).toBe(
      "正二月甲木，素無取從才之理。\n\n二月甲木，庚金得所。",
    );
    expect(extractSection(text, "三月甲木")).toBe("春月之木，漸有生長之象。");
    expect(extractSection(text, "六月丁火")).toBe("六月之丁，陰柔退氣。");
    expect(extractSection(text, "五月丁火")).toBe("五月丁火，時歸建祿。");
    expect(extractSection(text, "十一月戊土")).toBe("十一二月嚴寒冰凍，丙火為專。");
    expect(extractSection(text, "十二月戊土")).toBe("十一二月嚴寒冰凍，丙火為專。");
    expect(extractSection(text, "十月戊土")).toBe("十月戊土，時值小陽。");
    expect(locate(text, "十二月乙木")).toEqual({
      passage: "冬月之木，雖取戊制水。",
      locator: "十二月乙木",
      via: "paragraph",
    });
    expect(extractSection(text, "十一月乙木")).toBe("十一月乙木，花木寒凍。");
    // Terse forms are read only inside the subject's own season section.
    expect(extractSection("十一二月嚴寒冰凍。", "十一月戊土")).toBeNull();
  });
  it("keeps a month block with its 或… elaborations and falls back to the season section", () => {
    const text = `== 三春乙木 ==
三春乙木，為芝蘭蒿草之物。

正月乙木，必須用丙。

或支成木局，有癸透乃作貴命。

二月乙木，陽氣漸升。
== 三夏己土 ==
三夏己土，雜氣財官，禾稼在田。

或丙透癸藏，科甲。
== 三冬乙木 ==
三冬乙木，花木寒凍。

十月乙木，木不受氣。

或一派壬水。

十一月乙木，花木寒凍。
== 論劫財 ==
劫財者。`;
    // Month block: from "正月乙木" through its "或…" paragraph, up to the next month paragraph.
    expect(extractSection(text, "正月乙木")).toBe(
      "正月乙木，必須用丙。\n\n或支成木局，有癸透乃作貴命。",
    );
    expect(extractSection(text, "二月乙木")).toBe("二月乙木，陽氣漸升。");
    // No month paragraph at all: the season section is used and reported as such.
    expect(locate(text, "五月己土")).toEqual({
      passage: "三夏己土，雜氣財官，禾稼在田。\n\n或丙透癸藏，科甲。",
      locator: "三夏己土",
      via: "season",
    });
    // Season fallback drops the blocks that belong to other months of the same subject.
    expect(locate(text, "十二月乙木")).toEqual({
      passage: "三冬乙木，花木寒凍。",
      locator: "三冬乙木",
      via: "season",
    });
    expect(locate(text, "三月乙木")?.passage).toBe("三春乙木，為芝蘭蒿草之物。");
    expect(locate(text, "七月己土")).toBeNull();
    // `|` alternatives: the first that exists wins and is reported.
    expect(locate(text, "論比肩|論劫財|論比劫")).toEqual({
      passage: "劫財者。",
      locator: "論劫財",
      via: "heading",
    });
    expect(locate(text, "論比肩|論比劫")).toBeNull();
    expect(locate(text, "論劫財·正月乙木")?.locator).toBe("論劫財·正月乙木");
    expect(locate(text, "論劫財·正月乙木")?.via).toBe("heading·paragraph");
  });
  it("normalizes rendered html and prefers it over raw wikitext", () => {
    const html = `<div class="mw-parser-output"><table><tr><td>上一卷</td></tr></table>
<h2><span class="mw-headline" id="x">論印綬</span><span class="mw-editsection">[编辑]</span></h2>
<p>印者&nbsp;生我之物。<br/>二句。</p><h2>論食神</h2><p>食者。</p></div>`;
    expect(htmlToText(html)).toBe(
      "上一卷\n\n== 論印綬 ==\n\n印者 生我之物。\n二句。\n\n== 論食神 ==\n食者。",
    );
    expect(listHeadings(htmlToText(html))).toEqual(["# 論印綬", "# 論食神"]);
    // Separate <p> blocks become separate paragraphs, so a month passage stops at the next one.
    const months = htmlToText("<p>正月甲木，初春。</p><p>又一段。</p><p>二月甲木，陽升。</p>");
    expect(extractSection(months, "正月甲木")).toBe("正月甲木，初春。\n\n又一段。");
    expect(extractSection(months, "二月甲木")).toBe("二月甲木，陽升。");
    expect(extractFromPage({ wikitext: "<pages index=x />", text: html }, "論印綬")).toBe(
      "印者 生我之物。\n二句。",
    );
    expect(extractFromPage({ wikitext: "== 論印綬 ==\n原文", text: null }, "論印綬")).toBe("原文");
    expect(extractFromPage({ wikitext: "", text: html }, "論偏印")).toBeNull();
  });
  it("bounds passages, derives titles and api urls from scaffold sources", () => {
    expect(boundPassage("  a  b\n\nc ", 3)).toBe("a b");
    const [first] = buildScaffold();
    expect(titleFromUrl(first.source.url)).toBe("穷通宝鉴");
    expect(wikisourceApiUrl("穷通宝鉴")).toContain("action=parse");
    expect(wikisourceApiUrl("穷通宝鉴")).toContain("prop=wikitext");
    expect(wikisourceApiUrl("穷通宝鉴")).toContain("redirects=1");
    expect(wikisourceApiUrl("穷通宝鉴")).toContain("variant=zh-hant");
    expect(digestText("x")).toMatch(/^[0-9a-f]{64}$/);
  });
  it("builds bounded, store:false request bodies and reads verdicts strictly", () => {
    const body = summaryRequestBody("gpt-4o-mini", "原文", "正月甲木");
    expect(body).toMatchObject({ store: false, stream: false, model: "gpt-4o-mini" });
    expect(body.input[0].content).toContain("正月甲木");
    // Room for "FAIL: <이유>"; the Responses API minimum is 16 (5 failed every call with HTTP 400).
    expect(entailmentRequestBody("gpt-4o-mini", "原文", "요약").max_output_tokens).toBe(200);
    // 800자 한국어 요약 + 한자 병기가 600 토큰을 넘어 status=incomplete로 잘렸다(1차 보정 errors 4).
    expect(summaryRequestBody("gpt-4o-mini", "原文", "正月甲木").max_output_tokens).toBe(1400);
    expect(parseEntailmentVerdict(" pass\n")).toBe("passed");
    expect(parseEntailmentVerdict("FAIL")).toBe("failed");
    expect(parseEntailmentVerdict("FAIL: 丙을 정화로 옮김")).toBe("failed");
    expect(parseEntailmentVerdict("PASS. 근거 충분")).toBe("passed");
    expect(parseEntailmentVerdict("PASSABLE")).toBeNull();
    expect(parseEntailmentVerdict("요약이 좋습니다")).toBeNull();
    expect(parseEntailmentReason("FAIL: 丙을 정화로 옮김")).toBe("丙을 정화로 옮김");
    expect(parseEntailmentReason("FAIL")).toBeNull();
    expect(parseEntailmentReason("PASS")).toBeNull();
    expect(summaryRequestBody("gpt-4o-mini", "原文", "正月甲木").instructions).toContain(
      "병화(丙火)",
    );
    expect(
      outputTextOf({
        status: "completed",
        output: [
          { type: "reasoning", summary: [] },
          { type: "message", role: "assistant", content: [{ type: "output_text", text: "요약" }] },
        ],
      }),
    ).toBe("요약");
    expect(outputTextOf({ status: "incomplete", output: [] })).toBeNull();
    const cut = {
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "FAIL: 丙을 정화로" }],
        },
      ],
    };
    expect(outputTextOf(cut)).toBeNull();
    expect(partialTextOf(cut)).toBe("FAIL: 丙을 정화로");
    expect(partialTextOf({ ...cut, incomplete_details: { reason: "content_filter" } })).toBeNull();
    expect(partialTextOf({ ...cut, status: "completed" })).toBeNull();
  });
  it("fetches each page title once, caches failures and retries 429 once with Retry-After", async () => {
    const calls: string[] = [];
    const slept: number[] = [];
    let rateLimited = true;
    const fetchImpl = (async (input: string | URL | Request) => {
      const title = decodeURIComponent(new URL(String(input)).searchParams.get("page")!);
      calls.push(title);
      if (title === "missing-page") return Response.json({ error: { code: "missingtitle" } });
      if (title === "busy-page" && rateLimited) {
        rateLimited = false;
        return new Response("", { status: 429, headers: { "retry-after": "2" } });
      }
      return Response.json({ parse: { wikitext: `== ${title} ==\n本文` } });
    }) as unknown as typeof fetch;
    const loader = createWikitextLoader({
      fetchImpl,
      sleep: async (ms) => {
        slept.push(ms);
      },
      delayMs: 100,
    });
    await expect(loader.load("missing-page")).rejects.toMatchObject({ code: "MISSING_TITLE" });
    await expect(loader.load("missing-page")).rejects.toBeInstanceOf(WikisourcePageError);
    expect((await loader.load("busy-page")).wikitext).toContain("本文");
    expect((await loader.load("busy-page")).wikitext).toContain("本文");
    expect(await loader.load("ok-page")).toEqual({ wikitext: "== ok-page ==\n本文", text: null });
    expect(calls).toEqual(["missing-page", "busy-page", "busy-page", "ok-page"]);
    expect(loader.requests).toBe(4);
    expect(slept).toEqual([100, 2000, 100, 100]);
    const exhausted = createWikitextLoader({
      fetchImpl: (async () => new Response("", { status: 429 })) as unknown as typeof fetch,
      sleep: async () => {},
      maxRetries: 0,
    });
    await expect(exhausted.load("x")).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
