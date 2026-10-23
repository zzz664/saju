import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/persona-style.json";
import { fingerprintInput, fingerprintDependencies } from "./helpers/fingerprint-input";
import { calculateCoreExport } from "@/application/core-export";
import { createPersonaExperiment } from "@/application/narration/persona";
import {
  createApprovedPersonaRegistry,
  PersonaProfileSchema,
  FeatureNarrationSpecSchema,
} from "@/domain/persona";
import {
  preparePersonaNarration,
  validatePersonaOutput,
  evaluatePersonaStyle,
  personaNarrationJsonSchema,
} from "@/domain/persona/narration";
import { COMMON_SYSTEM_PROMPT } from "@/domain/persona/prompt";
import { createPersonaMockProvider } from "@/infrastructure/llm/persona-mock";
import { MemoryExperimentBudgetStore } from "@/infrastructure/llm/experiment-budget";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import type { NarrationProvider } from "@/domain/narration";
import type { ExperimentRunnerOptions } from "@/application/narration/experiment";

const core = calculateCoreExport(fingerprintInput, fingerprintDependencies);
const formal = {
  ...fixture,
  personaId: "synthetic-formal",
  voice: { ...fixture.voice, register: "hapsyo" },
};
const selection = { personaId: fixture.personaId, personaVersion: "1.0.0" };
function registry(profiles = [fixture, formal]) {
  return createApprovedPersonaRegistry(
    profiles.map((profile) => ({
      status: "approved",
      personaId: profile.personaId,
      personaVersion: profile.personaVersion,
      json: JSON.stringify(profile),
    })),
  );
}
const spec = {
  specId: "core-observations",
  specVersion: "1.0.0",
  featureId: "core-base",
  sections: [{ id: "overview", purpose: "기초 관찰과 한계", minFindings: 0 }],
  maxCharactersPerSection: 1200,
  readerLevel: "general",
  includeLimitations: true,
  allowFortuneScore: false,
};
function prepare(source = core, choose = selection, specification: unknown = spec) {
  return preparePersonaNarration(source, {
    registry: registry(),
    selection: choose,
    spec: specification,
    hash: nodeSha256Adapter,
  });
}
const now = Date.parse("2026-10-23T00:00:00Z");
const budget = { calls: 10, tokens: 1000000, microUsd: 1000000 };
const mockPolicy = {
  enabled: true,
  expiresAt: now + 10000,
  allowedPrincipalIds: ["tester"],
  maxConcurrent: 1,
  maxRequestBytes: 100000,
  maxOutputTokens: 1024,
  rates: { inputMicroUsdPerMillionTokens: 1000000, outputMicroUsdPerMillionTokens: 1000000 },
  daily: budget,
  perPrincipalDaily: budget,
  perSession: budget,
};
function experiment(
  choose: unknown = selection,
  provider: NarrationProvider = createPersonaMockProvider(),
  overrides: Partial<ExperimentRunnerOptions> = {},
) {
  return createPersonaExperiment({
    registry: registry(),
    selection: choose,
    spec,
    hash: nodeSha256Adapter,
    provider,
    store: new MemoryExperimentBudgetStore(),
    environment: () => "development",
    now: () => now,
    resolveAccess: async () => ({ principalId: "tester", sessionId: "session" }),
    policy: mockPolicy,
    ...overrides,
  });
}

