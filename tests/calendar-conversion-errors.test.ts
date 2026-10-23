import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarAdapterError } from "@/domain/calendar";

const sdk = vi.hoisted(() => ({ solarToLunar: vi.fn(), lunarToSolar: vi.fn() }));
vi.mock("manseryeok", () => sdk);

import { manseryeokCalendarConversionAdapter } from "@/infrastructure/manseryeok/conversion";

const solar = { year: 2023, month: 3, day: 22, calendarType: "solar", isLeapMonth: false } as const;
const lunar = { year: 2023, month: 2, day: 1, calendarType: "lunar", isLeapMonth: true } as const;

describe("conversion supplier failure boundary (explicit SDK mock)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects structurally invalid input before invoking the SDK", () => {
    expect(() => manseryeokCalendarConversionAdapter.convert({ ...solar, day: 32 })).toThrow(
      CalendarAdapterError,
    );
    expect(sdk.solarToLunar).not.toHaveBeenCalled();
    expect(sdk.lunarToSolar).not.toHaveBeenCalled();
  });

  it.each(["solar", "lunar"] as const)(
    "sanitizes unexpected SDK failures for %s requests",
    (direction) => {
      const operation = direction === "solar" ? sdk.solarToLunar : sdk.lunarToSolar;
      operation.mockImplementation(() => {
        throw new Error("private birth date 2023-03-22");
      });
      try {
        manseryeokCalendarConversionAdapter.convert(direction === "solar" ? solar : lunar);
        expect.fail("Expected provider error");
      } catch (error) {
        expect(error).toBeInstanceOf(CalendarAdapterError);
        expect(error).toMatchObject({
          code: "CALCULATION_FAILED",
          message: "Calendar calculation failed.",
        });
        expect(error).not.toHaveProperty("cause");
        expect(String(error)).not.toContain("private");
        expect(String(error)).not.toContain("2023");
      }
    },
  );

  it.each([
    undefined,
    { year: 2023, month: 2, day: 1 },
    { year: 2023, month: 13, day: 1, isLeapMonth: true },
  ])("rejects malformed lunar SDK output %j", (output) => {
    sdk.solarToLunar.mockReturnValue(output);
    expect(() => manseryeokCalendarConversionAdapter.convert(solar)).toThrow(
      expect.objectContaining({ code: "OUTPUT_INVALID" }),
    );
  });

  it("rejects impossible Gregorian output from the SDK", () => {
    sdk.lunarToSolar.mockReturnValue({ year: 2023, month: 2, day: 30 });
    expect(() => manseryeokCalendarConversionAdapter.convert(lunar)).toThrow(
      expect.objectContaining({ code: "OUTPUT_INVALID" }),
    );
  });
});
