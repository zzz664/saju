import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { calculatePolicySaju } from "@/application/policy-saju";
import { calculateHashedCoreExport } from "@/application/core-fingerprint";
import { AnalysisInputSchema, BirthInputSchema, CalculationPolicySchema } from "@/domain/input";
import { CalendarConversionRequestSchema } from "@/domain/calendar";
import { parseCoreExport, serializeCoreExport } from "@/domain/core-export";
import { verifyCoreFingerprint } from "@/domain/core-fingerprint";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { fingerprintDependencies as dependencies } from "./helpers/fingerprint-input";
import raw from "./fixtures/independent-core-golden.json";

const Pillars = z
  .strictObject({
    year: z.string().length(2).nullable().optional(),
    month: z.string().length(2).nullable().optional(),
    day: z.string().length(2).nullable().optional(),
    hour: z.string().length(2).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const suite = z
  .strictObject({
    schemaVersion: z.literal("1.0.0"),
    baseInput: AnalysisInputSchema,
    sources: z.record(
      z.string(),
      z.strictObject({ url: z.url(), locator: z.string().min(1), checkedAt: z.iso.date() }),
    ),
    cases: z
      .array(
        z.strictObject({
          id: z.string().regex(/^G\d{2}$/),
          group: z.enum(["calendar", "day", "term", "timezone", "solar", "hour"]),
          sources: z.array(z.string()).min(1),
          basis: z.string().min(1),
          birthInput: z.strictObject(BirthInputSchema.unwrap().shape).partial(),
          policy: CalculationPolicySchema.unwrap().partial(),
          expected: z.strictObject({
            status: z.enum(["calculated", "partial"]),
            pillars: Pillars.optional(),
            solarDate: z.iso.date().optional(),
            lunarDate: z
              .string()
              .regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|30)$/)
              .optional(),
            isLeapMonth: z.boolean().optional(),
            instant: z.iso.datetime().optional(),
            localClock: z.string().optional(),
            offsetSeconds: z.number().int().optional(),
            policyClock: z.string().optional(),
            correctionSeconds: z.number().optional(),
            toleranceSeconds: z.number().min(0).max(30).optional(),
          }),
        }),
      )
      .length(30),
  })
  .parse(raw);

const inputFor = (row: (typeof suite.cases)[number]) =>
  AnalysisInputSchema.parse({
    birthInput: { ...suite.baseInput.birthInput, ...row.birthInput },
    calculationPolicy: { ...suite.baseInput.calculationPolicy, ...row.policy },
  });
const pillarLabels = (
  pillars: Record<string, { heavenlyStem: string; earthlyBranch: string } | null>,
) =>
  Object.fromEntries(
    Object.entries(pillars).map(([position, pillar]) => [
      position,
      pillar ? pillar.heavenlyStem + pillar.earthlyBranch : null,
    ]),
  );
const dateFields = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
};

