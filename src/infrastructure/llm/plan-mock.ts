import { z } from "zod";
import { NarrationError, type NarrationProvider } from "@/domain/narration";

/**
 * Deterministic test double that writes every planned beat from the structured plan.
 * It quotes bounded evidence snippets in the persona's register; it is not a quality proxy.
 * It accepts the full server plan or the reduced model-facing projection, so fake-HTTP tests
 * can reconstruct a request from the wire without re-running the engine.
 */
const PlanLikeSchema = z
  .object({
    beats: z
      .array(
        z
          .object({
            beatId: z.string().min(1),
            role: z.enum(["chart", "observation", "interpretation", "limitations"]),
            maxCharacters: z.number().int().min(1),
            evidence: z
              .array(
                z
                  .object({
                    alias: z.string().min(1),
                    text: z.string().min(1),
                    source: z.string().nullable().optional(),
                  })
                  .passthrough(),
              )
              .min(1),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
const PersonaLikeSchema = z
  .object({
    voice: z.object({ register: z.enum(["haeyo", "hapsyo", "banmal"]) }).passthrough(),
    narrative: z
      .object({
        paragraphsPerSection: z.object({ min: z.number(), max: z.number() }).passthrough(),
        sentencesPerParagraph: z.object({ min: z.number(), max: z.number() }).passthrough(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export function createPlanMockProvider(
  options: { readonly outcome?: "success" | "refused" | "incomplete" | "failed" } = {},
): NarrationProvider {
  return {
    kind: "mock",
    async generate(request, { signal } = {}) {
      if (signal?.aborted) throw new NarrationError("CANCELLED");
      if (options.outcome && options.outcome !== "success") return { status: options.outcome };
      const plan = PlanLikeSchema.parse(request.plan);
      const persona = PersonaLikeSchema.parse(request.persona);
      const register = persona.voice.register;
      const perParagraph = persona.narrative?.sentencesPerParagraph.max ?? 4;
      const maxParagraphs = Math.min(4, persona.narrative?.paragraphsPerSection.max ?? 4);
      const end = (haeyo: string, hapsyo: string, banmal: string) =>
        register === "hapsyo" ? hapsyo : register === "banmal" ? banmal : haeyo;
      const beats = plan.beats.map((beat) => {
        const intro =
          beat.role === "chart"
            ? end("먼저 원국을 볼게요.", "먼저 원국을 살펴보겠습니다.", "먼저 원국부터 볼게.")
            : beat.role === "observation"
              ? end(
                  "계산으로 확인된 관측이에요.",
                  "계산으로 확인된 관측입니다.",
                  "계산으로 확인된 관측이야.",
                )
              : beat.role === "interpretation"
                ? end(
                    "전통 해석에서는 이렇게 봐요.",
                    "전통 해석에서는 다음과 같이 봅니다.",
                    "전통 해석에서는 이렇게 봐.",
                  )
                : end(
                    "확정하지 않은 부분도 있어요.",
                    "확정하지 않은 부분도 있습니다.",
                    "확정하지 않은 부분도 있어.",
                  );
        const sentences = [intro];
        const usedAliases: string[] = [];
        let remaining = beat.maxCharacters - intro.length;
        for (const entry of beat.evidence) {
          // Reserve the separator, closing quote and register ending before taking a snippet.
          // Paragraph separators replace these spaces below, so both count as one character.
          let prefix = entry.source ? `${entry.source}에서는 “` : "“";
          const suffix = entry.source
            ? `”라고 ${end("전해요.", "전합니다.", "전해.")}`
            : `”${end("라고 확인됐어요.", "라고 확인되었습니다.", "라고 확인됐어.")}`;
          if (usedAliases.length === 0 && remaining <= prefix.length + suffix.length + 1)
            prefix = "“";
          const available = remaining - 1 - prefix.length - suffix.length;
          if (available <= 0) break;
          const snippet = entry.text.slice(0, available).replace(/[\uD800-\uDBFF]$/, "");
          if (!snippet) break;
          const sentence = prefix + snippet + suffix;
          sentences.push(sentence);
          usedAliases.push(entry.alias);
          remaining -= 1 + sentence.length;
          if (snippet.length < entry.text.length) break;
        }
        // Respect the persona's paragraph/sentence bounds so the mock baseline carries no style noise.
        const paragraphs: string[] = [];
        for (let index = 0; index < sentences.length; index += perParagraph)
          paragraphs.push(sentences.slice(index, index + perParagraph).join(" "));
        while (paragraphs.length > maxParagraphs)
          paragraphs.splice(
            maxParagraphs - 1,
            2,
            paragraphs.slice(maxParagraphs - 1, maxParagraphs + 1).join(" "),
          );
        return {
          beatId: beat.beatId,
          paragraphs,
          usedAliases,
        };
      });
      return { status: "completed", outputText: JSON.stringify({ beats }) };
    },
  };
}
