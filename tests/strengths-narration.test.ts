import { describe, expect, it, vi } from "vitest";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { narratePersona, prepareNarrationSource } from "@/application/narration/persona";
import { validatePersonaOutput, evaluatePersonaStyle } from "@/domain/persona/narration";
import { createPersonaMockProvider } from "@/infrastructure/llm/persona-mock";

const catalog = createApiTestCatalog();
const options = (persona = "synthetic-style") => ({
  ...catalog,
  spec: catalog.specFor("F03"),
  selection: catalog.selection(persona),
});
describe("F03 uses the shared R01 persona service", () => {
  it("keeps Mock sections distinguishable when only distribution observations are available", async () => {
    const context = prepareNarrationSource(catalog.source("synthetic-known", "F03"), options());
    const data = {
      ...context.data,
      verifiedFindings: context.data.verifiedFindings.filter((f) =>
        f.ruleId.startsWith("f03.observation.elements-"),
      ),
    } as typeof context.data;
    const output = (await createPersonaMockProvider().generate({ ...context.request, data })) as {
      outputText: string;
    };
    const draft = validatePersonaOutput(output.outputText, { ...context, data });
    expect(evaluatePersonaStyle(draft, context.profile).passed).toBe(true);
    expect(new Set(draft.sections.flatMap((s) => s.paragraphs)).size).toBe(3);
  });
  it.each(["synthetic-known", "synthetic-unknown", "synthetic-unavailable"])(
    "supports %s in both approved voices without network",
    async (fixture) => {
      const source = catalog.source(fixture, "F03");
      for (const persona of catalog.personas) {
        const provider = createPersonaMockProvider(),
          generate = vi.spyOn(provider, "generate");
        const result = await narratePersona(source, provider, options(persona.id));
        expect(result.featureId).toBe("F03");
        expect(result.sourceStatus).toBe(
          fixture === "synthetic-unavailable" ? "unavailable" : "partial",
        );
        expect(result.sections.map((s) => s.sectionId)).toEqual([
          "strengths",
          "weaknesses",
          "limits",
        ]);
        expect(result.styleEvaluation).toMatchObject({ passed: true, issues: [] });
        const request = generate.mock.calls[0][0];
        expect(JSON.stringify(request)).not.toMatch(
          /birthDate|birthTime|2024-02-10|m03:strengths:context-review/,
        );
        expect(
          request.data.verifiedFindings.every((f) => f.ruleId.startsWith("f03.observation.")),
        ).toBe(true);
        expect(request.output.jsonSchema.properties?.featureId).toMatchObject({ const: "F03" });
      }
    },
  );
  it("separates feature/model/style caches without changing the calculated result", () => {
    const source = catalog.source("synthetic-known", "F03");
    const first = prepareNarrationSource(source, options());
    const formal = prepareNarrationSource(source, options("synthetic-formal"));
    const model = prepareNarrationSource(source, { ...options(), model: "gpt-4.1-mini" });
    const base = prepareNarrationSource(catalog.core("synthetic-known"), {
      ...options(),
      spec: catalog.spec,
    });
    expect(formal.data).toEqual(first.data);
    expect(formal.cache.analysisKey).toBe(first.cache.analysisKey);
    expect(model.cache.analysisKey).toBe(first.cache.analysisKey);
    expect(
      new Set([
        first.cache.narrationKey,
        formal.cache.narrationKey,
        model.cache.narrationKey,
        base.cache.narrationKey,
      ]).size,
    ).toBe(4);
    expect(Reflect.set(first.data.verifiedFindings[0], "assertion", "invented")).toBe(false);
    expect(catalog.source("synthetic-known", "F03")).toBe(source);
  });
  it("rejects external/altered feature JSON and mismatched source/spec before a provider call", async () => {
    const provider = createPersonaMockProvider(),
      generate = vi.spyOn(provider, "generate");
    const source = catalog.source("synthetic-known", "F03");
    await expect(
      narratePersona(JSON.parse(JSON.stringify(source)), provider, options()),
    ).rejects.toThrow();
    await expect(
      narratePersona(catalog.core("synthetic-known"), provider, options()),
    ).rejects.toThrow();
    await expect(
      narratePersona(source, provider, { ...options(), spec: catalog.spec }),
    ).rejects.toThrow();
    await expect(
      narratePersona(source, provider, {
        ...options(),
        spec: { ...catalog.spec, featureId: "F02" },
      }),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
  it("rejects a substituted feature, unknown/candidate IDs and invented periods in model output", async () => {
    const context = prepareNarrationSource(catalog.source("synthetic-known", "F03"), options());
    const generated = (await createPersonaMockProvider().generate(context.request)) as {
      outputText: string;
    };
    const raw = JSON.parse(generated.outputText);
    expect(() => validatePersonaOutput(generated.outputText, context)).not.toThrow();
    for (const featureId of ["core-base", "F02"]) {
      expect(() => validatePersonaOutput(JSON.stringify({ ...raw, featureId }), context)).toThrow();
    }
    for (const evidenceIds of [["primary:M03:m03:strengths:resource-output"], ["unknown"], []]) {
      expect(() =>
        validatePersonaOutput(
          JSON.stringify({
            ...raw,
            sections: raw.sections.map((s: object) => ({ ...s, evidenceIds })),
          }),
          context,
        ),
      ).toThrow();
    }
    expect(() =>
      validatePersonaOutput(
        JSON.stringify({
          ...raw,
          sections: raw.sections.map((s: object) => ({ ...s, paragraphs: ["2027년 성공합니다."] })),
        }),
        context,
      ),
    ).toThrow();
  });
});
