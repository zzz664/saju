import { describe, expect, it } from "vitest";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { preparePersonaNarration } from "@/domain/persona/narration";
import { evaluationProfiles } from "./evaluation/persona-fixtures";

describe("synthetic persona prompt consistency", () => {
  it.each([
    {
      id: "synthetic-style",
      version: "1.0.0",
      register: "haeyo",
      preferred: "먼저 살펴볼게요",
      example: "제공된 근거만으로 확정할 수는 없어요.",
    },
    {
      id: "synthetic-formal",
      version: "1.0.1",
      register: "hapsyo",
      preferred: "먼저 살펴보겠습니다",
      example: "제공된 근거만으로 확정할 수는 없습니다.",
    },
  ])(
    "sends consistent register, preferred expression and example for $id",
    ({ id, version, register, preferred, example }) => {
      const catalog = createApiTestCatalog();
      const selection = catalog.selection(id);
      expect(selection).toEqual({ personaId: id, personaVersion: version });
      const prepared = preparePersonaNarration(catalog.core("synthetic-known"), {
        ...catalog,
        selection,
      });
      const developer = JSON.parse(prepared.request.input[0].content.split("\n").at(-1)!);
      expect(developer.persona).toMatchObject({
        personaId: id,
        personaVersion: version,
        voice: { register, preferredExpressions: [preferred] },
        examples: [{ prefer: example }],
      });
      const supplied = [
        ...developer.persona.voice.preferredExpressions,
        ...developer.persona.examples.map((item: { prefer: string }) => item.prefer),
      ];
      for (const text of supplied)
        expect(text).toMatch(register === "haeyo" ? /요[.!?]?$/ : /니다[.!?]?$/);
    },
  );

  it("uses the same approved JSON profiles for API and evaluation and rejects retired or unknown selections", () => {
    const catalog = createApiTestCatalog(),
      selection = catalog.selection("synthetic-formal");
    expect(evaluationProfiles).toEqual(
      catalog.personas.map((item) => catalog.registry.load(catalog.selection(item.id))),
    );
    expect(() => catalog.selection("unapproved")).toThrow();
    expect(() => catalog.registry.load({ ...selection, personaVersion: "1.0.0" })).toThrow();
  });

  it("preserves the analysis hash and facts when selecting a different style", () => {
    const catalog = createApiTestCatalog(),
      core = catalog.core("synthetic-known");
    const haeyo = preparePersonaNarration(core, {
      ...catalog,
      selection: catalog.selection("synthetic-style"),
    });
    const formal = preparePersonaNarration(core, {
      ...catalog,
      selection: catalog.selection("synthetic-formal"),
    });
    expect(formal.cache.analysisKey).toBe(haeyo.cache.analysisKey);
    expect(formal.data).toEqual(haeyo.data);
    expect(formal.cache.narrationKey).not.toBe(haeyo.cache.narrationKey);
  });
});
