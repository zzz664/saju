import { createExperimentRunner, type ExperimentRunnerOptions } from "./experiment";
import { receiveNarrationText } from "./index";
import { preparePersonaNarration, validatePersonaOutput, evaluatePersonaStyle } from "../../domain/persona/narration";
import { COMMON_SYSTEM_PROMPT_VERSION, PERSONA_PROMPT_VERSION } from "../../domain/persona/prompt";
import type { ApprovedPersonaRegistry } from "../../domain/persona/index";
import type { Sha256Adapter } from "../../domain/core-fingerprint/index";

/** Server-approved registry/spec plus the existing mock-only experiment guard. No HTTP route. */
export function createPersonaExperiment(options: ExperimentRunnerOptions & {
  readonly registry: ApprovedPersonaRegistry; readonly selection: unknown; readonly spec: unknown; readonly hash: Sha256Adapter;
}) {
  return createExperimentRunner({ ...options, execute: async (core, provider, control) => {
    const context = preparePersonaNarration(core, options);
    const text = await receiveNarrationText(context.request, provider, control.signal);
    const draft = validatePersonaOutput(text, context);
    return Object.freeze({ mode: "r01-internal-json" as const, featureId: draft.featureId, sourceStatus: context.data.status,
      sections: draft.sections, limitations: context.data.limitations, cache: context.cache,
      styleEvaluation: evaluatePersonaStyle(draft, context.profile),
      meta: Object.freeze({ personaId: context.profile.personaId, personaVersion: context.profile.personaVersion,
        promptVersion: PERSONA_PROMPT_VERSION, commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION,
        modelId: "gpt-4o-mini", providerKind: "mock", narrativeSpecId: context.spec.specId,
        narrativeSpecVersion: context.spec.specVersion, outputSchemaVersion: "1.0.0" }),
    });
  } });
}
