import { createExperimentRunner, type ExperimentRunnerOptions } from "./experiment";
import { receiveNarrationText } from "./index";
import { preparePersonaNarration, validatePersonaOutput, evaluatePersonaStyle } from "../../domain/persona/narration";
import { COMMON_SYSTEM_PROMPT_VERSION, PERSONA_PROMPT_VERSION } from "../../domain/persona/prompt";
import type { ApprovedPersonaRegistry } from "../../domain/persona/index";
import type { Sha256Adapter } from "../../domain/core-fingerprint/index";

type PersonaOptions = {
  readonly registry: ApprovedPersonaRegistry; readonly selection: unknown; readonly spec: unknown; readonly hash: Sha256Adapter;
  readonly model?: string;
};
/** Shared R01 execution. Callers must supply their server access/budget guard. */
export async function narratePersona(core: unknown, provider: ExperimentRunnerOptions["provider"], options: PersonaOptions, control: { signal?: AbortSignal } = {}) {
    const context = preparePersonaNarration(core, options);
    const text = await receiveNarrationText(context.request, provider, control.signal);
    const draft = validatePersonaOutput(text, context);
    return Object.freeze({ mode: "r01-internal-json" as const, featureId: draft.featureId, sourceStatus: context.data.status,
      sections: draft.sections, limitations: context.data.limitations, cache: context.cache,
      styleEvaluation: evaluatePersonaStyle(draft, context.profile),
      meta: Object.freeze({ personaId: context.profile.personaId, personaVersion: context.profile.personaVersion,
        promptVersion: PERSONA_PROMPT_VERSION, commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION,
        modelId: context.request.model, providerKind: provider.kind, register: context.profile.voice.register, narrativeSpecId: context.spec.specId,
        narrativeSpecVersion: context.spec.specVersion, outputSchemaVersion: "1.0.0" }),
    });
}
/** Existing offline experiments remain Mock-only. */
export function createPersonaExperiment(options: ExperimentRunnerOptions & PersonaOptions) {
  return createExperimentRunner({ ...options, execute: (core, provider, control) => narratePersona(core, provider, options, control) });
}
