import { describe, expect, it } from "vitest";

import {
  TimeZoneAdapterError,
  TimeZoneResultSchema,
  type LocalTimeRequest,
  type TimeZoneAdapter,
} from "@/domain/timezone";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";
import golden from "./fixtures/timezone-golden.json";

const adapter: TimeZoneAdapter = temporalTimeZoneAdapter;
const request = {
  localDateTime: "2024-01-01T00:00",
  timezoneId: "Asia/Seoul",
  disambiguation: "reject",
} as const;

describe("IANA wall-clock resolution (real Temporal and runtime ICU)", () => {
  it.each(golden.unique)("matches independent IANA rule arithmetic: $id", (fixture) => {
    for (const disambiguation of ["reject", "earlier", "later"] as const) {
      const result = adapter.resolve({
        localDateTime: fixture.local,
        timezoneId: fixture.zone,
        disambiguation,
      });
      expect(result).toMatchObject({
        status: "resolved",
        kind: "unique",
        resolved: {
          instant: fixture.instant,
          localDateTime: fixture.local + ":00",
          offsetSeconds: fixture.offsetSeconds,
        },
      });
    }
  });

  it.each(golden.transitions)("classifies and disambiguates a real transition: $id", (fixture) => {
    const base = { localDateTime: fixture.local, timezoneId: fixture.zone };
    const rejected = adapter.resolve({ ...base, disambiguation: "reject" });
    expect(rejected).toMatchObject({
      status: "rejected",
      kind: fixture.kind,
      reason: fixture.kind === "fold" ? "AMBIGUOUS_LOCAL_TIME" : "NONEXISTENT_LOCAL_TIME",
    });
    expect(rejected).not.toHaveProperty("resolved");
    for (const disambiguation of ["earlier", "later"] as const) {
      const result = adapter.resolve({ ...base, disambiguation });
      const [instant, localDateTime, offsetSeconds] = fixture[disambiguation];
      expect(result).toMatchObject({
        status: "resolved",
        kind: fixture.kind,
        request: { ...base, disambiguation },
        resolved: { instant, localDateTime, offsetSeconds },
      });
    }
  });

  it.each([
    ["2024-03-10T01:59", "unique"],
    ["2024-03-10T02:00", "gap"],
    ["2024-03-10T02:59", "gap"],
    ["2024-03-10T03:00", "unique"],
    ["2024-11-03T00:59", "unique"],
    ["2024-11-03T01:00", "fold"],
    ["2024-11-03T01:59", "fold"],
    ["2024-11-03T02:00", "unique"],
  ])("uses transition interval endpoints at %s", (localDateTime, kind) => {
    expect(
      adapter.resolve({ ...request, localDateTime, timezoneId: "America/New_York" }).kind,
    ).toBe(kind);
  });

  it("preserves the explicit zone alias, original request and versioned immutable DTO", () => {
    const input = Object.freeze({ ...request, timezoneId: "US/Eastern" });
    const result = adapter.resolve(input);
    expect(result.request).toEqual(input);
    expect(result.provenance).toEqual({
      engineName: "@js-temporal/polyfill",
      engineVersion: "0.5.1",
      icuVersion: process.versions.icu,
      tzdbVersion: process.versions.tz,
      ruleId: "time.local-to-instant",
      ruleVersion: "1.0.0",
    });
    for (const item of [result, result.request, result.provenance])
      expect(Object.isFrozen(item)).toBe(true);
    if (result.status === "resolved") expect(Object.isFrozen(result.resolved)).toBe(true);
    expect(TimeZoneResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it.each(["1800-01-01T00:00", "2300-12-31T23:59"])(
    "accepts supported endpoint %s",
    (localDateTime) => {
      expect(adapter.resolve({ ...request, localDateTime }).status).toBe("resolved");
    },
  );

  it.each([
    null,
    {},
    { ...request, localDateTime: "2024-02-30T12:00" },
    { ...request, localDateTime: "2024-01-01T24:00" },
    { ...request, localDateTime: "2024-01-01T12:00:00" },
    { ...request, localDateTime: "2024-01-01T12:00Z" },
    { ...request, localDateTime: "2024-01-01T12:00\n" },
    { ...request, localDateTime: "1799-12-31T23:59" },
    { ...request, localDateTime: "2301-01-01T00:00" },
    { ...request, timezoneId: "+09:00" },
    { ...request, timezoneId: "PST" },
    { ...request, timezoneId: "Mars/Unknown" },
    { ...request, timezoneId: undefined },
    { ...request, disambiguation: undefined },
    { ...request, disambiguation: "compatible" },
    { ...request, longitudeDeg: 127 },
  ])("rejects invalid input without raw values or default policies %j", (value) => {
    try {
      adapter.resolve(value as LocalTimeRequest);
      expect.fail("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(TimeZoneAdapterError);
      expect(error).toMatchObject({
        code: "INPUT_REJECTED",
        message: "Local time input was rejected.",
      });
      expect(error).not.toHaveProperty("cause");
      expect(error).not.toHaveProperty("issues");
      expect(String(error)).not.toContain("2024");
    }
  });
});
