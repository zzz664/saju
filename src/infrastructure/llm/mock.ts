import { ManualPromptDataSchema } from "@/domain/core-export";
import { NarrationError, type NarrationProvider } from "@/domain/narration";

/** Deterministic test double; no network, key, environment, clock or token estimate. */
export function createMockNarrationProvider(
  options: { readonly outcome?: "success" | "refused" | "incomplete" | "failed" } = {},
): NarrationProvider {
  return {
    kind: "mock",
    async generate(request, { signal } = {}) {
      if (signal?.aborted) throw new NarrationError("CANCELLED");
      if (options.outcome && options.outcome !== "success") return { status: options.outcome };
      const data = ManualPromptDataSchema.parse(request.data);
      return {
        status: "completed",
        outputText: JSON.stringify({
          schemaVersion: "1.0.0",
          sections: data.verifiedFindings.map((finding) => ({
            findingId: finding.findingId,
            paragraph: `Mock 검증용 기초 관찰: ${finding.assertion}`,
          })),
        }),
      };
    },
  };
}
