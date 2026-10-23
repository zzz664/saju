import { describe, expect, it, vi } from "vitest";
import {
  executeFeature,
  featureEngine,
  planFeature,
  getProfile,
  buildFeatureNarrationInput,
} from "@/application/saju/features";
import {
  FeatureIdSchema,
  FeatureResultSchema,
  FeatureNarrationInputSchema,
  type ModuleId,
} from "@/schemas/features";
import { calculateCoreExport } from "@/application/core-export";
import { fingerprintCoreExport } from "@/domain/core-fingerprint";
import {
  featureDependencies as deps,
  featureRequest,
  mockFeaturePorts,
} from "./helpers/feature-input";
import { fingerprintInput } from "./helpers/fingerprint-input";

const direct: Record<string, ModuleId[]> = {
  F01: ["M01", "M02", "M03", "M04"],
  F02: ["M01", "M03"],
  F03: ["M01", "M03"],
  F04: ["M01", "M03"],
  F05: ["M01", "M03"],
  F06: ["M01", "M02", "M03"],
  F07: ["M04"],
  F08: ["M01", "M02", "M05", "M07"],
  F09: ["M01", "M02", "M05", "M06", "M07"],
  F10: ["M01", "M02", "M05", "M06", "M07"],
  F11: ["M01", "M02", "M03", "M08"],
};
describe("M09 routing, sharing and composition", () => {
  it.each(FeatureIdSchema.options)(
    "matches design dependencies and routes %s with request-local reuse",
    (id) => {
      expect(getProfile(id).modules).toEqual(direct[id]);
      const calls: string[] = [],
        calculate = vi.fn(deps.pillars.calculate),
        load = vi.fn(deps.symbols.load);
      const result = executeFeature(featureRequest(id), {
        ...deps,
        ...mockFeaturePorts(calls),
        pillars: { calculate },
        symbols: { load },
      });
      expect(calculate).toHaveBeenCalledTimes(id === "F11" ? 2 : 1);
      expect(load).toHaveBeenCalledTimes(id === "F11" ? 2 : 1);
      const moduleCalls = calls.filter((call) => !/^F\d/.test(call));
      expect(new Set(moduleCalls).size).toBe(moduleCalls.length);
      expect([...new Set(result.modules.map((module) => module.moduleId))].sort()).toEqual(
        planFeature(id).modules,
      );
      expect(result.status).toBe("complete");
      if (id === "F01")
        expect(calls.filter((call) => /^F\d/.test(call)).sort()).toEqual([
          "F02",
          "F03",
          "F04",
          "F05",
          "F06",
          "F07",
        ]);
      else expect(calls.filter((call) => /^F\d/.test(call))).toEqual([id]);
      expect(FeatureResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    },
  );
  it("evaluates only required M03 topics and leaves unrelated modules untouched", () => {
    const calls: string[] = [];
    executeFeature(featureRequest("F03"), { ...deps, ...mockFeaturePorts(calls) });
    expect(calls).toEqual(["primary:M01:", "primary:M02:", "primary:M03:strengths", "F03"]);
    expect(planFeature("F08").modules).toEqual(["M01", "M02", "M05", "M06", "M07"]);
  });
  it.each(FeatureIdSchema.options)(
    "keeps actual pending %s unavailable/partial instead of inventing feature judgments",
    (id) => {
      const result = executeFeature(featureRequest(id), deps);
      expect(result.status).not.toBe("complete");
      if (id === "F02") {
        expect(result.judgments.some((j) => j.ruleId.startsWith("f02.observation."))).toBe(true);
        return;
      }
      if (id === "F03" || id === "F01") {
        expect(result.judgments.some((j) => j.ruleId.startsWith("f03.observation."))).toBe(true);
        return;
      }
      expect(result.judgments).toEqual([]);
      expect(
        result.limitations.some((code) =>
          ["EXECUTOR_NOT_IMPLEMENTED", "MODULE_NOT_IMPLEMENTED", "SUBFEATURE_INCOMPLETE"].includes(
            code,
          ),
        ),
      ).toBe(true);
    },
  );
  it("cannot complete F01 when a child or required module is missing or partial", () => {
    const ports = mockFeaturePorts();
    const noF07 = { ...ports.featureExecutors, F07: undefined };
    const childMissing = executeFeature(featureRequest("F01"), {
      ...deps,
      ...ports,
      featureExecutors: noF07,
    });
    expect(childMissing.status).toBe("partial");
    expect(childMissing.limitations).toContain("SUBFEATURE_INCOMPLETE");
    const noM04 = { ...ports.moduleExecutors, M04: undefined };
    const moduleMissing = executeFeature(featureRequest("F01"), {
      ...deps,
      ...ports,
      moduleExecutors: noM04,
    });
    expect(moduleMissing.status).toBe("partial");
    expect(moduleMissing.limitations).toContain("MODULE_NOT_IMPLEMENTED");
    const partial = executeFeature(featureRequest("F01"), {
      ...deps,
      ...ports,
      featureExecutors: {
        ...ports.featureExecutors,
        F03: { version: "1.0.0", execute: () => ({ status: "partial", judgmentIds: [] }) },
      },
    });
    expect(partial.status).toBe("partial");
    expect(new Set(childMissing.judgments.map((j) => j.judgmentId)).size).toBe(
      childMissing.judgments.length,
    );
    expect(FeatureResultSchema.safeParse({ ...moduleMissing, status: "complete" }).success).toBe(
      false,
    );
    const complete = executeFeature(featureRequest("F01"), { ...deps, ...ports });
    expect(
      FeatureResultSchema.safeParse({
        ...complete,
        components: complete.components.filter((c) => c.featureId === "F01"),
      }).success,
    ).toBe(false);
    expect(
      FeatureResultSchema.safeParse({
        ...complete,
        components: [...complete.components, complete.components[0]],
      }).success,
    ).toBe(false);
  });
  it("keeps core content/hash equal across features and does not export raw birth data", () => {
    const expected = fingerprintCoreExport(calculateCoreExport(fingerprintInput, deps), deps.hash);
    for (const id of ["F02", "F03", "F07"] as const) {
      const result = executeFeature(featureRequest(id), deps);
      expect(result.core).toEqual(expected);
      expect(JSON.stringify(result)).not.toContain(fingerprintInput.birthInput.birthDate);
    }
  });
  it("separates cache keys by feature, target, counterpart, module and executor versions", () => {
    const f03 = executeFeature(featureRequest("F03"), deps);
    expect(executeFeature(featureRequest("F03"), deps).cacheKey).toBe(f03.cacheKey);
    expect(executeFeature(featureRequest("F02"), deps).cacheKey).not.toBe(f03.cacheKey);
    const a = executeFeature(featureRequest("F09"), deps),
      b = executeFeature(
        { ...featureRequest("F09"), target: { year: 2027, timezoneId: "Asia/Seoul" } },
        deps,
      );
    expect(a.cacheKey).not.toBe(b.cacheKey);
    const pair = executeFeature(featureRequest("F11"), deps),
      changed = executeFeature(
        {
          ...featureRequest("F11"),
          otherBirthInput: { ...fingerprintInput.birthInput, birthDate: "2024-04-10" },
        },
        deps,
      );
    expect(pair.cacheKey).not.toBe(changed.cacheKey);
    const ports = mockFeaturePorts();
    const one = executeFeature(featureRequest("F03"), { ...deps, ...ports });
    const two = executeFeature(featureRequest("F03"), {
      ...deps,
      ...ports,
      moduleExecutors: {
        ...ports.moduleExecutors,
        M01: { ...ports.moduleExecutors.M01!, version: "1.0.1" },
      },
    });
    const three = executeFeature(featureRequest("F03"), {
      ...deps,
      ...ports,
      featureExecutors: {
        ...ports.featureExecutors,
        F03: { ...ports.featureExecutors.F03!, version: "1.0.1" },
      },
    });
    expect(new Set([one.cacheKey, two.cacheKey, three.cacheKey]).size).toBe(3);
  });
  it("projects only trusted confirmed/accepted evidence and freezes the Mock consumer input", () => {
    const result = executeFeature(featureRequest("F03"), { ...deps, ...mockFeaturePorts() });
    const before = structuredClone(result),
      input = buildFeatureNarrationInput(result);
    expect(input.verifiedFindings.length).toBeGreaterThan(0);
    expect(FeatureNarrationInputSchema.safeParse(input).success).toBe(true);
    const mock = vi.fn((value) =>
      Reflect.set(value.verifiedFindings[0], "assertion", "synthetic-invented"),
    );
    expect(mock(input)).toBe(false);
    expect(result).toEqual(before);
    expect(() => buildFeatureNarrationInput(JSON.parse(JSON.stringify(result)))).toThrow(
      "Feature output was rejected.",
    );
  });
  it("sanitizes provider exceptions, malformed selections, unknown judgment IDs and mutation attempts", () => {
    const ports = mockFeaturePorts();
    for (const execute of [
      () => {
        throw new Error("synthetic-private");
      },
      () => ({ status: "complete", judgmentIds: ["invented"] }),
      () => ({ status: "complete", judgmentIds: [], core: "private" }),
    ]) {
      expect(() =>
        executeFeature(featureRequest("F03"), {
          ...deps,
          ...ports,
          featureExecutors: { F03: { version: "1.0.0", execute } },
        }),
      ).toThrow(/^Feature (execution failed|output was rejected)\.$/);
    }
    expect(() =>
      executeFeature(featureRequest("F03"), {
        ...deps,
        ...ports,
        moduleExecutors: {
          M01: {
            version: "1.0.0",
            execute: () => ({ status: "complete", judgments: [], limitations: [], raw: "private" }),
          },
        },
      }),
    ).toThrow("Feature execution failed.");
  });
  it("preserves unknown-time and unavailable core reasons, and requires both pair cores", async () => {
    const unknown = executeFeature(
      {
        ...featureRequest("F03"),
        birthInput: { ...fingerprintInput.birthInput, birthTime: { status: "unknown" } },
      },
      deps,
    );
    expect(unknown.core.document.facts?.sourcePillars.hour).toBeNull();
    expect(unknown.status).not.toBe("complete");
    const unavailable = executeFeature(
      {
        ...featureRequest("F03"),
        calculationPolicy: { ...fingerprintInput.calculationPolicy, solarTime: "true-solar" },
      },
      deps,
    );
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.core.document.calculation.reasons).toContain("LONGITUDE_UNKNOWN");
    const pair = executeFeature(
      {
        ...featureRequest("F11"),
        otherCalculationPolicy: { ...fingerprintInput.calculationPolicy, solarTime: "true-solar" },
      },
      deps,
    );
    expect(pair.status).toBe("unavailable");
    expect(pair.otherCore?.status).toBe("unavailable");
    expect((await featureEngine.execute(featureRequest("F03"), deps)).featureId).toBe("F03");
  });
});
