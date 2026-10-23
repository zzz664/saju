import { describe, expect, it } from "vitest";
import { matchesOpenAiModel } from "@/infrastructure/openai/model";
import { readOpenAiModel } from "@/server/openai-model";
import { DEFAULT_NARRATION_MODEL, ModelIdSchema } from "@/domain/narration/model";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { prepareFeatureNarration } from "@/application/narration/feature";

describe("server OPENAI_MODEL configuration and pure model propagation", () => {
  it("defaults only when missing or blank and accepts a server-selected model", () => {
    expect(readOpenAiModel({})).toBe(DEFAULT_NARRATION_MODEL);
    expect(readOpenAiModel({ OPENAI_MODEL: "  " })).toBe(DEFAULT_NARRATION_MODEL);
    expect(readOpenAiModel({ OPENAI_MODEL: " gpt-4.1-mini " })).toBe("gpt-4.1-mini");
  });
  it.each(["../model", "model\nsecret", "https://example.test", "x".repeat(129)])(
    "rejects malformed identifiers: %s",
    (model) => {
      expect(() => readOpenAiModel({ OPENAI_MODEL: model })).toThrow();
    },
  );
  it("accepts exact models and dated snapshots, rejects neighboring models", () => {
    expect(matchesOpenAiModel("gpt-4.1-mini", "gpt-4.1-mini")).toBe(true);
    expect(matchesOpenAiModel("gpt-4.1-mini", "gpt-4.1-mini-2025-04-14")).toBe(true);
    expect(matchesOpenAiModel("gpt-4.1-mini", "gpt-4.1")).toBe(false);
    expect(matchesOpenAiModel("gpt-4.1", "gpt-4x1-2025-04-14")).toBe(false);
    expect(matchesOpenAiModel("gpt-4o-mini-2024-07-18", "gpt-4o-mini-2024-08-01")).toBe(false);
    expect(ModelIdSchema.safeParse("ft:gpt-4o-mini:project:run").success).toBe(true);
  });
  it("uses the same injected model in the request and cache, preserving plan and analysis keys", () => {
    const catalog = createApiTestCatalog(),
      source = catalog.source("synthetic-known", "F03");
    const options = {
      ...catalog,
      selection: { personaId: "synthetic-style", personaVersion: "1.0.0" },
    };
    const initial = prepareFeatureNarration(source, options);
    const changed = prepareFeatureNarration(source, { ...options, model: "gpt-4.1-mini" });
    expect(changed.request.modelId).toBe("gpt-4.1-mini");
    expect(changed.plan).toEqual(initial.plan);
    expect(changed.request.messages).toEqual(initial.request.messages);
    expect(changed.request.instructions).toBe(initial.request.instructions);
    expect(changed.cache.analysisKey).toBe(initial.cache.analysisKey);
    expect(changed.cache.planKey).toBe(initial.cache.planKey);
    expect(changed.cache.narrationKey).not.toBe(initial.cache.narrationKey);
  });
});
