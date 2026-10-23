import { ManualPromptDataSchema } from "@/domain/core-export";
import { FeatureNarrationSpecSchema, PersonaProfileSchema } from "@/domain/persona";
import type { NarrationProvider } from "@/domain/narration";
import { NarrationError } from "@/domain/narration";

/** Synthetic prose comparison only. Quotes source assertions rather than inventing interpretation. */
export function createPersonaMockProvider(): NarrationProvider {
  return {
    kind: "mock",
    async generate(request, { signal } = {}) {
      if (signal?.aborted) throw new NarrationError("CANCELLED");
      if (!request.style) throw new NarrationError("INPUT_REJECTED");
      const profile = PersonaProfileSchema.parse(request.style.persona);
      const spec = FeatureNarrationSpecSchema.parse(request.style.spec);
      const data = ManualPromptDataSchema.parse(request.data);
      const register = profile.voice.register;
      const intro =
        register === "hapsyo"
          ? "확인된 관찰을 보겠습니다."
          : register === "banmal"
            ? "확인된 관찰을 볼게."
            : "확인된 관찰을 볼게요.";
      const limitation =
        register === "hapsyo"
          ? "알려지지 않은 정보가 있어 확인된 범위만 설명합니다."
          : register === "banmal"
            ? "알려지지 않은 정보가 있어 확인된 범위만 설명할게."
            : "알려지지 않은 정보가 있어 확인된 범위만 설명해요.";
      const empty =
        register === "hapsyo"
          ? "제공된 근거만으로 확정해서 설명할 내용이 없습니다."
          : register === "banmal"
            ? "제공된 근거만으로 확정해서 설명할 내용이 없어."
            : "제공된 근거만으로 확정해서 설명할 내용이 없어요.";
      const output = {
        schemaVersion: "1.0.0",
        featureId: spec.featureId,
        sections: spec.sections.map((section, index) => {
          const findings = data.verifiedFindings.slice(
            index,
            index + Math.max(1, section.minFindings),
          );
          const selected = findings.length
            ? findings
            : data.verifiedFindings.slice(0, Math.max(1, section.minFindings));
          const paragraph = selected.length
            ? intro +
              " " +
              selected.map((finding) => `“${finding.assertion}”`).join(" ") +
              (data.status !== "complete" ? " " + limitation : "")
            : empty;
          return {
            sectionId: section.id,
            title: section.purpose,
            paragraphs: [paragraph],
            evidenceIds: selected.map((finding) => finding.findingId),
          };
        }),
      };
      return { status: "completed", outputText: JSON.stringify(output) };
    },
  };
}
