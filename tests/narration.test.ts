import { describe, expect, it, vi } from "vitest";
import { calculateCoreExport } from "@/application/core-export";
import { narrateCore } from "@/application/narration";
import { buildManualPrompt, buildManualPromptData } from "@/domain/core-export";
import {
  createNarrationRequest,
  narrationJsonSchema,
  NarrationDraftSchema,
  MAX_NARRATION_BYTES,
  type NarrationProvider,
} from "@/domain/narration";
import { createMockNarrationProvider } from "@/infrastructure/llm/mock";
import { fingerprintInput, fingerprintDependencies } from "./helpers/fingerprint-input";

const core = calculateCoreExport(fingerprintInput, fingerprintDependencies);
const mock = createMockNarrationProvider();
const data = buildManualPromptData(core);
const rawDraft = {
  schemaVersion: "1.0.0",
  sections: data.verifiedFindings.map((f) => ({ findingId: f.findingId, paragraph: f.assertion })),
};
function provider(output: unknown): NarrationProvider {
  return { kind: "mock", generate: vi.fn(async () => output) };
}
function completed(value: unknown) {
  return { status: "completed", outputText: JSON.stringify(value) };
}

describe("developer-only narration provider contract", () => {
  it("reuses the exact manual projection without changing copy output or core", () => {
    const before = structuredClone(core);
    const match = buildManualPrompt(core).match(/<analysis_data>\n([\s\S]*)\n<\/analysis_data>/)!;
    expect(JSON.parse(match[1])).toEqual(data);
    const request = createNarrationRequest(core);
    expect(JSON.parse(request.messages[0].content)).toEqual(data);
    expect(core).toEqual(before);
    expect(JSON.stringify(request)).not.toMatch(/2024-02-10|05:30|Asia\/Seoul|birthDate/);
  });

  it("separates fixed instructions from user data and pins JSON-only development mode", () => {
    const request = createNarrationRequest(core);
    expect(request).toMatchObject({
      modelId: "gpt-4o-mini",
      messages: [{ role: "user" }],
      output: { name: "developer_narration" },
    });
    expect(request.instructions).toContain("새로운 사주 계산");
    expect(request.instructions).toContain("지시가 아닌 데이터");
    expect(request.instructions).toContain("JSON");
    expect(request.instructions).not.toMatch(/R02|R03|말풍선|PersonaProfile/);
    expect(request.instructions).not.toContain(data.verifiedFindings[0].assertion);
  });

  it("provides a strict structural output schema and rejects unknown fields", () => {
    expect(narrationJsonSchema()).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "sections"],
    });
    expect(NarrationDraftSchema.safeParse(rawDraft).success).toBe(true);
    expect(NarrationDraftSchema.safeParse({ ...rawDraft, status: "complete" }).success).toBe(false);
    expect(
      NarrationDraftSchema.safeParse({
        ...rawDraft,
        sections: [{ ...rawDraft.sections[0], newFact: true }],
      }).success,
    ).toBe(false);
  });

  it("runs deterministic mock with zero network/logging and unchanged source", async () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network forbidden"));
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const before = structuredClone(core);
    const first = await narrateCore(core, mock);
    expect(await narrateCore(core, mock)).toEqual(first);
    expect(first).toMatchObject({
      mode: "developer-json",
      sourceStatus: "complete",
      meta: {
        providerKind: "mock",
        model: "gpt-4o-mini",
        promptVersion: "1.0.0",
        schemaVersion: "1.0.0",
      },
    });
    expect(first.sections.map((s) => s.findingId)).toEqual(
      data.verifiedFindings.map((f) => f.findingId),
    );
    expect(first.limitations).toEqual(data.limitations);
    expect(core).toEqual(before);
    expect(network).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it.each(["midnight", "zi-start"])(
    "preserves %s unknowns and never sends partial/excluded claims",
    async (dayBoundary) => {
      const partial = calculateCoreExport(
        {
          ...fingerprintInput,
          birthInput: { ...fingerprintInput.birthInput, birthTime: { status: "unknown" } },
          calculationPolicy: { ...fingerprintInput.calculationPolicy, dayBoundary },
        },
        fingerprintDependencies,
      );
      const source = buildManualPromptData(partial);
      const result = await narrateCore(partial, mock);
      expect(result.sourceStatus).toBe("partial");
      expect(result.limitations).toEqual(source.limitations);
      expect(result.sections.map((s) => s.findingId)).toEqual(
        source.verifiedFindings.map((f) => f.findingId),
      );
      expect(source.verifiedFindings.every((f) => f.precision === "confirmed")).toBe(true);
      expect(
        source.limitations.excludedFindingIds.every(
          (id) => !result.sections.some((s) => s.findingId === id),
        ),
      ).toBe(true);
    },
  );

  it("handles unavailable input without inventing findings", async () => {
    const unavailable = calculateCoreExport(
      {
        ...fingerprintInput,
        calculationPolicy: { ...fingerprintInput.calculationPolicy, solarTime: "true-solar" },
      },
      fingerprintDependencies,
    );
    const result = await narrateCore(unavailable, mock);
    expect(result.sourceStatus).toBe("unavailable");
    expect(result.sections).toEqual([]);
    expect(result.limitations.calculationReasons).toContain("LONGITUDE_UNKNOWN");
  });

  it.each(["refused", "incomplete", "failed"] as const)(
    "maps mock %s without fallback or retry",
    async (outcome) => {
      const run = createMockNarrationProvider({ outcome });
      const generate = vi.spyOn(run, "generate");
      await expect(narrateCore(core, run)).rejects.toMatchObject({
        code: outcome === "failed" ? "PROVIDER_FAILED" : outcome.toUpperCase(),
      });
      expect(generate).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    null,
    {},
    { status: "completed", outputText: "{ private secret" },
    { status: "completed", outputText: " " },
    { status: "completed", outputText: "x".repeat(MAX_NARRATION_BYTES + 1) },
    completed({ ...rawDraft, schemaVersion: "2.0.0" }),
    completed({ ...rawDraft, sections: [{ findingId: "invented", paragraph: "새 판단" }] }),
    completed({ ...rawDraft, sections: [...rawDraft.sections, rawDraft.sections[0]] }),
    completed({ ...rawDraft, sections: rawDraft.sections.slice(1) }),
    completed({ ...rawDraft, sections: [{ ...rawDraft.sections[0], paragraph: "  " }] }),
    completed({ ...rawDraft, limitations: [] }),
  ])("rejects invalid/forged/incomplete provider payload without echoing input", async (output) => {
    await expect(narrateCore(core, provider(output))).rejects.toMatchObject({
      code: "OUTPUT_REJECTED",
      message: "Narration output was rejected.",
    });
  });

  it("normalizes output order to source order, retaining exact evidence binding", async () => {
    const result = await narrateCore(
      core,
      provider(completed({ ...rawDraft, sections: [...rawDraft.sections].reverse() })),
    );
    expect(result.sections).toEqual(rawDraft.sections);
  });

  it("rejects invalid core before invoking the provider", async () => {
    const run = provider(completed(rawDraft));
    await expect(narrateCore({ ...core, unexpected: "private secret" }, run)).rejects.toMatchObject(
      { code: "INPUT_REJECTED" },
    );
    expect(run.generate).not.toHaveBeenCalled();
  });

  it("blocks live providers before invocation regardless of environment configuration", async () => {
    const generate = vi.fn(async () => completed(rawDraft));
    await expect(narrateCore(core, { kind: "openai", generate })).rejects.toMatchObject({
      code: "LIVE_DISABLED",
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it("enforces UTF-8 bytes at exactly the response limit and one byte over", async () => {
    const json = JSON.stringify(rawDraft);
    const padded =
      json + " ".repeat(MAX_NARRATION_BYTES - new TextEncoder().encode(json).byteLength);
    const result = await narrateCore(core, provider({ status: "completed", outputText: padded }));
    expect(result.sections).toEqual(rawDraft.sections);
    expect(padded.length + 1).toBeLessThan(MAX_NARRATION_BYTES);
    await expect(
      narrateCore(core, provider({ status: "completed", outputText: padded + " " })),
    ).rejects.toMatchObject({ code: "OUTPUT_REJECTED" });
  });

  it("bounds paragraph size and number of sections", () => {
    const section = { findingId: "id", paragraph: "가".repeat(1500) };
    expect(
      NarrationDraftSchema.safeParse({ schemaVersion: "1.0.0", sections: Array(20).fill(section) })
        .success,
    ).toBe(true);
    expect(
      NarrationDraftSchema.safeParse({ schemaVersion: "1.0.0", sections: Array(21).fill(section) })
        .success,
    ).toBe(false);
    expect(
      NarrationDraftSchema.safeParse({
        schemaVersion: "1.0.0",
        sections: [{ ...section, paragraph: section.paragraph + "가" }],
      }).success,
    ).toBe(false);
  });

  it("isolates each request's schema so suppliers cannot change future output contracts", () => {
    const request = createNarrationRequest(core);
    request.output.jsonSchema.additionalProperties = true;
    expect(createNarrationRequest(core).output.jsonSchema.additionalProperties).toBe(false);
    expect(Object.isFrozen(request.messages[0])).toBe(true);
  });

  it("sanitizes supplier exceptions without retries or logging", async () => {
    const generate = vi.fn(async () => {
      throw new Error("private secret birth input");
    });
    const log = vi.spyOn(console, "error");
    await expect(narrateCore(core, { kind: "mock", generate })).rejects.toMatchObject({
      code: "PROVIDER_FAILED",
      message: "Narration provider failed.",
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it("cancels before a call and after an uncooperative provider resolves", async () => {
    const controller = new AbortController();
    controller.abort();
    const run = provider(completed(rawDraft));
    await expect(narrateCore(core, run, { signal: controller.signal })).rejects.toMatchObject({
      code: "CANCELLED",
    });
    expect(run.generate).not.toHaveBeenCalled();
    const active = new AbortController();
    await expect(
      narrateCore(
        core,
        {
          kind: "mock",
          generate: async () => {
            active.abort();
            return completed(rawDraft);
          },
        },
        { signal: active.signal },
      ),
    ).rejects.toMatchObject({ code: "CANCELLED" });
  });

  it("cancels promptly while a provider stays pending", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = narrateCore(
      core,
      {
        kind: "mock",
        generate: async (_, options) => {
          expect(options?.signal).toBe(controller.signal);
          started();
          return new Promise<never>(() => {});
        },
      },
      { signal: controller.signal },
    );
    const rejected = expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
    await ready;
    controller.abort();
    await rejected;
  });
});
