import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareFeatureNarration } from "@/application/narration/feature";
import { COMMON_SYSTEM_PROMPT } from "@/domain/narration/prompt";
import {
  NarrationRejection,
  composeNarrationRequest,
  renderStyleGuide,
  scoreNarrationStyle,
  sentenceRegister,
  splitSentences,
  validateNarrationDraft,
} from "@/domain/narration/render";
import { createPlanMockProvider } from "@/infrastructure/llm/plan-mock";
import { toOpenAiResponsesBody } from "@/infrastructure/openai/request";
import { estimateNarrationTokens } from "@/domain/experiment";
import { createApiTestCatalog } from "@/server/api-test-catalog";

const catalog = createApiTestCatalog();
const source = catalog.source("synthetic-known", "F03");
const context = prepareFeatureNarration(source, {
  ...catalog,
  selection: catalog.selection("synthetic-style"),
});
async function mockDraft(persona = "synthetic-style") {
  const prepared = prepareFeatureNarration(source, {
    ...catalog,
    selection: catalog.selection(persona),
  });
  const output = (await createPlanMockProvider().generate(prepared.request)) as {
    outputText: string;
  };
  return { prepared, raw: JSON.parse(output.outputText) as { beats: Record<string, unknown>[] } };
}

describe("narration request rendering", () => {
  it("keeps the common policy in sync with docs/12 and separates style guide, contract and data", () => {
    const documented = readFileSync("docs/12_공통_시스템_프롬프트.md", "utf8").match(
      /```text\n([\s\S]*?)\n```/,
    )![1];
    expect(COMMON_SYSTEM_PROMPT).toBe(documented);
    expect(context.request.instructions).toBe(COMMON_SYSTEM_PROMPT);
    const [developer, user] = context.request.messages;
    expect(developer.role).toBe("developer");
    expect(developer.content.startsWith("[캐릭터 스타일 안내] synthetic-style 1.0.0")).toBe(true);
    expect(developer.content).toContain("해요체");
    expect(developer.content).toContain("[출력 형식]");
    expect(developer.content).toContain("[좋은 출력의 예");
    expect(developer.content).not.toMatch(/"schemaVersion"|identityDisclosure|"strength":/);
    expect(user.role).toBe("user");
    const data = JSON.parse(user.content);
    expect(Object.keys(data).sort()).toEqual([
      "beats",
      "chart",
      "featureId",
      "limitations",
      "status",
    ]);
    expect(JSON.stringify(data)).not.toMatch(
      /refId|planKey|provenance|primary:M03|sourceRefs|ruleId/,
    );
    expect(data.beats.map((beat: { beatId: string }) => beat.beatId)).toEqual(
      context.plan.beats.map((beat) => beat.beatId),
    );
  });
  it("pins the strict output schema to this plan's beat ids and aliases", () => {
    const schema = context.request.output.jsonSchema as {
      properties: {
        beats: {
          items: { properties: Record<string, { enum?: string[]; items?: { enum: string[] } }> };
        };
      };
    };
    expect(schema.properties.beats.items.properties.beatId.enum).toEqual(
      context.plan.beats.map((beat) => beat.beatId),
    );
    expect(schema.properties.beats.items.properties.usedAliases.items?.enum).toEqual(
      context.plan.beats.flatMap((beat) => beat.evidence.map((entry) => entry.alias)),
    );
    const wire = toOpenAiResponsesBody({ ...context.request, maxOutputTokens: 2000 });
    expect(Object.keys(wire).sort()).toEqual([
      "input",
      "instructions",
      "max_output_tokens",
      "model",
      "store",
      "stream",
      "text",
    ]);
    expect(wire).toMatchObject({ store: false, stream: false, text: { format: { strict: true } } });
    expect(
      estimateNarrationTokens(context.request, { maxRequestBytes: 131072, maxOutputTokens: 2000 })
        .tokens,
    ).toBeGreaterThan(new TextEncoder().encode(JSON.stringify(wire)).byteLength + 2000);
  });
  it("renders a prose style guide for every approved persona without machine fields", () => {
    for (const item of catalog.personas) {
      const persona = catalog.registry.load(catalog.selection(item.id));
      const guide = renderStyleGuide(persona);
      expect(guide).toContain(persona.personaId);
      expect(guide).toContain(persona.role);
      for (const expression of persona.voice.preferredExpressions)
        expect(guide).toContain(expression);
      expect(guide).not.toMatch(/catchphraseMaxPerReport|paragraphsPerSection|emojiPolicy/);
    }
  });
  it("accepts the mock draft and rejects each grounding failure with its own code", async () => {
    const { prepared, raw } = await mockDraft();
    const text = JSON.stringify(raw);
    const validated = validateNarrationDraft(text, prepared.plan);
    expect(validated.beats.map((beat) => beat.beatId)).toEqual(
      prepared.plan.beats.map((beat) => beat.beatId),
    );
    const reject = (value: unknown, code: string, beatId: string | null = null) => {
      try {
        validateNarrationDraft(
          typeof value === "string" ? value : JSON.stringify(value),
          prepared.plan,
        );
      } catch (error) {
        expect(error).toBeInstanceOf(NarrationRejection);
        expect((error as NarrationRejection).code).toBe(code);
        if (beatId) expect((error as NarrationRejection).beatId).toBe(beatId);
        return;
      }
      throw new Error("expected rejection " + code);
    };
    reject("not json", "JSON_PARSE");
    reject({ beats: "x" }, "SCHEMA");
    reject({ beats: raw.beats.slice(1) }, "BEAT_SET");
    reject({ beats: [...raw.beats, raw.beats[0]] }, "BEAT_SET");
    reject(
      { beats: raw.beats.map((beat) => ({ ...beat, usedAliases: ["E99"] })) },
      "ALIAS_UNKNOWN",
      "chart",
    );
    reject(
      { beats: raw.beats.map((beat) => ({ ...beat, usedAliases: [] })) },
      "ALIAS_MISSING",
      "chart",
    );
    reject(
      { beats: raw.beats.map((beat) => ({ ...beat, paragraphs: ["가".repeat(3000)] })) },
      "LENGTH",
      "chart",
    );
    reject(
      { beats: raw.beats.map((beat) => ({ ...beat, paragraphs: ["2027년에 좋아져요."] })) },
      "DATE_FORBIDDEN",
    );
    reject(
      { beats: raw.beats.map((beat) => ({ ...beat, paragraphs: ["근거 E1에 따르면 좋아요."] })) },
      "INTERNAL_ID_LEAK",
    );
    reject(
      { beats: raw.beats.map((beat) => ({ ...beat, paragraphs: ["iu.qtbj.gap-in 참고."] })) },
      "INTERNAL_ID_LEAK",
    );
    reject("가".repeat(130 * 1024), "BYTES");
  });
  it("scores style per sentence with tolerant Korean endings and reports ratios", async () => {
    expect(sentenceRegister("오늘은 괜찮죠.")).toBe("haeyo");
    expect(sentenceRegister("그렇군요!")).toBe("haeyo");
    expect(sentenceRegister("살펴보겠습니다.")).toBe("hapsyo");
    expect(sentenceRegister("정말 그렇습니까?")).toBe("hapsyo");
    expect(sentenceRegister("그렇게 봐.")).toBe("banmal");
    expect(sentenceRegister("이 부분은 한계로 남는다.")).toBe("banmal");
    expect(sentenceRegister("123")).toBeNull();
    expect(splitSentences("첫 문장이에요. 둘째 문장이죠! “인용이다.” 끝")).toEqual([
      "첫 문장이에요.",
      "둘째 문장이죠!",
      "끝",
    ]);
    const { prepared, raw } = await mockDraft();
    const persona = prepared.persona;
    const clean = scoreNarrationStyle(
      validateNarrationDraft(JSON.stringify(raw), prepared.plan),
      persona,
    );
    expect(clean).toMatchObject({ policyVersion: "2.0.0", method: "heuristic" });
    expect(clean.issues.map((issue) => issue.code)).not.toContain("REGISTER_MIX");
    const mixed = scoreNarrationStyle(
      validateNarrationDraft(
        JSON.stringify({
          beats: raw.beats.map((beat) => ({
            ...beat,
            paragraphs: [
              "먼저 살펴보겠습니다. 확인된 범위만 설명합니다. 반드시 그렇습니다. 결론적으로 좋습니다. 다섯째 문장입니다. 😀",
            ],
          })),
        }),
        prepared.plan,
      ),
      persona,
    );
    const codes = mixed.issues.map((issue) => issue.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "REGISTER_MIX",
        "CERTAINTY",
        "STOCK_PHRASE",
        "EMOJI",
        "SENTENCE_COUNT",
      ]),
    );
    expect(mixed.issues.find((issue) => issue.code === "REGISTER_MIX")?.detail).toMatch(
      /haeyo 0\/\d+/,
    );
    expect(mixed.score).toBeLessThan(clean.score);
    const formal = await mockDraft("synthetic-formal");
    const formalScore = scoreNarrationStyle(
      validateNarrationDraft(JSON.stringify(formal.raw), formal.prepared.plan),
      formal.prepared.persona,
    );
    expect(formalScore.issues.map((issue) => issue.code)).not.toContain("REGISTER_MIX");
  });
  it("changes only the narration key across personas and models while plan and analysis keys hold", () => {
    const formal = prepareFeatureNarration(source, {
      ...catalog,
      selection: catalog.selection("synthetic-formal"),
    });
    const model = prepareFeatureNarration(source, {
      ...catalog,
      selection: catalog.selection("synthetic-style"),
      model: "gpt-4.1-mini",
    });
    expect(formal.plan).toEqual(context.plan);
    expect(formal.cache.analysisKey).toBe(context.cache.analysisKey);
    expect(formal.cache.planKey).toBe(context.cache.planKey);
    expect(
      new Set([context.cache.narrationKey, formal.cache.narrationKey, model.cache.narrationKey])
        .size,
    ).toBe(3);
    expect(() =>
      composeNarrationRequest(
        { ...context.plan, planKey: "0".repeat(64) },
        formal.persona,
        "gpt-4o-mini",
      ),
    ).not.toThrow();
    expect(() =>
      composeNarrationRequest({ ...context.plan, beats: [] }, formal.persona, "gpt-4o-mini"),
    ).toThrow();
  });
});
