import { z } from "zod";
import golden from "../fixtures/independent-core-golden.json";
import manifest from "../fixtures/persona-evaluation-cases.json";
import { fingerprintDependencies } from "../helpers/fingerprint-input";
import { executeFeature } from "../../src/application/saju/features/index";
import {
  AnalysisInputSchema,
  BirthInputSchema,
  CalculationPolicySchema,
} from "../../src/domain/input/index";
import { createSyntheticPersonaCatalog } from "../../src/infrastructure/persona/synthetic-catalog";
import { loadInterpretationCatalog } from "../../src/infrastructure/interpretation/catalog";
import { createPlanMockProvider } from "../../src/infrastructure/llm/plan-mock";
import { MemoryExperimentConcurrencyGate } from "../../src/infrastructure/llm/experiment-concurrency";
import { nodeSha256Adapter } from "../../src/infrastructure/hashing/index";

export const evaluationManifest = z
  .strictObject({
    suiteId: z.literal("r01-quality-30"),
    suiteVersion: z.literal("1.0.0"),
    repetitions: z.literal(3),
    cases: z
      .array(
        z.strictObject({
          id: z.string().regex(/^N\d{2}$/),
          category: z.enum([
            "calendar",
            "day",
            "term",
            "timezone",
            "solar",
            "unknown",
            "unavailable",
          ]),
          title: z.string().min(1),
          sourceCase: z
            .string()
            .regex(/^G\d{2}$/)
            .optional(),
          birthInput: z.strictObject(BirthInputSchema.unwrap().shape).partial().optional(),
          policy: CalculationPolicySchema.unwrap().partial().optional(),
        }),
      )
      .length(30)
      .refine((rows) => new Set(rows.map((row) => row.id)).size === 30),
  })
  .parse(manifest);

const dependencies = { ...fingerprintDependencies, hash: nodeSha256Adapter };

/** Each synthetic case becomes an F03 FeatureResult through the real engine (no network). */
export function loadEvaluationCases() {
  return evaluationManifest.cases.map((row) => {
    const source = row.sourceCase
      ? golden.cases.find((item) => item.id === row.sourceCase)
      : undefined;
    if (row.sourceCase && !source) throw new Error("Evaluation source case missing.");
    const input = AnalysisInputSchema.parse({
      birthInput: { ...golden.baseInput.birthInput, ...source?.birthInput, ...row.birthInput },
      calculationPolicy: {
        ...golden.baseInput.calculationPolicy,
        ...source?.policy,
        ...row.policy,
      },
    });
    return {
      id: row.id,
      category: row.category,
      title: row.title,
      result: executeFeature({ featureId: "F03", ...input }, dependencies),
    };
  });
}

// Local evaluation registrations only; these are not approved product characters.
export const evaluationProfiles = createSyntheticPersonaCatalog().profiles;
export const evaluationSelections = evaluationProfiles.map((item) => ({
  personaId: item.personaId,
  personaVersion: item.personaVersion,
}));

export function evaluationOptions(now = Date.now()) {
  return {
    registry: createSyntheticPersonaCatalog().registry,
    interpretation: loadInterpretationCatalog(),
    selections: evaluationSelections,
    hash: nodeSha256Adapter,
    repetitions: evaluationManifest.repetitions,
    provider: createPlanMockProvider(),
    gate: new MemoryExperimentConcurrencyGate(),
    policy: {
      enabled: true,
      expiresAt: now + 600_000,
      allowedPrincipalIds: ["quality-evaluator"],
      maxConcurrent: 1,
      maxRequestBytes: 131072,
    },
    environment: () => "development",
    now: () => now,
    resolveAccess: async () => ({ principalId: "quality-evaluator", sessionId: "r01-quality" }),
  };
}
