import { z } from "zod";
import golden from "../fixtures/independent-core-golden.json";
import manifest from "../fixtures/persona-evaluation-cases.json";
import { fingerprintDependencies } from "../helpers/fingerprint-input";
import { calculateCoreExport } from "../../src/application/core-export/index";
import { AnalysisInputSchema, BirthInputSchema, CalculationPolicySchema } from "../../src/domain/input/index";
import { createSyntheticPersonaCatalog } from "../../src/infrastructure/persona/synthetic-catalog";
import { createPersonaMockProvider } from "../../src/infrastructure/llm/persona-mock";
import { MemoryExperimentBudgetStore } from "../../src/infrastructure/llm/experiment-budget";
import { nodeSha256Adapter } from "../../src/infrastructure/hashing/index";

export const evaluationManifest = z.strictObject({ suiteId: z.literal("r01-quality-30"), suiteVersion: z.literal("1.0.0"), repetitions: z.literal(3),
  cases: z.array(z.strictObject({ id: z.string().regex(/^N\d{2}$/), category: z.enum(["calendar", "day", "term", "timezone", "solar", "unknown", "unavailable"]),
    title: z.string().min(1), sourceCase: z.string().regex(/^G\d{2}$/).optional(),
    birthInput: z.strictObject(BirthInputSchema.unwrap().shape).partial().optional(), policy: CalculationPolicySchema.unwrap().partial().optional(),
  })).length(30).refine(rows => new Set(rows.map(row => row.id)).size === 30),
}).parse(manifest);

export function loadEvaluationCases() {
  return evaluationManifest.cases.map(row => {
    const source = row.sourceCase ? golden.cases.find(item => item.id === row.sourceCase) : undefined;
    if (row.sourceCase && !source) throw new Error("Evaluation source case missing.");
    const input = AnalysisInputSchema.parse({ birthInput: { ...golden.baseInput.birthInput, ...source?.birthInput, ...row.birthInput },
      calculationPolicy: { ...golden.baseInput.calculationPolicy, ...source?.policy, ...row.policy } });
    return { id: row.id, category: row.category, title: row.title, core: calculateCoreExport(input, fingerprintDependencies) };
  });
}

// Local evaluation registrations only; these are not approved product characters.
export const evaluationProfiles = createSyntheticPersonaCatalog().profiles;
export const evaluationSelections = evaluationProfiles.map(item => ({ personaId: item.personaId, personaVersion: item.personaVersion }));
export const evaluationSpec = { specId: "quality-core-observations", specVersion: "1.0.0", featureId: "core-base",
  sections: [{ id: "overview", purpose: "기초 관찰과 한계", minFindings: 0 }], maxCharactersPerSection: 1200,
  readerLevel: "general", includeLimitations: true, allowFortuneScore: false };

export function evaluationOptions(now = Date.now()) {
  const budget = { calls: 180, tokens: 100_000_000, microUsd: 100_000_000 };
  return { registry: createSyntheticPersonaCatalog().registry,
    selections: evaluationSelections, spec: evaluationSpec, hash: nodeSha256Adapter, repetitions: evaluationManifest.repetitions,
    provider: createPersonaMockProvider(), store: new MemoryExperimentBudgetStore(),
    policy: { enabled: true, expiresAt: now + 600_000, allowedPrincipalIds: ["quality-evaluator"], maxConcurrent: 1, maxRequestBytes: 131072, maxOutputTokens: 1024,
      rates: { inputMicroUsdPerMillionTokens: 1, outputMicroUsdPerMillionTokens: 1 }, daily: budget, perPrincipalDaily: budget, perSession: budget },
    environment: () => "development", now: () => now, resolveAccess: async () => ({ principalId: "quality-evaluator", sessionId: "r01-quality" }),
  };
}
