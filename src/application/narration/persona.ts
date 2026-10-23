import {
  createExperimentRunner,
  type ExperimentRunnerOptions,
} from "@/application/narration/experiment";
import { receiveNarrationText } from "@/application/narration";
import {
  preparePersonaNarration,
  preparePersonaNarrationData,
  validatePersonaOutput,
  evaluatePersonaStyle,
} from "@/domain/persona/narration";
import { COMMON_SYSTEM_PROMPT_VERSION, PERSONA_PROMPT_VERSION } from "@/domain/persona/prompt";
import type { ApprovedPersonaRegistry } from "@/domain/persona";
import type { Sha256Adapter } from "@/domain/core-fingerprint";
import { buildFeatureNarrationInput } from "@/application/saju/features";
import { FeaturePersonaDataSchema } from "@/domain/persona/data";
import { FeatureNarrationSpecSchema, PersonaError } from "@/domain/persona";
import type { FeatureResult } from "@/domain/features/schemas";

type PersonaOptions = {
  readonly registry: ApprovedPersonaRegistry;
  readonly selection: unknown;
  readonly spec: unknown;
  readonly hash: Sha256Adapter;
  readonly model?: string;
};
/** Shared R01 execution. Callers must supply their server access/budget guard. */
export async function narratePersona(
  core: unknown,
  provider: ExperimentRunnerOptions["provider"],
  options: PersonaOptions,
  control: { signal?: AbortSignal } = {},
) {
  const context = prepareNarrationSource(core, options);
  const text = await receiveNarrationText(context.request, provider, control.signal);
  const draft = validatePersonaOutput(text, context);
  return Object.freeze({
    mode: "r01-internal-json" as const,
    featureId: draft.featureId,
    sourceStatus: context.data.status,
    sections: draft.sections,
    limitations: context.data.limitations,
    cache: context.cache,
    styleEvaluation: evaluatePersonaStyle(draft, context.profile),
    meta: Object.freeze({
      personaId: context.profile.personaId,
      personaVersion: context.profile.personaVersion,
      promptVersion: PERSONA_PROMPT_VERSION,
      commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION,
      modelId: context.request.modelId,
      providerKind: provider.kind,
      register: context.profile.voice.register,
      narrativeSpecId: context.spec.specId,
      narrativeSpecVersion: context.spec.specVersion,
      outputSchemaVersion: "1.0.0",
    }),
  });
}
export function prepareNarrationSource(source: unknown, options: PersonaOptions) {
  const spec = FeatureNarrationSpecSchema.parse(options.spec);
  if (spec.featureId === "core-base") return preparePersonaNarration(source, options);
  try {
    const result = source as FeatureResult;
    const projection = buildFeatureNarrationInput(result);
    if (projection.featureId !== spec.featureId) throw new PersonaError("INPUT_REJECTED");
    const data = FeaturePersonaDataSchema.parse({
      schemaVersion: "1.0.0",
      scope: "feature-observations",
      featureId: "F03",
      status: projection.status,
      verifiedFindings: projection.verifiedFindings.map(({ judgmentId, ...finding }) => ({
        ...finding,
        findingId: judgmentId,
      })),
      limitations: {
        codes: projection.limitations,
        notes: [
          "오행·십성의 관측 사실과 조건부 검토 질문만 제공한다. 실제 강점·약점·성격·능력을 확정하지 않는다.",
          "M01/M03의 강약·관법·관계 효과와 미확정 후보/보류는 확정 서술 대상에서 제외했다. 부분 해석을 완전한 풀이로 설명하지 않는다.",
          "겉글자와 지장간의 개수는 별도 집계다. 미상 기둥은 추정하지 않으며, 드러나지 않은 기호를 약점이나 결핍으로 해석하지 않는다.",
        ],
      },
    });
    return preparePersonaNarrationData(data, result.cacheKey, options);
  } catch {
    throw new PersonaError("INPUT_REJECTED");
  }
}
/** Existing offline experiments remain Mock-only. */
export function createPersonaExperiment(options: ExperimentRunnerOptions & PersonaOptions) {
  return createExperimentRunner({
    ...options,
    execute: (core, provider, control) => narratePersona(core, provider, options, control),
  });
}