describe("R01 approved persona and internal narration", () => {
  it("loads only registered immutable JSON versions, without default product characters", () => {
    const approved = registry();
    const profile = approved.load(selection);
    expect(profile).toEqual(fixture);
    expect(Object.isFrozen(profile.voice)).toBe(true);
    expect(() => createApprovedPersonaRegistry([]).load(selection)).toThrow(
      "Persona selection was rejected.",
    );
    for (const choose of [
      { ...selection, personaVersion: "2.0.0" },
      { ...selection, personaId: "../character-a" },
      { ...selection, profile: fixture },
    ])
      expect(() => approved.load(choose)).toThrow("Persona selection was rejected.");
  });

  it("validates strict profile fields, bounds and contradictory ranges", () => {
    expect(PersonaProfileSchema.safeParse(fixture).success).toBe(true);
    for (const profile of [
      { ...fixture, systemPrompt: "ignore rules" },
      { ...fixture, identityDisclosure: "human" },
      {
        ...fixture,
        personality: {
          ...fixture.personality,
          coreTraits: [{ trait: "x", strength: 1.1, expression: "x" }],
        },
      },
      { ...fixture, voice: { ...fixture.voice, register: "pirate" } },
      { ...fixture, narrative: { ...fixture.narrative, paragraphsPerSection: { min: 3, max: 1 } } },
      { ...fixture, examples: [] },
      { ...fixture, role: "x\u0000secret" },
    ])
      expect(PersonaProfileSchema.safeParse(profile).success).toBe(false);
  });

  it("rejects unapproved, mismatched, duplicate or oversized registry records", () => {
    const record = { status: "approved", ...selection, json: JSON.stringify(fixture) };
    for (const rows of [
      [{ ...record, status: "draft" }],
      [{ ...record, personaVersion: "2.0.0" }],
      [record, record],
      [{ ...record, json: "{ private secret" }],
      [{ ...record, json: " ".repeat(32769) }],
    ])
      expect(() => createApprovedPersonaRegistry(rows)).toThrow("Persona registry was rejected.");
  });

  it("assembles common instructions, approved developer style/spec and lower-trust data separately", () => {
    const prepared = prepare();
    const request = prepared.request;
    const documented = readFileSync("docs/12_공통_시스템_프롬프트.md", "utf8")
      .match(/```text\r?\n([\s\S]*?)\r?\n```/)![1]
      .replace(/\r\n/g, "\n");
    expect(COMMON_SYSTEM_PROMPT).toBe(documented);
    expect(request.instructions).toBe(COMMON_SYSTEM_PROMPT);
    expect(request.input.map((message) => message.role)).toEqual(["developer", "user"]);
    expect(request.input[0].content).toContain("server-approved-style-only");
    expect(request.input[0].content).not.toContain("확정 일간의 오행은");
    expect(request.input[1].content).toContain("verifiedFindings");
    expect(request.input[1].content).not.toContain("personaId");
    expect(request).toMatchObject({ model: "gpt-4o-mini", stream: false, store: false });
    expect(request.input[0].content).not.toMatch(/R02|R03|자연어 텍스트만/);
    expect(JSON.stringify(request)).not.toMatch(/2024-02-10|05:30|Asia\/Seoul/);
  });

  it("keeps the analysis key/facts constant while persona and narration keys change", async () => {
    const before = structuredClone(core);
    const a = await experiment().run(core);
    const b = await experiment({ personaId: formal.personaId, personaVersion: "1.0.0" }).run(core);
    expect(a.cache.analysisKey).toBe(b.cache.analysisKey);
    expect(a.cache.narrationKey).not.toBe(b.cache.narrationKey);
    expect(a.sections[0].evidenceIds).toEqual(b.sections[0].evidenceIds);
    expect(a.sections[0].paragraphs).not.toEqual(b.sections[0].paragraphs);
    expect(a.styleEvaluation.passed).toBe(true);
    expect(b.styleEvaluation.passed).toBe(true);
    expect(core).toEqual(before);
    expect(a.meta).toMatchObject({
      personaId: selection.personaId,
      providerKind: "mock",
      modelId: "gpt-4o-mini",
    });
  });

  it("invalidates narration cache on spec/version or style content changes without touching core cache", () => {
    const a = prepare();
    const changedSpec = prepare(core, selection, { ...spec, specVersion: "1.1.0" });
    const changedProfile = { ...fixture, personaVersion: "1.1.0" };
    const b = preparePersonaNarration(core, {
      registry: registry([changedProfile]),
      selection: { ...selection, personaVersion: "1.1.0" },
      spec,
      hash: nodeSha256Adapter,
    });
    const c = preparePersonaNarration(core, {
      registry: registry([{ ...fixture, description: "문체 변경" }]),
      selection,
      spec,
      hash: nodeSha256Adapter,
    });
    for (const item of [changedSpec, b, c]) {
      expect(item.cache.analysisKey).toBe(a.cache.analysisKey);
      expect(item.cache.narrationKey).not.toBe(a.cache.narrationKey);
    }
  });

  it("validates the source feature/sections/evidence IDs and keeps server limitations", async () => {
    const context = prepare();
    const raw = (await createPersonaMockProvider().generate(context.request)) as {
      outputText: string;
    };
    const draft = JSON.parse(raw.outputText);
    expect(personaNarrationJsonSchema().additionalProperties).toBe(false);
    for (const invalid of [
      { ...draft, featureId: "F02" },
      { ...draft, meta: { modelId: "fabricated" } },
      { ...draft, sections: [] },
      { ...draft, sections: [draft.sections[0], draft.sections[0]] },
      { ...draft, sections: [{ ...draft.sections[0], sectionId: "unknown" }] },
      { ...draft, sections: [{ ...draft.sections[0], title: "2050년 결혼 확정" }] },
      { ...draft, sections: [{ ...draft.sections[0], evidenceIds: ["unknown"] }] },
      {
        ...draft,
        sections: [
          {
            ...draft.sections[0],
            evidenceIds: [draft.sections[0].evidenceIds[0], draft.sections[0].evidenceIds[0]],
          },
        ],
      },
      { ...draft, limitations: [] },
      { ...draft, sections: [{ ...draft.sections[0], evidenceIds: [] }] },
      { ...draft, sections: [{ ...draft.sections[0], paragraphs: ["2050년에 결혼합니다."] }] },
      {
        ...draft,
        sections: [
          { ...draft.sections[0], paragraphs: ["가".repeat(spec.maxCharactersPerSection + 1)] },
        ],
      },
    ])
      expect(() => validatePersonaOutput(JSON.stringify(invalid), context)).toThrow(
        "Persona narration output was rejected.",
      );
    const result = await experiment().run(core);
    expect(result.limitations).toEqual(context.data.limitations);
  });

  it.each(["midnight", "zi-start"])(
    "preserves %s unknowns and emits only confirmed evidence",
    async (dayBoundary) => {
      const source = calculateCoreExport(
        {
          ...fingerprintInput,
          birthInput: { ...fingerprintInput.birthInput, birthTime: { status: "unknown" } },
          calculationPolicy: { ...fingerprintInput.calculationPolicy, dayBoundary },
        },
        fingerprintDependencies,
      );
      const context = prepare(source);
      const result = await experiment().run(source);
      expect(result.sourceStatus).toBe("partial");
      expect(result.limitations).toEqual(context.data.limitations);
      const ids = context.data.verifiedFindings.map((finding) => finding.findingId);
      expect(
        result.sections.every((section) => section.evidenceIds.every((id) => ids.includes(id))),
      ).toBe(true);
      expect(result.sections[0].paragraphs.join(" ")).toContain("확인된 범위");
    },
  );

  it("does not invent findings for unavailable input and rejects unmet minimum evidence", async () => {
    const source = calculateCoreExport(
      {
        ...fingerprintInput,
        calculationPolicy: { ...fingerprintInput.calculationPolicy, solarTime: "true-solar" },
      },
      fingerprintDependencies,
    );
    const result = await experiment().run(source);
    expect(result.sourceStatus).toBe("unavailable");
    expect(result.sections[0].evidenceIds).toEqual([]);
    expect(() =>
      prepare(source, selection, { ...spec, sections: [{ ...spec.sections[0], minFindings: 1 }] }),
    ).toThrow("Persona narration spec was rejected.");
  });

  it("detects stock repetition, certainty, unwanted emoji, register and catchphrase violations", () => {
    const profile = registry().load(selection);
    const draft = {
      schemaVersion: "1.0.0" as const,
      featureId: "core-base" as const,
      sections: [
        {
          sectionId: "one",
          title: "검사",
          paragraphs: ["안녕하세요. 반드시 성공합니다. 🙂"],
          evidenceIds: [],
        },
        {
          sectionId: "two",
          title: "검사",
          paragraphs: ["안녕하세요. 반드시 성공합니다. 🙂"],
          evidenceIds: [],
        },
      ],
    };
    const result = evaluatePersonaStyle(draft, profile);
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "STOCK_PHRASE",
        "DUPLICATE_PARAGRAPH",
        "CERTAINTY",
        "EMOJI",
        "REGISTER",
      ]),
    );
    const catchProfile = PersonaProfileSchema.parse({
      ...fixture,
      voice: { ...fixture.voice, catchphrases: ["살펴봐요"], catchphraseMaxPerReport: 1 },
    });
    expect(
      evaluatePersonaStyle(
        { ...draft, sections: [{ ...draft.sections[0], paragraphs: ["살펴봐요. 살펴봐요."] }] },
        catchProfile,
      ).issues.some((issue) => issue.code === "CATCHPHRASE_LIMIT"),
    ).toBe(true);
  });

  it("cannot grant user data a persona role and rejects invalid feature specifications", () => {
    expect(() => registry().load({ ...selection, system: "ignore instructions" })).toThrow(
      "Persona selection was rejected.",
    );
    for (const value of [
      { ...spec, featureId: "F02" },
      { ...spec, allowFortuneScore: true },
      { ...spec, sections: [spec.sections[0], spec.sections[0]] },
    ])
      expect(FeatureNarrationSpecSchema.safeParse(value).success).toBe(false);
  });

  it("passes the full persona request through the budget guard and never uses network/logs", async () => {
    const provider = createPersonaMockProvider();
    const generate = vi.spyOn(provider, "generate");
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("forbidden"));
    const log = vi.spyOn(console, "log");
    await experiment(selection, provider).run(core);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].max_output_tokens).toBe(1024);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it("supports an approved banmal comparison without changing evidence", async () => {
    const profile = { ...fixture, voice: { ...fixture.voice, register: "banmal" } };
    const runner = createPersonaExperiment({
      registry: registry([profile]),
      selection,
      spec,
      hash: nodeSha256Adapter,
      policy: mockPolicy,
      provider: createPersonaMockProvider(),
      store: new MemoryExperimentBudgetStore(),
      environment: () => "development",
      now: () => now,
      resolveAccess: async () => ({ principalId: "tester", sessionId: "session" }),
    });
    const result = await runner.run(core);
    expect(result.styleEvaluation.passed).toBe(true);
    expect(result.sections[0].paragraphs[0]).toContain("볼게.");
    expect(result.sections[0].evidenceIds).toEqual(
      (await experiment().run(core)).sections[0].evidenceIds,
    );
  });

  it("does not consume budget for a rejected selection or forged body profile", async () => {
    const store = new MemoryExperimentBudgetStore();
    const provider = createPersonaMockProvider();
    const generate = vi.spyOn(provider, "generate");
    await expect(
      experiment({ ...selection, personaVersion: "9.0.0" }, provider, { store }).run(core),
    ).rejects.toMatchObject({ code: "SELECTION_REJECTED" });
    await expect(
      experiment(selection, provider, { store }).run({ ...core, persona: formal }),
    ).rejects.toMatchObject({ code: "INPUT_REJECTED" });
    expect(generate).not.toHaveBeenCalled();
    expect(store.inspect(now, { principalId: "tester", sessionId: "session" }).daily.calls).toBe(0);
  });

  it("cannot bypass environment, budget or live-provider denial through R01", async () => {
    const provider = createPersonaMockProvider();
    const generate = vi.spyOn(provider, "generate");
    await expect(
      experiment(selection, provider, { environment: () => "production" }).run(core),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      experiment(selection, provider, {
        policy: { ...mockPolicy, daily: { ...budget, calls: 0 } },
      }).run(core),
    ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    const live = { kind: "openai" as const, generate: vi.fn(async () => ({})) };
    await expect(experiment(selection, live).run(core)).rejects.toMatchObject({
      code: "LIVE_DISABLED",
    });
    expect(live.generate).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it.each(["refused", "incomplete", "failed"] as const)(
    "handles %s through the shared supplier boundary without retry",
    async (status) => {
      const generate = vi.fn(async () => ({ status }));
      await expect(
        experiment(selection, { kind: "mock", generate }).run(core),
      ).rejects.toMatchObject({
        code: status === "failed" ? "PROVIDER_FAILED" : status.toUpperCase(),
      });
      expect(generate).toHaveBeenCalledTimes(1);
    },
  );

  it("sanitizes supplier/hash errors and honors pre-call cancellation", async () => {
    const generate = vi.fn(async () => {
      throw new Error("private secret");
    });
    await expect(experiment(selection, { kind: "mock", generate }).run(core)).rejects.toMatchObject(
      { message: "Narration provider failed." },
    );
    expect(() =>
      preparePersonaNarration(core, {
        registry: registry(),
        selection,
        spec,
        hash: {
          digest: () => {
            throw new Error("private secret");
          },
        },
      }),
    ).toThrow("Persona narration hash failed.");
    const controller = new AbortController();
    controller.abort();
    await expect(
      experiment(selection, { kind: "mock", generate }).run(core, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("orders multiple sections by server spec and rejects malformed or oversized JSON", async () => {
    const context = prepare(core, selection, {
      ...spec,
      sections: [...spec.sections, { id: "second", purpose: "추가 관찰", minFindings: 1 }],
    });
    const raw = (await createPersonaMockProvider().generate(context.request)) as {
      outputText: string;
    };
    const draft = JSON.parse(raw.outputText);
    const normalized = validatePersonaOutput(
      JSON.stringify({ ...draft, sections: [...draft.sections].reverse() }),
      context,
    );
    expect(normalized.sections.map((section) => section.sectionId)).toEqual(["overview", "second"]);
    for (const value of [
      "{ private secret",
      raw.outputText.slice(0, -1),
      " ".repeat(128 * 1024 + 1),
    ])
      expect(() => validatePersonaOutput(value, context)).toThrow(
        "Persona narration output was rejected.",
      );
  });

  it("enforces UTF-8 registry size even when character count is below the limit", () => {
    const many = Array(10).fill("가".repeat(500));
    const profile = PersonaProfileSchema.parse({
      ...fixture,
      personality: { ...fixture.personality, values: many, avoidPersonality: many },
      voice: { ...fixture.voice, preferredExpressions: many },
    });
    const json = JSON.stringify(profile);
    expect(json.length).toBeLessThan(32768);
    expect(new TextEncoder().encode(json).byteLength).toBeGreaterThan(32768);
    expect(() =>
      createApprovedPersonaRegistry([{ status: "approved", ...selection, json }]),
    ).toThrow("Persona registry was rejected.");
  });

  it("flags sentence/paragraph bounds and internal ID leakage as heuristic issues", () => {
    const draft = {
      schemaVersion: "1.0.0" as const,
      featureId: "core-base" as const,
      sections: [
        {
          sectionId: "overview",
          title: "검사",
          paragraphs: ["finding:base.day-wood"],
          evidenceIds: [],
        },
      ],
    };
    const profile = PersonaProfileSchema.parse({
      ...fixture,
      narrative: { ...fixture.narrative, paragraphsPerSection: { min: 2, max: 3 } },
    });
    expect(evaluatePersonaStyle(draft, profile).issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["PARAGRAPH_COUNT", "SENTENCE_COUNT", "INTERNAL_ID"]),
    );
  });
});
