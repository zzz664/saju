import { describe, expect, it } from "vitest";
import {
  boundPassage,
  digestText,
  entailmentRequestBody,
  extractSection,
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
  it("bounds passages, derives titles and api urls from scaffold sources", () => {
    expect(boundPassage("  a  b\n\nc ", 3)).toBe("a b");
    const [first] = buildScaffold();
    expect(titleFromUrl(first.source.url)).toBe("窮通寶鑑");
    expect(wikisourceApiUrl("窮通寶鑑")).toContain("action=parse");
    expect(wikisourceApiUrl("窮通寶鑑")).toContain("prop=wikitext");
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
});
