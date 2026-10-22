import { beforeEach, describe, expect, it, vi } from "vitest";

import { CalendarAdapterError } from "@/domain/calendar";
import golden from "./fixtures/solar-terms-golden.json";

const sdk = vi.hoisted(() => ({ getSolarTermsOfYear: vi.fn() }));
vi.mock("manseryeok", async (importOriginal) => ({
  ...await importOriginal<typeof import("manseryeok")>(),
  getSolarTermsOfYear: sdk.getSolarTermsOfYear,
}));

import { manseryeokSolarCalendarAdapter } from "@/infrastructure/manseryeok/solar-calendar";

function validTerms() {
  return golden.terms.map(([name, time], index) => ({
    index, name, date: new Date(`2024-${time}+09:00`), hanja: "SDK-only metadata",
  }));
}

// Give heterogeneous fault factories a stable type instead of a recursive tuple union.
const malformedCases: ReadonlyArray<readonly [string, () => unknown]> = [
  ["missing array", () => undefined],
  ["missing term", () => validTerms().slice(1)],
  ["wrong order", () => validTerms().reverse()],
  ["duplicate index", () => validTerms().map((term) => ({ ...term, index: 0 }))],
  ["name/index mismatch", () => validTerms().map((term) => ({ ...term, name: "입춘" }))],
  ["invalid Date", () => validTerms().map((term) => ({ ...term, date: new Date(NaN) }))],
  ["string instead of Date", () => validTerms().map((term) => ({ ...term, date: term.date.toISOString() }))],
  ["wrong year", () => validTerms().map((term) => ({ ...term, date: new Date("2023-02-04T08:27:00Z") }))],
  ["non-minute resolution", () => validTerms().map((term) => ({ ...term, date: new Date(term.date.getTime() + 30_000) }))],
];

describe("solar schedule supplier boundary (explicit SDK mock)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("rejects years that would enter upstream approximation before calling the SDK", () => {
    expect(() => manseryeokSolarCalendarAdapter.getSolarTerms({ year: 1700 })).toThrow(CalendarAdapterError);
    expect(sdk.getSolarTermsOfYear).not.toHaveBeenCalled();
  });

  it.each([
    [new RangeError("private date 2024-02-04"), "INPUT_REJECTED"],
    [new Error("private birth date 2024-02-04"), "CALCULATION_FAILED"],
  ])("sanitizes supplier failure %s", (failure, code) => {
    sdk.getSolarTermsOfYear.mockImplementation(() => { throw failure; });
    try {
      manseryeokSolarCalendarAdapter.getSolarTerms({ year: 2024 });
      expect.fail("Expected supplier rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(CalendarAdapterError);
      expect(error).toMatchObject({ code });
      expect(error).not.toHaveProperty("cause");
      expect(String(error)).not.toContain("private");
      expect(String(error)).not.toContain("2024");
    }
  });

  it.each(malformedCases)("rejects malformed SDK output: %s", (_label, output) => {
    sdk.getSolarTermsOfYear.mockReturnValue(output());
    expect(() => manseryeokSolarCalendarAdapter.getSolarTerms({ year: 2024 })).toThrow(expect.objectContaining({ code: "OUTPUT_INVALID" }));
  });

  it("projects SDK Date objects to stable plain strings without leaking metadata", () => {
    const raw = validTerms();
    sdk.getSolarTermsOfYear.mockReturnValue(raw);
    const snapshot = manseryeokSolarCalendarAdapter.getSolarTerms({ year: 2024 });
    expect(Object.keys(snapshot.terms[0])).toEqual(["index", "name", "startsAt", "isMonthBoundary"]);
    raw[0].date.setUTCFullYear(2000);
    expect(snapshot.terms[0].startsAt).toBe("2024-01-05T20:49:00.000Z");
  });
});