describe("WBS-16 independent core goldens (30 reviewable cases)", () => {
  it("requires unique cases, attributable expectations, and the planned boundary coverage", () => {
    expect(suite.cases.map(({ id }) => id)).toEqual(
      Array.from({ length: 30 }, (_, i) => `G${String(i + 1).padStart(2, "0")}`),
    );
    const counts: Record<string, number> = {};
    for (const row of suite.cases) {
      counts[row.group] = (counts[row.group] ?? 0) + 1;
      for (const source of row.sources)
        expect(suite.sources[source], `${row.id}: ${source}`).toBeDefined();
      expect(Object.keys(row.expected).length).toBeGreaterThan(1);
      if (row.group === "calendar") {
        expect(row.expected.solarDate).toBeDefined();
        expect(row.expected.lunarDate).toBeDefined();
        expect(row.expected.isLeapMonth).toBeDefined();
      } else if (row.group === "timezone") {
        expect(row.expected.instant).toBeDefined();
        expect(row.expected.localClock).toBeDefined();
        expect(row.expected.offsetSeconds).toBeDefined();
      } else if (row.group === "solar") {
        expect(row.expected.correctionSeconds).toBeDefined();
      } else expect(row.expected.pillars).toBeDefined();
      if (row.expected.toleranceSeconds !== undefined) {
        expect(row.group).toBe("solar");
        expect(row.policy.solarTime).toBe("true-solar");
        expect(row.sources).toContain("NOAA");
        expect(row.expected.toleranceSeconds).toBe(30);
      }
    }
    expect(counts).toEqual({ calendar: 8, day: 6, term: 4, timezone: 4, solar: 4, hour: 4 });
  });

  it.each(suite.cases)(
    "$id [$group]: $basis",
    (row) => {
      const input = inputFor(row),
        before = structuredClone(input),
        expected = row.expected;
      const calculation = calculatePolicySaju(input, dependencies);
      expect(calculation.status).toBe(expected.status);
      if (calculation.status !== "calculated" && calculation.status !== "partial")
        throw new Error(`${row.id}: calculation failed`);
      const pillars =
        calculation.status === "calculated"
          ? calculation.snapshot.pillars
          : calculation.confirmedPillars;
      if (expected.pillars) expect(pillarLabels(pillars)).toMatchObject(expected.pillars);

      if (calculation.status === "calculated") {
        const resolved = calculation.time.resolved;
        if (expected.instant) expect(resolved.instant).toBe(expected.instant);
        if (expected.localClock) expect(resolved.localDateTime).toBe(expected.localClock);
        if (expected.offsetSeconds !== undefined)
          expect(resolved.offsetSeconds).toBe(expected.offsetSeconds);
        if (expected.policyClock)
          expect(calculation.solarTime.policyClock).toBe(expected.policyClock);
        if (expected.correctionSeconds !== undefined) {
          const difference = Math.abs(
            calculation.solarTime.correctionSeconds - expected.correctionSeconds,
          );
          expect(difference).toBeLessThanOrEqual(expected.toleranceSeconds ?? 0);
        }
        if (expected.solarDate && expected.lunarDate) {
          expect(calculation.time.request.localDateTime).toBe(`${expected.solarDate}T12:00`);
          const solar = dateFields(expected.solarDate),
            lunar = { ...dateFields(expected.lunarDate), isLeapMonth: expected.isLeapMonth! };
          for (const request of [
            { ...solar, calendarType: "solar", isLeapMonth: false },
            { ...lunar, calendarType: "lunar" },
          ]) {
            expect(
              dependencies.calendar.convert(CalendarConversionRequestSchema.parse(request)),
            ).toMatchObject({ solar, lunar });
          }
        }
      } else {
        expect(calculation.confirmedPillars.hour).toBeNull();
        expect(calculation.candidates[0].startMinute).toBe(0);
        expect(calculation.candidates.at(-1)?.endMinuteExclusive).toBe(1440);
        expect(calculation.candidates.every((candidate) => candidate.status === "possible")).toBe(
          true,
        );
        expect(
          new Set(
            calculation.candidates.flatMap((candidate) =>
              candidate.status === "possible"
                ? [candidate.pillars.day.heavenlyStem + candidate.pillars.day.earthlyBranch]
                : [],
            ),
          ),
        ).toEqual(new Set(["갑진", "을사"]));
      }

      // Recalculate through the public export application: facts/judgments must retain
      // independently checked pillars. JSON/hash checks are integration, not oracles.
      const hashed = calculateHashedCoreExport(input, dependencies, nodeSha256Adapter);
      const core = parseCoreExport(serializeCoreExport(hashed.document));
      expect(core.calculation.status).toBe(expected.status);
      expect(core.calculation.policy).toEqual(input.calculationPolicy);
      expect(core.calculation.library).toMatchObject({
        libraryName: "manseryeok",
        libraryVersion: "2.0.0",
        yearMonthBasis: "absolute-utc",
        dayHourBasis: "policy-clock",
      });
      expect(core.calculation.normalization).toEqual(
        calculation.status === "calculated"
          ? calculation.time.provenance
          : calculation.provenance.normalization,
      );
      expect(core.facts?.sourcePillars).toEqual(pillars);
      expect(core.facts?.status).toBe(expected.status === "calculated" ? "complete" : "partial");
      expect(core.evaluation).not.toBeNull();
      expect(core.resolution).not.toBeNull();
      expect(verifyCoreFingerprint(hashed, nodeSha256Adapter)).toBe(true);
      expect(serializeCoreExport(core)).not.toMatch(
        /"(?:birthInput|birthDate|birthTime|timezoneId|longitudeDeg|latitudeDeg)"\s*:/,
      );
      if (expected.status === "partial") {
        expect(core.status).not.toBe("complete");
        expect(core.calculation.reasons).toEqual(["BIRTH_TIME_UNKNOWN"]);
        expect(core.facts?.dayMaster).toBeNull();
        expect(core.facts?.positions.hour).toBeNull();
      }
      expect(input).toEqual(before);
    },
    20000,
  );
});

