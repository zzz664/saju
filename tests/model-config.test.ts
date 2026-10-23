import { describe, expect, it } from "vitest";
import { readOpenAiModel } from "@/server/openai-model";
import {
  DEFAULT_OPENAI_MODEL,
  OpenAiModelIdSchema,
  matchesOpenAiModel,
} from "@/domain/narration/model";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { preparePersonaNarration } from "@/domain/persona/narration";

describe("server OPENAI_MODEL configuration and pure model propagation", () => {
  it("defaults only when missing or blank and accepts a server-selected model", () => {
    expect(readOpenAiModel({})).toBe(DEFAULT_OPENAI_MODEL);
    expect(readOpenAiModel({ OPENAI_MODEL: "  " })).toBe(DEFAULT_OPENAI_MODEL);
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
    expect(OpenAiModelIdSchema.safeParse("ft:gpt-4o-mini:project:run").success).toBe(true);
  });
  it("uses the same injected model in the request and cache, preserving analysis and source data", () => {
    const catalog = createApiTestCatalog(),
      core = catalog.core("synthetic-known");
    const options = {
      ...catalog,
      selection: { personaId: "synthetic-style", personaVersion: "1.0.0" },
    };
    const initial = preparePersonaNarration(core, options);
    const changed = preparePersonaNarration(core, { ...options, model: "gpt-4.1-mini" });
    expect(changed.request.model).toBe("gpt-4.1-mini");
    expect(changed.data).toEqual(initial.data);
    expect(changed.request.input).toEqual(initial.request.input);
    expect(changed.request.instructions).toBe(initial.request.instructions);
    expect(changed.cache.analysisKey).toBe(initial.cache.analysisKey);
    expect(changed.cache.narrationKey).not.toBe(initial.cache.narrationKey);
  });
});
