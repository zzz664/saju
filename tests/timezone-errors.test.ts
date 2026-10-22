import { afterEach, describe, expect, it, vi } from "vitest";
import { Temporal } from "@js-temporal/polyfill";
import { TimeZoneAdapterError, TimeZoneResultSchema } from "@/domain/timezone";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";

const request = { localDateTime: "2024-01-01T00:00", timezoneId: "Asia/Seoul", disambiguation: "reject" } as const;

describe("timezone trust boundaries", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sanitizes unexpected Temporal exceptions", () => {
    vi.spyOn(Temporal.PlainDateTime, "from").mockImplementation(() => { throw new Error("private 2024-01-01"); });
    try { temporalTimeZoneAdapter.resolve(request); expect.fail("Expected failure"); }
    catch (error) {
      expect(error).toBeInstanceOf(TimeZoneAdapterError);
      expect(error).toMatchObject({ code: "RESOLUTION_FAILED" });
      expect(error).not.toHaveProperty("cause");
      expect(String(error)).not.toContain("2024");
    }
  });

  it("blocks malformed provider output without leaking schema or date parser exceptions", () => {
    const damaged = {
      epochNanoseconds: BigInt(0), offsetNanoseconds: 0,
      toInstant: () => ({ toString: () => "not-an-instant" }),
      toPlainDateTime: () => ({ toString: () => "2024-01-01T00:00:00" }),
    };
    vi.spyOn(Temporal.PlainDateTime, "from").mockReturnValue({ toZonedDateTime: () => damaged } as unknown as Temporal.PlainDateTime);
    expect(() => temporalTimeZoneAdapter.resolve(request)).toThrow(expect.objectContaining({ code: "OUTPUT_INVALID" }));
  });

  it("validates output version, UTC arithmetic and ambiguity policy", () => {
    const good = temporalTimeZoneAdapter.resolve(request);
    if (good.status !== "resolved") throw new Error("Expected unique time");
    for (const value of [
      { ...good, resolved: { ...good.resolved, instant: "bad" } },
      { ...good, resolved: { ...good.resolved, offsetSeconds: 0 } },
      { ...good, resolved: { ...good.resolved, localDateTime: "2024-01-01T01:00:00" } },
      { ...good, provenance: { ...good.provenance, engineVersion: "future" } },
      { ...good, kind: "fold" },
      { ...good, kind: "gap" },
    ]) expect(TimeZoneResultSchema.safeParse(value).success).toBe(false);
    const rejected = temporalTimeZoneAdapter.resolve({ ...request, timezoneId: "America/New_York", localDateTime: "2024-11-03T01:30" });
    expect(TimeZoneResultSchema.safeParse({ ...rejected, reason: "NONEXISTENT_LOCAL_TIME" }).success).toBe(false);
  });
});
