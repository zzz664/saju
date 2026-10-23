import { z } from "zod";
import { buildManualPromptData } from "../core-export/index";
import { canonicalizeJson, fingerprintCoreExport, type Sha256Adapter } from "../core-fingerprint/index";
import { MAX_NARRATION_BYTES, type NarrationRequest } from "../narration/index";
import { FeatureNarrationSpecSchema, PersonaError, type ApprovedPersonaRegistry, type PersonaProfile } from "./index";
import { COMMON_SYSTEM_PROMPT, COMMON_SYSTEM_PROMPT_VERSION, PERSONA_JSON_CONTRACT, PERSONA_PROMPT_VERSION } from "./prompt";

export const PersonaNarrationDraftSchema = z.strictObject({
  schemaVersion: z.literal("1.0.0"), featureId: z.literal("core-base"),
  sections: z.array(z.strictObject({
    sectionId: z.string().min(1).max(64), title: z.string().trim().min(1).max(100),
    paragraphs: z.array(z.string().trim().min(1).max(3000)).min(1).max(4).readonly(),
    evidenceIds: z.array(z.string().min(1).max(200)).max(20).readonly(),
  }).readonly()).min(1).max(8).readonly(),
}).readonly();
export type PersonaNarrationDraft = z.infer<typeof PersonaNarrationDraftSchema>;
export function personaNarrationJsonSchema() { return z.toJSONSchema(PersonaNarrationDraftSchema, { target: "draft-2020-12" }); }
function json(value: unknown) { return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`); }
function hashValue(value: unknown, hash: Sha256Adapter): string {
  let result: unknown;
  try { result = hash.digest(canonicalizeJson(value)); } catch { throw new PersonaError("HASH_FAILED"); }
  if (typeof result !== "string" || result.length !== 64 || !/^[a-f0-9]{64}$/.test(result)) throw new PersonaError("HASH_FAILED");
  return result;
}
export function preparePersonaNarration(core: unknown, options: { registry: ApprovedPersonaRegistry; selection: unknown; spec: unknown; hash: Sha256Adapter }) {
  const profile = options.registry.load(options.selection);
  const parsed = FeatureNarrationSpecSchema.safeParse(options.spec);
  if (!parsed.success) throw new PersonaError("SPEC_REJECTED");
  const spec = parsed.data;
  let data: ReturnType<typeof buildManualPromptData>;
  try { data = buildManualPromptData(core); } catch { throw new PersonaError("INPUT_REJECTED"); }
  if (spec.sections.some(section => section.minFindings > data.verifiedFindings.length)) throw new PersonaError("SPEC_REJECTED");
  let analysisKey: string;
  try { analysisKey = fingerprintCoreExport(core, options.hash).fingerprint.hash; } catch { throw new PersonaError("HASH_FAILED"); }
  const descriptor = { policyId: "narration.persona-cache", policyVersion: "1.0.0", analysisKey,
    featureId: spec.featureId, personaId: profile.personaId, personaVersion: profile.personaVersion,
    promptVersion: PERSONA_PROMPT_VERSION, commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION, modelId: "gpt-4o-mini",
    narrativeSpecId: spec.specId, narrativeSpecVersion: spec.specVersion, outputSchemaVersion: "1.0.0",
    personaDigest: hashValue(profile, options.hash), specDigest: hashValue(spec, options.hash),
    promptDigest: hashValue({ common: COMMON_SYSTEM_PROMPT, output: PERSONA_JSON_CONTRACT }, options.hash),
  };
  const request: NarrationRequest = Object.freeze({ model: "gpt-4o-mini", store: false, stream: false, instructions: COMMON_SYSTEM_PROMPT,
    input: Object.freeze([
      Object.freeze({ role: "developer" as const, content: PERSONA_JSON_CONTRACT + "\n" + json({ instructionType: "server-approved-style-only", persona: profile, spec }) }),
      Object.freeze({ role: "user" as const, content: json({ featureId: spec.featureId, ...data }) }),
    ]),
    text: { format: { type: "json_schema" as const, strict: true as const, name: "r01_internal_narration", schema: personaNarrationJsonSchema() } },
  });
  return Object.freeze({ profile, spec, data, request, cache: Object.freeze({ analysisKey, narrationKey: hashValue(descriptor, options.hash) }) });
}
export type PreparedPersonaNarration = ReturnType<typeof preparePersonaNarration>;
export function validatePersonaOutput(text: string, context: PreparedPersonaNarration): PersonaNarrationDraft {
  if (new TextEncoder().encode(text).byteLength > MAX_NARRATION_BYTES) throw new PersonaError("OUTPUT_REJECTED");
  let raw: unknown; try { raw = JSON.parse(text); } catch { throw new PersonaError("OUTPUT_REJECTED"); }
  const parsed = PersonaNarrationDraftSchema.safeParse(raw);
  if (!parsed.success) throw new PersonaError("OUTPUT_REJECTED");
  const sections = new Map(parsed.data.sections.map(section => [section.sectionId, section]));
  const valid = new Set(context.data.verifiedFindings.map(finding => finding.findingId));
  if (sections.size !== parsed.data.sections.length || sections.size !== context.spec.sections.length) throw new PersonaError("OUTPUT_REJECTED");
  for (const spec of context.spec.sections) {
    const section = sections.get(spec.id);
    if (!section || section.title !== spec.purpose || section.paragraphs.join("\n").length > context.spec.maxCharactersPerSection
      // The current core-base input contains no target dates/period. Do not invent one.
      || section.paragraphs.some(paragraph => /\b\d{4}[-/.]\d{1,2}|\d{4}년|\d{1,2}월\s*\d{1,2}일/.test(paragraph))
      || new Set(section.evidenceIds).size !== section.evidenceIds.length || section.evidenceIds.some(id => !valid.has(id))
      || section.evidenceIds.length < Math.max(spec.minFindings, valid.size > 0 ? 1 : 0)) throw new PersonaError("OUTPUT_REJECTED");
  }
  return PersonaNarrationDraftSchema.parse({ ...parsed.data, sections: context.spec.sections.map(section => sections.get(section.id)) });
}

type StyleCode = "STOCK_PHRASE" | "DUPLICATE_PARAGRAPH" | "CERTAINTY" | "EMOJI" | "REGISTER" | "CATCHPHRASE_LIMIT" | "PARAGRAPH_COUNT" | "SENTENCE_COUNT" | "INTERNAL_ID";
/** Heuristics only: these flags are not a semantic/factual or naturalness certificate. */
export function evaluatePersonaStyle(draft: PersonaNarrationDraft, profile: PersonaProfile) {
  const issues: { code: StyleCode; sectionId: string }[] = [];
  const seen = new Set<string>(); const all = draft.sections.flatMap(section => section.paragraphs).join("\n");
  for (const section of draft.sections) {
    const add = (code: StyleCode) => { if (!issues.some(issue => issue.code === code && issue.sectionId === section.sectionId)) issues.push({ code, sectionId: section.sectionId }); };
    const count = section.paragraphs.length; const range = profile.narrative.paragraphsPerSection;
    if (count < range.min || count > range.max) add("PARAGRAPH_COUNT");
    for (const paragraph of section.paragraphs) {
      const normalized = paragraph.replace(/\s+/g, " ").trim();
      if (seen.has(normalized)) add("DUPLICATE_PARAGRAPH"); seen.add(normalized);
      // Mock quotes retain verbatim sourced assertions. Evaluate the surrounding voice separately.
      const voice = paragraph.replace(/“[^”]*”/g, "").trim();
      if (/안녕하세요|결론적으로|이는 .*의미합니다/.test(voice) || profile.voice.avoidExpressions.some(expression => voice.includes(expression))) add("STOCK_PHRASE");
      if (/반드시|무조건|100\s*%|틀림없이|운명적으로/.test(paragraph)) add("CERTAINTY");
      if (profile.voice.emojiPolicy === "none" && new RegExp("\\p{Extended_Pictographic}", "u").test(paragraph)) add("EMOJI");
      const register = profile.voice.register;
      if ((register === "haeyo" && !/요[.!?]?$/.test(voice)) || (register === "hapsyo" && !/니다[.!?]?$/.test(voice))
        || (register === "banmal" && /요[.!?]?$|니다[.!?]?$/.test(voice))) add("REGISTER");
      const sentences = (paragraph.match(/[.!?。！？]+(?=\s|[”’"']|$)/g) ?? []).length;
      const bounds = profile.narrative.sentencesPerParagraph;
      if (sentences < bounds.min || sentences > bounds.max) add("SENTENCE_COUNT");
      if (/finding:|base\.[a-z-]+|verifiedFindings|system prompt/i.test(paragraph)) add("INTERNAL_ID");
    }
  }
  const catchCount = profile.voice.catchphrases.reduce((sum, phrase) => sum + all.split(phrase).length - 1, 0);
  if (catchCount > profile.voice.catchphraseMaxPerReport) issues.push({ code: "CATCHPHRASE_LIMIT", sectionId: "report" });
  return Object.freeze({ policyVersion: "1.0.0", method: "heuristic" as const, passed: issues.length === 0, issues: Object.freeze(issues.map(issue => Object.freeze(issue))) });
}
