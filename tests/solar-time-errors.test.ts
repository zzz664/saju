import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("manseryeok", async (importOriginal) => ({ ...await importOriginal<typeof import("manseryeok")>(), equationOfTimeMinutes: vi.fn() }));
import { equationOfTimeMinutes } from "manseryeok";
import { manseryeokEquationOfTimeAdapter } from "@/infrastructure/manseryeok";
import { applySolarTimePolicy, SolarTimeSnapshotSchema, type EquationOfTimeAdapter } from "@/domain/solar-time";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";

const request = { instant: "2024-01-01T03:00:00Z" };
const time = temporalTimeZoneAdapter.resolve({ localDateTime: "2024-01-01T12:00", timezoneId: "Asia/Seoul", disambiguation: "reject" });
const base = { time, mode: "true-solar", longitudeDeg: 127.5 };

describe("solar time trust boundaries", () => {
  afterEach(() => vi.resetAllMocks());

  it.each([NaN, Infinity, -Infinity, 31, -31, undefined])("blocks invalid SDK EoT %s", (minutes) => {
    vi.mocked(equationOfTimeMinutes).mockReturnValue(minutes as number);
    expect(() => manseryeokEquationOfTimeAdapter.calculate(request)).toThrow(expect.objectContaining({ code: "OUTPUT_INVALID" }));
    expect(() => applySolarTimePolicy(base, manseryeokEquationOfTimeAdapter)).toThrow(expect.objectContaining({ code: "OUTPUT_INVALID" }));
  });

  it("normalizes SDK exceptions without retaining private data", () => {
    vi.mocked(equationOfTimeMinutes).mockImplementation(() => { throw new Error("private 2024-01-01"); });
    try { manseryeokEquationOfTimeAdapter.calculate(request); expect.fail("Expected failure"); }
    catch (error) { expect(error).toMatchObject({ code: "CALCULATION_FAILED" }); expect(String(error)).not.toContain("2024"); expect(error).not.toHaveProperty("cause"); }
  });

  it("calls the SDK with UTC milliseconds and validates echoed instant and pinned version", () => {
    vi.mocked(equationOfTimeMinutes).mockReturnValue(-3);
    const good = manseryeokEquationOfTimeAdapter.calculate(request);
    expect(equationOfTimeMinutes).toHaveBeenCalledExactlyOnceWith(Date.parse(request.instant));
    for (const raw of [null, { ...good, instant: "2024-01-02T03:00:00Z" }, { ...good, minutes: NaN }, { ...good, provenance: { ...good.provenance, libraryVersion: "future" } }]) {
      const provider = { calculate: () => raw } as unknown as EquationOfTimeAdapter;
      expect(() => applySolarTimePolicy(base, provider)).toThrow(expect.objectContaining({ code: "OUTPUT_INVALID" }));
    }
  });

  it("rejects tampered clocks, corrections, modes and invalid dates without parser exceptions", () => {
    const good = applySolarTimePolicy({ ...base, mode: "mean-solar" });
    for (const raw of [
      { ...good, instant: "bad" }, { ...good, instant: "2024-02-30T03:00:00Z" },
      { ...good, civilClock: "2024-01-01T13:00:00" }, { ...good, policyClock: "2024-01-01T12:00:00.000" },
      { ...good, correctionSeconds: 0 }, { ...good, offsetFromUtcSeconds: 1e14 },
      { ...good, mode: "true-solar" }, { ...good, mode: "standard" }, { ...good, longitudeDeg: null },
    ]) expect(SolarTimeSnapshotSchema.safeParse(raw).success).toBe(false);
  });
});
