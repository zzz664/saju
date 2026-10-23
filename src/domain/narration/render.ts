import { z } from "zod";
import { escapeJsonForPrompt } from "@/domain/utilities";
import { canonicalizeJson, type Sha256Adapter } from "@/domain/core-fingerprint";
import type { PersonaProfile } from "@/domain/persona";
import { ModelIdSchema } from "@/domain/narration/model";
import { MAX_NARRATION_BYTES, type NarrationRequest } from "@/domain/narration";
import {
  COMMON_SYSTEM_PROMPT,
  COMMON_SYSTEM_PROMPT_VERSION,
  R01_PLAN_CONTRACT,
  R01_PLAN_CONTRACT_VERSION,
  R01_PLAN_EXAMPLE,
} from "@/domain/narration/prompt";
import { NarrationPlanSchema, type NarrationPlan } from "@/domain/narration/plan";
import {
  NarrationRejectionCodeSchema,
  StyleIssueCodeSchema,
  type NarrationRejectionCode,
  type StyleIssueCode,
} from "@/domain/narration/codes";

export { NarrationRejectionCodeSchema, StyleIssueCodeSchema };
export type { NarrationRejectionCode, StyleIssueCode };

export const NARRATION_OUTPUT_SCHEMA_VERSION = "2.0.0";
export const STYLE_POLICY_VERSION = "2.0.0";

const REGISTER_LABEL = {
  haeyo: "해요체(문장 끝 '~요', '~죠')",
  hapsyo: "합쇼체(문장 끝 '~합니다', '~입니다')",
  banmal: "반말(문장 끝 '~야', '~어', '~지')",
} as const;
const LEVEL_LABEL = {
  none: "쓰지 않음",
  low: "아주 가끔",
  medium: "적당히",
  sparse: "드물게",
} as const;

/** Approved persona JSON → a prose style guide the model can actually follow. */
export function renderStyleGuide(persona: PersonaProfile): string {
  const traits = persona.personality.coreTraits
    .map((trait) => `${trait.trait}(${trait.expression})`)
    .join(", ");
  const lines = [
    `[캐릭터 스타일 안내] ${persona.personaId} ${persona.personaVersion}`,
    `당신은 ${persona.role}이며 가상의 서술자임을 숨기지 않는다. 성격은 ${traits}이고 ${persona.personality.values.join("·")}을 중요하게 여긴다. ${persona.personality.avoidPersonality.join(", ")} 같은 태도는 피한다.`,
    `문체: ${REGISTER_LABEL[persona.voice.register]}로만 쓴다. 다른 높임법을 섞지 않는다. 사용자와의 거리는 '${persona.voice.relationship}'이고 문장 리듬은 '${persona.voice.sentenceRhythm}'이다. 말하는 방식은 ${persona.voice.directness === "soft" ? "부드럽게" : persona.voice.directness === "direct" ? "직접적으로" : "균형 있게"}, 비유는 ${LEVEL_LABEL[persona.voice.metaphorLevel]}, 유머는 ${LEVEL_LABEL[persona.voice.humorLevel]}, 이모지는 ${LEVEL_LABEL[persona.voice.emojiPolicy]}.`,
    `구성: 도입은 '${persona.narrative.introStrategy}'. 각 말풍선은 문단 ${persona.narrative.paragraphsPerSection.min}~${persona.narrative.paragraphsPerSection.max}개, 문단마다 문장 ${persona.narrative.sentencesPerParagraph.min}~${persona.narrative.sentencesPerParagraph.max}개. 흐름은 ${persona.narrative.preferredFlow.join(" → ")} 순서를 따르고 ${persona.narrative.avoid.join(", ")}은 피한다.`,
  ];
  if (persona.voice.preferredExpressions.length)
    lines.push(
      `자연스럽게 쓸 수 있는 표현: ${persona.voice.preferredExpressions.map((item) => `"${item}"`).join(", ")}.`,
    );
  if (persona.voice.avoidExpressions.length)
    lines.push(
      `쓰지 않는 표현: ${persona.voice.avoidExpressions.map((item) => `"${item}"`).join(", ")}.`,
    );
  if (persona.voice.catchphrases.length)
    lines.push(
      `캐릭터 고유 표현 ${persona.voice.catchphrases.map((item) => `"${item}"`).join(", ")}은 전체에서 최대 ${persona.voice.catchphraseMaxPerReport}회만 쓴다.`,
    );
  for (const example of persona.examples)
    lines.push(
      `문체 대조(${example.intent}) — 피할 문장: "${example.avoid}" / 지향 문장: "${example.prefer}". 이 예시는 문체 비교일 뿐 실제 분석 내용이 아니다.`,
    );
  return lines.join("\n");
}

