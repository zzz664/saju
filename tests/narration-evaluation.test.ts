import { describe, expect, it } from "vitest";
import {
  evaluateNarrationMatrix,
  NarrationEvaluationReportSchema,
  renderNarrationReview,
} from "@/application/narration/evaluation";
import { createPlanMockProvider } from "@/infrastructure/llm/plan-mock";
import { evaluationOptions, loadEvaluationCases } from "./evaluation/persona-fixtures";

const cases = loadEvaluationCases().slice(0, 4);
const suite = { suiteId: "r01-quality-30", suiteVersion: "1.0.0", cases };

describe("narration plan mock evaluation matrix", () => {
  it("records grounding per repetition, counts rejection codes and never invents human scores", async () => {
    const report = await evaluateNarrationMatrix(suite, {
      ...evaluationOptions(),
      repetitions: 2,
    });
    expect(NarrationEvaluationReportSchema.safeParse(report).success).toBe(true);
    expect(report.rows).toHaveLength(cases.length * 2 * 2);
    expect(report.summary).toMatchObject({ groundingPassed: true, rejected: 0, failed: 0 });
    expect(report.rejectionCounts).toEqual({});
    expect(report.humanEvaluation.status).toBe("not-performed");
    expect(report.cases.every((item) => item.beatIds.includes("limitations"))).toBe(true);
    const review = renderNarrationReview(report);
    expect(review).toContain("근거 검증 통과: 16/16");
    expect(review).not.toMatch(/2024-02-10|birthDate/);
  });
  it("classifies malformed and forged supplier output by rejection code without aborting the matrix", async () => {
    let call = 0;
    const base = createPlanMockProvider();
    const provider = {
      kind: "mock" as const,
      async generate(request: Parameters<typeof base.generate>[0]) {
        const result = (await base.generate(request)) as {
          status: "completed";
          outputText: string;
        };
        call++;
        if (call % 3 === 1) return { status: "completed", outputText: "not json" };
        if (call % 3 === 2) {
          const draft = JSON.parse(result.outputText);
          draft.beats[0].usedAliases = ["E99"];
          return { status: "completed", outputText: JSON.stringify(draft) };
        }
        return result;
      },
    };
    const report = await evaluateNarrationMatrix(
      { ...suite, cases: cases.slice(0, 1) },
      { ...evaluationOptions(), provider, repetitions: 3 },
    );
    expect(report.summary).toMatchObject({ total: 6, completed: 2, rejected: 4, failed: 0 });
    expect(report.rejectionCounts).toEqual({ JSON_PARSE: 2, ALIAS_UNKNOWN: 2 });
    expect(
      report.rows.filter((row) => row.status === "rejected").every((row) => row.beats === null),
    ).toBe(true);
  });
  it("denies live providers and rejects duplicate cases before any call", async () => {
    await expect(
      evaluateNarrationMatrix(suite, {
        ...evaluationOptions(),
        provider: { kind: "openai", generate: async () => ({}) },
      }),
    ).rejects.toMatchObject({ code: "LIVE_DISABLED" });
    await expect(
      evaluateNarrationMatrix({ ...suite, cases: [cases[0], cases[0]] }, evaluationOptions()),
    ).rejects.toThrow();
  });
});