describe("WBS-16 additional rejection and missing-information checks (not part of the 30)", () => {
  it.each([
    { birthInput: { birthDate: "2024-02-30" } },
    { birthInput: { birthTime: { status: "known", time: "24:00" } } },
  ])("rejects malformed input before calling an adapter", (change) => {
    const calculate = vi.fn(),
      resolve = vi.fn(),
      convert = vi.fn(),
      load = vi.fn(),
      digest = vi.fn();
    expect(() =>
      calculateHashedCoreExport(
        { ...suite.baseInput, birthInput: { ...suite.baseInput.birthInput, ...change.birthInput } },
        { pillars: { calculate }, timeZone: { resolve }, calendar: { convert }, symbols: { load } },
        { digest },
      ),
    ).toThrow(z.ZodError);
    for (const adapter of [calculate, resolve, convert, load, digest])
      expect(adapter).not.toHaveBeenCalled();
  });

  it.each([
    {
      birthInput: { calendarType: "lunar", birthDate: "2024-02-01", isLeapMonth: true },
      policy: {},
      status: "unavailable",
      reason: "CALENDAR_INPUT_REJECTED",
    },
    {
      birthInput: { birthDate: "2301-01-01" },
      policy: {},
      status: "unavailable",
      reason: "TIME_RANGE_UNSUPPORTED",
    },
    {
      birthInput: {},
      policy: { solarTime: "true-solar" },
      status: "unavailable",
      reason: "LONGITUDE_UNKNOWN",
    },
    {
      birthInput: { birthDate: "1988-10-09", birthTime: { status: "known", time: "02:30" } },
      policy: {},
      status: "rejected",
      reason: "AMBIGUOUS_LOCAL_TIME",
    },
    {
      birthInput: { birthDate: "1988-05-08", birthTime: { status: "known", time: "02:30" } },
      policy: {},
      status: "rejected",
      reason: "NONEXISTENT_LOCAL_TIME",
    },
  ])("preserves $reason without a fabricated chart", ({ birthInput, policy, status, reason }) => {
    const calculate = vi.fn(dependencies.pillars.calculate),
      load = vi.fn(dependencies.symbols.load);
    const result = calculateHashedCoreExport(
      {
        birthInput: { ...suite.baseInput.birthInput, ...birthInput },
        calculationPolicy: { ...suite.baseInput.calculationPolicy, ...policy },
      },
      { ...dependencies, pillars: { calculate }, symbols: { load } },
      nodeSha256Adapter,
    );
    expect(result).toMatchObject({
      status: "unavailable",
      document: {
        calculation: { status, reasons: [reason] },
        facts: null,
        evaluation: null,
        resolution: null,
      },
    });
    expect(calculate).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(verifyCoreFingerprint(result, nodeSha256Adapter)).toBe(true);
  });
});