/** The model sees only what it needs: titles, guidance, alias→text, source labels and limits. */
export function planForModel(plan: NarrationPlan) {
  return {
    featureId: plan.featureId,
    status: plan.status,
    chart: plan.chart
      ? {
          dayMaster: plan.chart.dayMaster,
          pillars: plan.chart.pillars.map((pillar) => ({
            label: pillar.label,
            stem: pillar.stem,
            branch: pillar.branch,
          })),
          unknownPositions: plan.chart.unknownPositions,
        }
      : null,
    beats: plan.beats.map((beat) => ({
      beatId: beat.beatId,
      title: beat.title,
      role: beat.role,
      guidance: beat.guidance,
      maxCharacters: beat.maxCharacters,
      evidence: beat.evidence.map((entry) => ({
        alias: entry.alias,
        text: entry.text,
        ...(entry.source ? { source: entry.source } : {}),
      })),
    })),
    limitations: plan.limitations,
  };
}

/** Strict output schema pinned to this plan's beat ids and aliases. */
export function narrationOutputJsonSchema(plan: NarrationPlan) {
  const aliases = plan.beats.flatMap((beat) => beat.evidence.map((entry) => entry.alias));
  return z.toJSONSchema(
    z.strictObject({
      beats: z
        .array(
          z.strictObject({
            beatId: z.enum(plan.beats.map((beat) => beat.beatId) as [string, ...string[]]),
            paragraphs: z.array(z.string().min(1).max(3000)).min(1).max(4),
            usedAliases: z.array(z.enum(aliases as [string, ...string[]])).max(12),
          }),
        )
        .min(1)
        .max(8),
    }),
    { target: "draft-2020-12" },
  );
}

export const NarrationDraftSchema = z
  .strictObject({
    beats: z
      .array(
        z
          .strictObject({
            beatId: z.string().min(1).max(41),
            paragraphs: z.array(z.string().trim().min(1).max(3000)).min(1).max(4).readonly(),
            usedAliases: z.array(z.string().min(1).max(4)).max(12).readonly(),
          })
          .readonly(),
      )
      .min(1)
      .max(8)
      .readonly(),
  })
  .readonly();
export type NarrationDraft = z.infer<typeof NarrationDraftSchema>;

export function composeNarrationRequest(
  rawPlan: unknown,
  persona: PersonaProfile,
  model: string,
): NarrationRequest {
  const plan = NarrationPlanSchema.parse(rawPlan);
  const modelId = ModelIdSchema.parse(model);
  return Object.freeze({
    modelId,
    plan,
    persona,
    instructions: COMMON_SYSTEM_PROMPT,
    messages: Object.freeze([
      Object.freeze({
        role: "developer" as const,
        content: [renderStyleGuide(persona), R01_PLAN_CONTRACT, R01_PLAN_EXAMPLE].join("\n\n"),
      }),
      Object.freeze({ role: "user" as const, content: escapeJsonForPrompt(planForModel(plan)) }),
    ]),
    output: { name: "narration_beats", jsonSchema: narrationOutputJsonSchema(plan) },
  });
}

/** Keys: analysisKey is persona-independent; narrationKey changes with any rendering input. */
export function narrationCacheKeys(
  plan: NarrationPlan,
  persona: PersonaProfile,
  modelId: string,
  hash: Sha256Adapter,
) {
  const descriptor = {
    policyId: "narration.plan-cache",
    policyVersion: "2.0.0",
    planKey: plan.planKey,
    personaId: persona.personaId,
    personaVersion: persona.personaVersion,
    personaDigest: hash.digest(canonicalizeJson(persona)),
    modelId,
    commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION,
    contractVersion: R01_PLAN_CONTRACT_VERSION,
    promptDigest: hash.digest(
      canonicalizeJson({
        common: COMMON_SYSTEM_PROMPT,
        contract: R01_PLAN_CONTRACT,
        example: R01_PLAN_EXAMPLE,
      }),
    ),
    outputSchemaVersion: NARRATION_OUTPUT_SCHEMA_VERSION,
  };
  return Object.freeze({
    analysisKey: plan.provenance.analysisKey,
    featureKey: plan.provenance.featureCacheKey,
    planKey: plan.planKey,
    narrationKey: hash.digest(canonicalizeJson(descriptor)),
  });
}

