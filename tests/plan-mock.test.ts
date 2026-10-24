import { describe, expect, it } from "vitest";
import { z } from "zod";
import { prepareFeatureNarration } from "@/application/narration/feature";
import { validateNarrationDraft } from "@/domain/narration/render";
import { createPlanMockProvider } from "@/infrastructure/llm/plan-mock";
import { createApiTestCatalog } from "@/server/api-test-catalog";

const catalog = createApiTestCatalog();
const context = prepareFeatureNarration(catalog.source("synthetic-known", "F03"), {
  ...catalog,
  selection: catalog.selection("synthetic-style"),
});
const Completed = z.strictObject({ status: z.literal("completed"), outputText: z.string() });

describe("Mock paragraph character bounds", () => {
  it.each([100, 101, 500, 1200])(
    "counts paragraph separators and stops at %i characters",
    async (maxCharacters) => {
      const plan = {
        ...context.plan,
        beats: context.plan.beats.map((beat) => ({ ...beat, maxCharacters })),
      };
      const output = Completed.parse(
        await createPlanMockProvider().generate({ ...context.request, plan }),
      );
      expect(output.status).toBe("completed");
      if (output.status !== "completed") throw new Error("Expected completed Mock output");
      const validated = validateNarrationDraft(output.outputText, plan);
      for (const beat of validated.beats) {
        expect(beat.paragraphs.every((paragraph) => paragraph.length > 0)).toBe(true);
        expect(beat.paragraphs.join("\n").length).toBeLessThanOrEqual(maxCharacters);
      }
    },
  );
  it.each([0, 1, 2])(
    "handles %i spare characters after an exact paragraph boundary",
    async (extra) => {
      const provider = createPlanMockProvider();
      // Force multiple short evidence sentences instead of depending on catalog summary lengths.
      const beat = {
        ...context.plan.beats[0],
        maxCharacters: 3000,
        evidence: Array.from({ length: 6 }, (_, index) => ({
          ...context.plan.beats[0].evidence[0],
          alias: `E${index + 1}`,
          refId: `mock-boundary:${index + 1}`,
        })),
      };
      const first = Completed.parse(
        await provider.generate({
          ...context.request,
          plan: { ...context.plan, beats: [beat] },
        }),
      );
      if (first.status !== "completed") throw new Error("Expected completed Mock output");
      const draft = JSON.parse(first.outputText) as {
        beats: { beatId: string; paragraphs: string[] }[];
      };
      const original = draft.beats.find((beat) => beat.paragraphs.length > 1)!;
      expect(original).toBeDefined();
      const maxCharacters = original.paragraphs[0].length + extra;
      const plan = { ...context.plan, beats: [{ ...beat, maxCharacters }] };
      const result = Completed.parse(await provider.generate({ ...context.request, plan }));
      if (result.status !== "completed") throw new Error("Expected completed Mock output");
      const validated = validateNarrationDraft(result.outputText, plan);
      expect(validated.beats[0].paragraphs.join("\n").length).toBeLessThanOrEqual(maxCharacters);
      expect(validated.beats[0].paragraphs.every((paragraph) => paragraph.length > 0)).toBe(true);
      if (extra < 2) expect(validated.beats[0].paragraphs).toEqual([original.paragraphs[0]]);
    },
  );
});
