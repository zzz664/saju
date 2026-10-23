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
  extractFromPage,
  extractSection,
  htmlToText,
  listHeadings,
  outputTextOf,
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
    expect(extractSection(prose, "三月甲木")).toBeNull();
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
    expect(candidateLines(text, "七月己土")).toEqual(["四五六月己土，雜氣財官。"]);
    expect(candidateLines(text, "論印綬")).toEqual([]);
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
    expect(extractSection(months, "正月甲木")).toBe("正月甲木，初春。");
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
    expect(entailmentRequestBody("gpt-4o-mini", "原文", "요약").max_output_tokens).toBe(5);
    expect(parseEntailmentVerdict(" pass\n")).toBe("passed");
    expect(parseEntailmentVerdict("FAIL")).toBe("failed");
    expect(parseEntailmentVerdict("PASS. 근거 충분")).toBeNull();
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