/** Grounding failures are hard rejections, each with a distinct code so live runs can be diagnosed. */
export class NarrationRejection extends Error {
  constructor(
    readonly code: NarrationRejectionCode,
    readonly beatId: string | null = null,
  ) {
    super(`Narration output rejected: ${code}`);
    this.name = "NarrationRejection";
  }
}
export const ValidatedNarrationSchema = z
  .strictObject({
    beats: z
      .array(
        z
          .strictObject({
            beatId: z.string(),
            role: z.enum(["chart", "observation", "interpretation", "limitations"]),
            title: z.string(),
            paragraphs: z.array(z.string()).min(1).max(4).readonly(),
            usedAliases: z.array(z.string()).readonly(),
          })
          .readonly(),
      )
      .min(1)
      .readonly(),
  })
  .readonly();
export type ValidatedNarration = z.infer<typeof ValidatedNarrationSchema>;

const FORBIDDEN_DATE = /\b\d{4}[-/.]\d{1,2}|\d{4}년|\d{1,2}월\s*\d{1,2}일/;
const INTERNAL_LEAK =
  /\bE\d{1,2}\b|\biu\.|\bsrc\.|\bf03\.|\bm03\.|primary:|finding:|verifiedFindings|beatId|usedAliases|system prompt|시스템 프롬프트/i;

export function validateNarrationDraft(text: string, plan: NarrationPlan): ValidatedNarration {
  if (new TextEncoder().encode(text).byteLength > MAX_NARRATION_BYTES)
    throw new NarrationRejection("BYTES");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new NarrationRejection("JSON_PARSE");
  }
  const parsed = NarrationDraftSchema.safeParse(raw);
  if (!parsed.success) throw new NarrationRejection("SCHEMA");
  const byId = new Map(parsed.data.beats.map((beat) => [beat.beatId, beat]));
  if (
    byId.size !== parsed.data.beats.length ||
    byId.size !== plan.beats.length ||
    plan.beats.some((beat) => !byId.has(beat.beatId))
  )
    throw new NarrationRejection("BEAT_SET");
  const beats = plan.beats.map((planned) => {
    const beat = byId.get(planned.beatId)!;
    const allowed = new Set(planned.evidence.map((entry) => entry.alias));
    if (
      beat.usedAliases.some((alias) => !allowed.has(alias)) ||
      new Set(beat.usedAliases).size !== beat.usedAliases.length
    )
      throw new NarrationRejection("ALIAS_UNKNOWN", planned.beatId);
    if (beat.usedAliases.length === 0)
      throw new NarrationRejection("ALIAS_MISSING", planned.beatId);
    const joined = beat.paragraphs.join("\n");
    if (joined.length > planned.maxCharacters)
      throw new NarrationRejection("LENGTH", planned.beatId);
    if (FORBIDDEN_DATE.test(joined)) throw new NarrationRejection("DATE_FORBIDDEN", planned.beatId);
    if (INTERNAL_LEAK.test(joined))
      throw new NarrationRejection("INTERNAL_ID_LEAK", planned.beatId);
    return {
      beatId: planned.beatId,
      role: planned.role,
      title: planned.title,
      paragraphs: beat.paragraphs,
      usedAliases: beat.usedAliases,
    };
  });
  return ValidatedNarrationSchema.parse({ beats });
}

