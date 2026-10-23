import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarAdapterError, type CalendarRequest } from "@/domain/calendar";

const sdk = vi.hoisted(() => ({ calculateFourPillars: vi.fn() }));
vi.mock("manseryeok", async (importOriginal) => ({
  ...(await importOriginal<typeof import("manseryeok")>()),
  calculateFourPillars: sdk.calculateFourPillars,
}));

import { manseryeokDayCalendarAdapter } from "@/infrastructure/manseryeok/day-calendar";

const request: CalendarRequest = {
  year: 2024,
  month: 2,
  day: 10,
  hour: 12,
  minute: 0,
  calendarType: "solar",
  isLeapMonth: false,
  timeReference: "fixed-utc+09:00",
  dayBoundary: "midnight",
};

describe("day-pillar supplier failure boundary (explicit SDK mock)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects a missing time without a provider call or invented noon", () => {
    expect(() =>
      manseryeokDayCalendarAdapter.calculateDay({
        ...request,
        hour: undefined,
      } as unknown as CalendarRequest),
    ).toThrow(CalendarAdapterError);
    expect(sdk.calculateFourPillars).not.toHaveBeenCalled();
  });

  it.each([
    [new RangeError("private date 2024-02-10"), "INPUT_REJECTED"],
    [new Error("private date 2024-02-10"), "CALCULATION_FAILED"],
  ])("keeps provider failures sanitized: %s", (failure, code) => {
    sdk.calculateFourPillars.mockImplementation(() => {
      throw failure;
    });
    try {
      manseryeokDayCalendarAdapter.calculateDay(request);
      expect.fail("Expected provider rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarAdapterError);
      expect(error).toMatchObject({ code });
      expect(error).not.toHaveProperty("cause");
      expect(String(error)).not.toContain("private");
      expect(String(error)).not.toContain("2024");
    }
  });

  it.each([
    undefined,
    { heavenlyStem: "wrong", earthlyBranch: "진" },
    { heavenlyStem: "갑", earthlyBranch: "wrong" },
  ])("blocks a corrupt day pillar %j", (day) => {
    const placeholder = { heavenlyStem: "갑", earthlyBranch: "자" };
    sdk.calculateFourPillars.mockReturnValue({
      year: placeholder,
      month: placeholder,
      day,
      hour: placeholder,
    });
    expect(() => manseryeokDayCalendarAdapter.calculateDay(request)).toThrow(
      expect.objectContaining({ code: "OUTPUT_INVALID" }),
    );
  });
});
