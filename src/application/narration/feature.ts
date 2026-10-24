import {
  createExperimentRunner,
  type ExperimentRunnerOptions,
} from "@/application/narration/experiment";
import { receiveNarrationText } from "@/application/narration";
import { buildFeatureNarrationInput } from "@/application/saju/features";
import type { Sha256Adapter } from "@/domain/core-fingerprint";
import type { FeatureResult } from "@/domain/features/schemas";
import {
  matchInterpretations,
  parseInterpretationCatalog,
  type InterpretationCatalog,
} from "@/domain/interpretation";
import { NarrationError, type NarrationProvider } from "@/domain/narration";
import { DEFAULT_NARRATION_MODEL, ModelIdSchema } from "@/domain/narration/model";
import {
  buildNarrationPlan,
  F02_PLAN_SPEC,
  F03_PLAN_SPEC,
  F04_PLAN_SPEC,
  NarrationPlanError,
  type NarrationPlan,
} from "@/domain/narration/plan";
import { COMMON_SYSTEM_PROMPT_VERSION, R01_PLAN_CONTRACT_VERSION } from "@/domain/narration/prompt";
import {
  composeNarrationRequest,
  narrationCacheKeys,
  NARRATION_OUTPUT_SCHEMA_VERSION,
  scoreNarrationStyle,
  validateNarrationDraft,
} from "@/domain/narration/render";
import type { ApprovedPersonaRegistry, PersonaProfile } from "@/domain/persona";

export type FeatureNarrationOptions = {
  readonly registry: ApprovedPersonaRegistry;
  readonly selection: unknown;
  readonly interpretation: InterpretationCatalog | unknown;
  readonly hash: Sha256Adapter;
  readonly model?: string;
  readonly spec?: unknown;
};

const SPECS = { F02: F02_PLAN_SPEC, F03: F03_PLAN_SPEC, F04: F04_PLAN_SPEC } as const;
const TOPICS = { F02: ["temperament"], F03: ["strengths"], F04: ["career"] } as const;

/**
 * FeatureResult → persona-independent plan → persona-specific request. The plan is the single
 * input for the developer JSON path today and for R02 beat-by-beat streaming later.
 */
export function prepareFeatureNarration(source: unknown, options: FeatureNarrationOptions) {
  const result = source as FeatureResult;
  let input: ReturnType<typeof buildFeatureNarrationInput>;
  try {
    input = buildFeatureNarrationInput(result);
  } catch {
    throw new NarrationError("INPUT_REJECTED");
  }
  const spec = options.spec ?? SPECS[input.featureId as keyof typeof SPECS];
  if (!spec) throw new NarrationPlanError("SPEC_REJECTED");
  const catalog = parseInterpretationCatalog(options.interpretation);
  const facts = result.core.document.facts;
  const interpretations = facts
    ? matchInterpretations(facts, catalog, {
        topics: TOPICS[input.featureId as keyof typeof TOPICS],
      })
    : [];
  const plan = buildNarrationPlan(
    {
      input,
      facts,
      interpretations,
      analysisKey: result.core.fingerprint.hash,
      featureCacheKey: result.cacheKey,
      interpretationCatalogVersion: catalog.catalogVersion,
    },
    spec,
    options.hash,
  );
  const persona: PersonaProfile = options.registry.load(options.selection);
  const modelId = ModelIdSchema.parse(options.model ?? DEFAULT_NARRATION_MODEL);
  const request = composeNarrationRequest(plan, persona, modelId);
  return Object.freeze({
    plan,
    persona,
    request,
    cache: narrationCacheKeys(plan, persona, modelId, options.hash),
  });
}
export type PreparedFeatureNarration = ReturnType<typeof prepareFeatureNarration>;

/** Shared R01 execution. Callers must supply their server access/budget guard. */
export async function narrateFeature(
  source: unknown,
  provider: NarrationProvider,
  options: FeatureNarrationOptions,
  control: { signal?: AbortSignal } = {},
) {
  const context = prepareFeatureNarration(source, options);
  const text = await receiveNarrationText(context.request, provider, control.signal);
  // Grounding is a hard gate; style is a soft score shown to operators.
  const narration = validateNarrationDraft(text, context.plan);
  return Object.freeze({
    mode: "r01-plan-json" as const,
    featureId: context.plan.featureId,
    sourceStatus: context.plan.status,
    beats: narration.beats,
    limitations: context.plan.limitations,
    plan: context.plan satisfies NarrationPlan,
    grounding: Object.freeze({ passed: true as const }),
    styleEvaluation: scoreNarrationStyle(narration, context.persona),
    cache: context.cache,
    meta: Object.freeze({
      personaId: context.persona.personaId,
      personaVersion: context.persona.personaVersion,
      register: context.persona.voice.register,
      commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION,
      contractVersion: R01_PLAN_CONTRACT_VERSION,
      outputSchemaVersion: NARRATION_OUTPUT_SCHEMA_VERSION,
      planSpecId: context.plan.specId,
      planSpecVersion: context.plan.specVersion,
      interpretationCatalogVersion: context.plan.provenance.interpretationCatalogVersion,
      modelId: context.request.modelId,
      providerKind: provider.kind,
    }),
  });
}
export type FeatureNarration = Awaited<ReturnType<typeof narrateFeature>>;

/** Offline experiments stay Mock-only behind the WBS-24 guard. */
export function createFeatureNarrationExperiment(
  options: ExperimentRunnerOptions & FeatureNarrationOptions,
) {
  return createExperimentRunner({
    ...options,
    execute: (source, provider, control) => narrateFeature(source, provider, options, control),
  });
}
