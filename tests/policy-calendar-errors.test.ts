import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("manseryeok", async (importOriginal) => ({
  ...(await importOriginal<typeof import("manseryeok")>()),
  calculateFourPillars: vi.fn(),
}));
import { calculateFourPillars } from "manseryeok";
import { manseryeokPolicyCalendarAdapter } from "@/infrastructure/manseryeok";
import { calculatePolicySaju, PolicyCalculationResultSchema } from "@/application/policy-saju";
import { CalendarAdapterError } from "@/domain/calendar";
import { type PolicyCalendarAdapter } from "@/domain/policy-calendar";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import { manseryeokCalendarConversionAdapter } from "@/infrastructure/manseryeok";
import input from "./fixtures/core-reference-input.json";

const request = {
  instant: "2024-02-04T08:27:15Z",
  policyClock: "2024-02-04T16:59:59.999",
  dayBoundary: "zi-start",
} as const;
const pillars = {
  year: { heavenlyStem: "갑", earthlyBranch: "진" },
  month: { heavenlyStem: "병", earthlyBranch: "인" },
  day: { heavenlyStem: "무", earthlyBranch: "술" },
  hour: { heavenlyStem: "경", earthlyBranch: "신" },
} as const;
const dependencies = {
  timeZone: temporalTimeZoneAdapter,
  calendar: manseryeokCalendarConversionAdapter,
  pillars: manseryeokPolicyCalendarAdapter,
};

describe("policy calendar trust boundaries", () => {
  afterEach(() => vi.resetAllMocks());

  it("uses only the public API twice with independent floored clock fields and no solar/DST defaults", () => {
    vi.mocked(calculateFourPillars).mockReturnValue(pillars as never);
    const result = manseryeokPolicyCalendarAdapter.calculate(request);
    expect(calculateFourPillars).toHaveBeenNthCalledWith(1, {
      year: 2024,
      month: 2,
      day: 4,
      hour: 17,
      minute: 27,
      isLunar: false,
      isLeapMonth: false,
      dayBoundary: "midnight",
    });
    expect(calculateFourPillars).toHaveBeenNthCalledWith(2, {
      year: 2024,
      month: 2,
      day: 4,
      hour: 16,
      minute: 59,
      isLunar: false,
      isLeapMonth: false,
      dayBoundary: "jasi",
    });
    expect(Object.isFrozen(result.pillars.hour)).toBe(true);
    expect(result.provenance).toMatchObject({
      libraryVersion: "2.0.0",
      yearMonthBasis: "absolute-utc",
      dayHourBasis: "policy-clock",
      sdkPrecision: "floor-minute",
    });
  });

  it.each([1, 2])(
    "projects year/month from UTC and day/hour from policy, blocking malformed call %s",
    (call) => {
      vi.mocked(calculateFourPillars).mockReturnValue(pillars as never);
      if (call === 1) vi.mocked(calculateFourPillars).mockReturnValueOnce(null as never);
      else
        vi.mocked(calculateFourPillars)
          .mockReturnValueOnce(pillars as never)
          .mockReturnValueOnce({ ...pillars, hour: {} } as never);
      expect(() => manseryeokPolicyCalendarAdapter.calculate(request)).toThrow(
        expect.objectContaining({ code: "OUTPUT_INVALID" }),
      );
    },
  );

  it.each([new RangeError("private 2024"), new Error("private 2024")])(
    "sanitizes upstream exception %s",
    (failure) => {
      vi.mocked(calculateFourPillars).mockImplementation(() => {
        throw failure;
      });
      try {
        manseryeokPolicyCalendarAdapter.calculate(request);
        expect.fail("Expected failure");
      } catch (error) {
        expect(error).toBeInstanceOf(CalendarAdapterError);
        expect(error).not.toHaveProperty("cause");
        expect(String(error)).not.toContain("2024");
      }
    },
  );

  it("rejects wrong request echoes, damaged output and mismatched versions in application", () => {
    vi.mocked(calculateFourPillars).mockReturnValue(pillars as never);
    const known = calculatePolicySaju(input, dependencies);
    if (known.status !== "calculated") throw new Error("Expected calculated fixture");
    for (const raw of [
      null,
      { ...known.snapshot, request },
      { ...known.snapshot, provenance: { ...known.snapshot.provenance, libraryVersion: "future" } },
    ]) {
      const adapter = { calculate: () => raw } as unknown as PolicyCalendarAdapter;
      expect(() => calculatePolicySaju(input, { ...dependencies, pillars: adapter })).toThrow(
        expect.objectContaining({ code: "OUTPUT_INVALID" }),
      );
    }
    expect(
      PolicyCalculationResultSchema.safeParse({
        ...known,
        snapshot: { ...known.snapshot, request },
      }).success,
    ).toBe(false);
  });

  it("propagates a supplier failure instead of returning partial candidates", () => {
    const unknown = {
      ...input,
      birthInput: { ...input.birthInput, birthTime: { status: "unknown" } },
    };
    expect(() =>
      calculatePolicySaju(unknown, {
        ...dependencies,
        pillars: {
          calculate: () => {
            throw new Error("private date");
          },
        },
      }),
    ).toThrow(expect.objectContaining({ code: "CALCULATION_FAILED" }));
  });
});
