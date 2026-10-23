import { describe, expect, it, vi } from "vitest";
import { narrateFeature, prepareFeatureNarration } from "@/application/narration/feature";
import { createPlanMockProvider } from "@/infrastructure/llm/plan-mock";
import { createApiTestCatalog } from "@/server/api-test-catalog";

const catalog = createApiTestCatalog();
const options = (persona = "synthetic-style") => ({
  ...catalog,
  selection: catalog.selection(persona),
});

describe("feature narration through the plan path", () => {
  it.each(["synthetic-known", "synthetic-unknown", "synthetic-unavailable"])(
    "narrates %s in both approved voices without network and with grounded beats",
    async (fixture) => {
      const source = catalog.source(fixture, "F03");
      for (const persona of catalog.personas) {
        const provider = createPlanMockProvider(),
          generate = vi.spyOn(provider, "generate");
        const result = await narrateFeature(source, provider, options(persona.id));
        expect(result.featureId).toBe("F03");
        expect(result.sourceStatus).toBe(
          fixture === "synthetic-unavailable" ? "unavailable" : "partial",
        );
        expect(result.grounding.passed).toBe(true);
        expect(result.beats.map((beat) => beat.beatId)).toEqual(
          result.plan.beats.map((beat) => beat.beatId),
        );
        if (fixture === "synthetic-unavailable")
          expect(result.beats.map((beat) => beat.role)).toEqual(["limitations"]);
        expect(result.styleEvaluation.issues.map((issue) => issue.code)).not.toContain(
          "REGISTER_MIX",
        );
        expect(result.meta).toMatchObject({
          personaId: persona.id,
          providerKind: "mock",
          contractVersion: "2.0.0",
          outputSchemaVersion: "2.0.0",
        });
        const request = generate.mock.calls[0][0];
        expect(JSON.stringify(request.messages)).not.toMatch(
          /birthDate|birthTime|2024-02-10|05:30|m03:strengths:context-review|primary:M03/,
        );
        expect(request.plan).toEqual(result.plan);
      }
    },
  );
  it("rejects external or altered feature JSON before any provider call", async () => {
    const provider = createPlanMockProvider(),
      generate = vi.spyOn(provider, "generate");
    const source = catalog.source("synthetic-known", "F03");
    await expect(
      narrateFeature(JSON.parse(JSON.stringify(source)), provider, options()),
    ).rejects.toMatchObject({ code: "INPUT_REJECTED" });
    await expect(narrateFeature({ ...source }, provider, options())).rejects.toMatchObject({
      code: "INPUT_REJECTED",
    });
    expect(() =>
      prepareFeatureNarration(source, { ...options(), selection: { personaId: "x" } }),
    ).toThrow();
    expect(() =>
      prepareFeatureNarration(source, { ...options(), interpretation: { bad: true } }),
    ).toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
  it("surfaces provider refusal, incompleteness and failure as sanitized codes", async () => {
    const source = catalog.source("synthetic-known", "F03");
    for (const [outcome, code] of [
      ["refused", "REFUSED"],
      ["incomplete", "INCOMPLETE"],
      ["failed", "PROVIDER_FAILED"],
    ] as const)
      await expect(
        narrateFeature(source, createPlanMockProvider({ outcome }), options()),
      ).rejects.toMatchObject({ code });
    const broken = {
      kind: "mock" as const,
      generate: async () => {
        throw new Error("private upstream detail");
      },
    };
    await expect(narrateFeature(source, broken, options())).rejects.toMatchObject({
      code: "PROVIDER_FAILED",
      message: "Narration provider failed.",
    });
    const controller = new AbortController();
    controller.abort();
    await expect(
      narrateFeature(source, createPlanMockProvider(), options(), { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });
  it("keeps the calculated feature result and its hash untouched", async () => {
    const source = catalog.source("synthetic-known", "F03");
    const before = JSON.stringify(source);
    await narrateFeature(source, createPlanMockProvider(), options("synthetic-formal"));
    expect(JSON.stringify(source)).toBe(before);
    expect(catalog.source("synthetic-known", "F03")).toBe(source);
    const prepared = prepareFeatureNarration(source, options());
    expect(prepared.cache.analysisKey).toBe(source.core.fingerprint.hash);
    expect(prepared.cache.featureKey).toBe(source.cacheKey);
    expect(Object.isFrozen(prepared.plan)).toBe(true);
  });
});
