import { z } from "zod";

const Text = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^[^\u0000-\u001f\u007f]*$/);
const Id = Text.max(64).regex(/^[a-z0-9][a-z0-9-]*$/);
const Version = Text.max(32).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
const Texts = z.array(Text).max(10).readonly();
const Range = z
  .strictObject({ min: z.number().int().min(1).max(4), max: z.number().int().min(1).max(4) })
  .refine((value) => value.min <= value.max)
  .readonly();
export const PersonaProfileSchema = z
  .strictObject({
    schemaVersion: z.literal("1.0.0"),
    personaId: Id,
    personaVersion: Version,
    displayName: Text.max(100),
    description: Text,
    role: Text,
    identityDisclosure: z.literal("fictional_narrator"),
    personality: z
      .strictObject({
        coreTraits: z
          .array(
            z
              .strictObject({
                trait: Text.max(80),
                strength: z.number().min(0).max(1),
                expression: Text,
              })
              .readonly(),
          )
          .min(1)
          .max(6)
          .readonly(),
        values: Texts,
        avoidPersonality: Texts,
      })
      .readonly(),
    voice: z
      .strictObject({
        locale: z.literal("ko-KR"),
        register: z.enum(["haeyo", "hapsyo", "banmal"]),
        relationship: Text,
        sentenceRhythm: Text,
        directness: z.enum(["soft", "balanced", "direct"]),
        metaphorLevel: z.enum(["none", "low", "medium"]),
        humorLevel: z.enum(["none", "low", "medium"]),
        emojiPolicy: z.enum(["none", "sparse"]),
        preferredExpressions: Texts,
        avoidExpressions: Texts,
        catchphrases: z.array(Text.max(80)).max(3).readonly(),
        catchphraseMaxPerReport: z.number().int().min(0).max(3),
      })
      .readonly(),
    narrative: z
      .strictObject({
        introStrategy: Text,
        paragraphsPerSection: Range,
        sentencesPerParagraph: Range,
        preferredFlow: Texts,
        avoid: Texts,
      })
      .readonly(),
    examples: z
      .array(z.strictObject({ intent: Text.max(80), avoid: Text, prefer: Text }).readonly())
      .min(1)
      .max(4)
      .readonly(),
  })
  .readonly();
export type PersonaProfile = z.infer<typeof PersonaProfileSchema>;
export const PersonaSelectionSchema = z
  .strictObject({ personaId: Id, personaVersion: Version })
  .readonly();
export const FeatureNarrationSpecSchema = z
  .strictObject({
    specId: Id,
    specVersion: Version,
    featureId: z.literal("core-base"),
    sections: z
      .array(
        z
          .strictObject({
            id: Id,
            purpose: Text.max(100),
            minFindings: z.number().int().min(0).max(20),
          })
          .readonly(),
      )
      .min(1)
      .max(8)
      .readonly(),
    maxCharactersPerSection: z.number().int().min(50).max(3000),
    readerLevel: z.literal("general"),
    includeLimitations: z.literal(true),
    allowFortuneScore: z.literal(false),
  })
  .refine(
    (spec) => new Set(spec.sections.map((section) => section.id)).size === spec.sections.length,
  )
  .readonly();
export type FeatureNarrationSpec = z.infer<typeof FeatureNarrationSpecSchema>;
const messages = {
  REGISTRY_REJECTED: "Persona registry was rejected.",
  SELECTION_REJECTED: "Persona selection was rejected.",
  SPEC_REJECTED: "Persona narration spec was rejected.",
  INPUT_REJECTED: "Persona narration input was rejected.",
  OUTPUT_REJECTED: "Persona narration output was rejected.",
  HASH_FAILED: "Persona narration hash failed.",
} as const;
export class PersonaError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "PersonaError";
  }
}
export interface ApprovedPersonaRegistry {
  load(selection: unknown): PersonaProfile;
}
/** The manifest is trusted server configuration, never a user upload/approval flag. Empty by default. */
export function createApprovedPersonaRegistry(manifest: unknown = []): ApprovedPersonaRegistry {
  const rows = z
    .array(
      z.strictObject({
        status: z.literal("approved"),
        personaId: Id,
        personaVersion: Version,
        json: z.string().min(1).max(32768),
      }),
    )
    .max(50)
    .safeParse(manifest);
  if (!rows.success) throw new PersonaError("REGISTRY_REJECTED");
  const profiles = new Map<string, PersonaProfile>();
  for (const row of rows.data) {
    let raw: unknown;
    try {
      if (new TextEncoder().encode(row.json).byteLength > 32768) throw new Error();
      raw = JSON.parse(row.json);
    } catch {
      throw new PersonaError("REGISTRY_REJECTED");
    }
    const parsed = PersonaProfileSchema.safeParse(raw);
    const key = JSON.stringify([row.personaId, row.personaVersion]);
    if (
      !parsed.success ||
      parsed.data.personaId !== row.personaId ||
      parsed.data.personaVersion !== row.personaVersion ||
      profiles.has(key)
    )
      throw new PersonaError("REGISTRY_REJECTED");
    profiles.set(key, parsed.data);
  }
  return Object.freeze({
    load(selection: unknown) {
      const parsed = PersonaSelectionSchema.safeParse(selection);
      if (!parsed.success) throw new PersonaError("SELECTION_REJECTED");
      const profile = profiles.get(
        JSON.stringify([parsed.data.personaId, parsed.data.personaVersion]),
      );
      if (!profile) throw new PersonaError("SELECTION_REJECTED");
      return profile;
    },
  });
}