export const StyleEvaluationSchema = z
  .strictObject({
    policyVersion: z.literal(STYLE_POLICY_VERSION),
    method: z.literal("heuristic"),
    score: z.number().min(0).max(1),
    issues: z
      .array(
        z
          .strictObject({
            code: StyleIssueCodeSchema,
            beatId: z.string(),
            detail: z.string().max(120),
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();
export type StyleEvaluation = z.infer<typeof StyleEvaluationSchema>;

/**
 * Split prose into sentences on terminal punctuation. Quoted spans are dropped first: quoting a
 * source sentence verbatim (plain declarative Korean) is not the narrator's own register.
 */
export function splitSentences(paragraph: string): string[] {
  return paragraph
    .replace(/“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』/g, " ")
    .replace(/[‘’'()\[\]]/g, "")
    .split(/(?<=[.!?。！？…])\s*/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[가-힣A-Za-z0-9]/.test(sentence));
}

/** Register of one sentence from its final Hangul ending; null when undecidable. */
export function sentenceRegister(sentence: string): "haeyo" | "hapsyo" | "banmal" | null {
  const body = sentence.replace(/[.!?。！？…\s]+$/g, "");
  const match = body.match(/([가-힣]+)$/);
  if (!match) return null;
  const word = match[1];
  if (/(니다|니까|십시오|습니까)$/.test(word)) return "hapsyo";
  if (/(요|죠)$/.test(word)) return "haeyo";
  if (/(다|어|아|지|야|네|군|래|자|냐|니|까|든|봐|와|해|돼|줘|워|게|렴)$/.test(word))
    return "banmal";
  return null;
}

/** Heuristics only; a soft score for operators, never a grounding or safety certificate. */
export function scoreNarrationStyle(
  narration: ValidatedNarration,
  persona: PersonaProfile,
): StyleEvaluation {
  const issues: { code: StyleIssueCode; beatId: string; detail: string }[] = [];
  const seen = new Set<string>();
  const all = narration.beats.flatMap((beat) => beat.paragraphs).join("\n");
  let decided = 0,
    matched = 0;
  for (const beat of narration.beats) {
    const add = (code: StyleIssueCode, detail: string) => {
      if (!issues.some((issue) => issue.code === code && issue.beatId === beat.beatId))
        issues.push({ code, beatId: beat.beatId, detail });
    };
    const range = persona.narrative.paragraphsPerSection;
    if (beat.paragraphs.length < range.min || beat.paragraphs.length > range.max)
      add("PARAGRAPH_COUNT", `${beat.paragraphs.length}개 (허용 ${range.min}~${range.max})`);
    for (const paragraph of beat.paragraphs) {
      const normalized = paragraph.replace(/\s+/g, " ").trim();
      if (seen.has(normalized)) add("DUPLICATE_PARAGRAPH", normalized.slice(0, 40));
      seen.add(normalized);
      if (
        /안녕하세요|결론적으로|이는 .*의미합니다/.test(paragraph) ||
        persona.voice.avoidExpressions.some(
          (expression) => !expression.includes("~") && paragraph.includes(expression),
        )
      )
        add("STOCK_PHRASE", "상투어 또는 회피 표현");
      if (/반드시|무조건|100\s*%|틀림없이|운명적으로/.test(paragraph))
        add("CERTAINTY", "확정·보장 표현");
      if (persona.voice.emojiPolicy === "none" && /\p{Extended_Pictographic}/u.test(paragraph))
        add("EMOJI", "이모지 사용");
      const sentences = splitSentences(paragraph);
      const bounds = persona.narrative.sentencesPerParagraph;
      if (sentences.length < bounds.min || sentences.length > bounds.max)
        add("SENTENCE_COUNT", `${sentences.length}문장 (허용 ${bounds.min}~${bounds.max})`);
      for (const sentence of sentences) {
        const register = sentenceRegister(sentence);
        if (!register) continue;
        decided++;
        if (register === persona.voice.register) matched++;
      }
    }
  }
  if (decided > 0 && matched / decided < 0.7)
    issues.push({
      code: "REGISTER_MIX",
      beatId: "report",
      detail: `${persona.voice.register} ${matched}/${decided}문장`,
    });
  const catchCount = persona.voice.catchphrases.reduce(
    (sum, phrase) => sum + all.split(phrase).length - 1,
    0,
  );
  if (catchCount > persona.voice.catchphraseMaxPerReport)
    issues.push({ code: "CATCHPHRASE_LIMIT", beatId: "report", detail: `${catchCount}회` });
  return StyleEvaluationSchema.parse({
    policyVersion: STYLE_POLICY_VERSION,
    method: "heuristic",
    score: Math.max(0, 1 - 0.2 * issues.length),
    issues,
  });
}
