import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AnalysisInputSchema,
  BirthInputSchema,
  CalculationPolicySchema,
  InputInformationSchema,
  getInputInformation,
  type AnalysisInput,
  type BirthInput,
  type CalculationPolicy,
} from "@/domain/input";

const birthInput = {
  calendarType: "solar",
  birthDate: "2000-02-29",
  isLeapMonth: false,
  birthTime: { status: "known", time: "09:30" },
  timezoneId: "Asia/Seoul",
  longitudeDeg: 126.978,
  latitudeDeg: 37.5665,
  directionBasis: "female",
} as const;

const calculationPolicy = {
  solarTime: "standard",
  dayBoundary: "midnight",
  dstDisambiguation: "reject",
} as const;

describe("BirthInputSchema", () => {
  it("preserves complete solar input and inferred types without coercion", () => {
    const result = BirthInputSchema.parse(birthInput);

    expect(result).toEqual(birthInput);
    expectTypeOf(result).toEqualTypeOf<BirthInput>();
    if (result.birthTime.status === "known") {
      expectTypeOf(result.birthTime.time).toEqualTypeOf<string>();
    }
  });

  it.each([false, true])("accepts lunar day 30 without Gregorian interpretation (leap=%s)", (isLeapMonth) => {
    const input = { ...birthInput, calendarType: "lunar", birthDate: "2023-02-30", isLeapMonth };

    expect(BirthInputSchema.parse(input)).toEqual(input);
  });

  it.each(["0001-01-01", "0099-12-31", "1900-02-28", "2000-02-29", "2400-02-29", "9999-12-31"])("accepts structural solar date boundary %s", (birthDate) => {
    expect(BirthInputSchema.safeParse({ ...birthInput, birthDate }).success).toBe(true);
  });

  it.each(["1900-02-29", "2100-02-29", "2023-02-29", "2024-04-31", "0000-01-01", "2024-00-01", "2024-13-01", "2024-01-00", "2024-01-32", "2024-2-09", " 2024-02-09", "2024-02-09 ", "2024-02-09\n", "2024-02-09\r\n", "2024-02-09T00:00:00Z"])("rejects invalid solar date %s", (birthDate) => {
    expect(BirthInputSchema.safeParse({ ...birthInput, birthDate }).success).toBe(false);
  });

  it("rejects lunar day 31 while leaving lunar calendar conversion to the adapter", () => {
    expect(BirthInputSchema.safeParse({ ...birthInput, calendarType: "lunar", birthDate: "2024-01-31" }).success).toBe(false);
  });

  it("reports solar leap-month misuse at its field path", () => {
    const result = BirthInputSchema.safeParse({ ...birthInput, isLeapMonth: true });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual(["isLeapMonth"]);
    }
  });

  it.each(["00:00", "23:00", "23:59"])("preserves clock boundary %s", (time) => {
    expect(BirthInputSchema.parse({ ...birthInput, birthTime: { status: "known", time } }).birthTime).toEqual({ status: "known", time });
  });

  it.each(["24:00", "12:60", "-1:00", "9:30", "09:30:00", "09:30 ", "09:30\n", "09:30\r\n", "", "unknown"])("rejects invalid time %s", (time) => {
    expect(BirthInputSchema.safeParse({ ...birthInput, birthTime: { status: "known", time } }).success).toBe(false);
  });

  it("keeps unknown time separate from a real midnight", () => {
    const unknown = BirthInputSchema.parse({ ...birthInput, birthTime: { status: "unknown" } });

    expect(unknown.birthTime).toEqual({ status: "unknown" });
    expect("time" in unknown.birthTime).toBe(false);
    expect(unknown.birthTime).not.toEqual({ status: "known", time: "00:00" });
  });

  it.each([{ status: "known" }, { status: "unknown", time: "12:00" }, { status: "unknown", time: null }, { status: "approximate", time: "12:00" }, null])("rejects inconsistent time input %j", (value) => {
    expect(BirthInputSchema.safeParse({ ...birthInput, birthTime: value }).success).toBe(false);
  });

  it.each(["Asia/Seoul", "America/New_York", "Pacific/Chatham", "Etc/UTC", "UTC", "US/Eastern"])("preserves the explicit timezone %s", (timezoneId) => {
    expect(BirthInputSchema.parse({ ...birthInput, timezoneId }).timezoneId).toBe(timezoneId);
  });

  it.each(["", "KST", "PST", "+09:00", "UTC+9", "Mars/Olympus", " Asia/Seoul"])("rejects non-IANA/ambiguous zone %s", (timezoneId) => {
    expect(BirthInputSchema.safeParse({ ...birthInput, timezoneId }).success).toBe(false);
  });

  it.each([[-180, -90], [180, 90], [0, 0], [null, null], [null, 37.5], [127, null]])("accepts explicit coordinate boundaries %s/%s", (longitudeDeg, latitudeDeg) => {
    const parsed = BirthInputSchema.parse({ ...birthInput, longitudeDeg, latitudeDeg });

    expect(parsed.longitudeDeg).toBe(longitudeDeg);
    expect(parsed.latitudeDeg).toBe(latitudeDeg);
  });

  it.each([{ longitudeDeg: 180.00001 }, { longitudeDeg: -180.00001 }, { latitudeDeg: 90.00001 }, { latitudeDeg: -90.00001 }, { longitudeDeg: "127" }, { longitudeDeg: NaN }, { latitudeDeg: Infinity }])("rejects invalid coordinates %j", (patch) => {
    expect(BirthInputSchema.safeParse({ ...birthInput, ...patch }).success).toBe(false);
  });

  it.each(["male", "female", "unspecified"])("preserves direction basis %s without guessing", (directionBasis) => {
    expect(BirthInputSchema.parse({ ...birthInput, directionBasis }).directionBasis).toBe(directionBasis);
  });

  it.each(Object.keys(birthInput))("rejects omitted required field %s rather than filling a default", (field) => {
    const incomplete: Record<string, unknown> = { ...birthInput };
    delete incomplete[field];

    expect(BirthInputSchema.safeParse(incomplete).success).toBe(false);
  });

  it.each([{ calendarType: "gregorian" }, { isLeapMonth: "false" }, { directionBasis: "unknown" }, { directionBasis: null }, { gender: "female" }, { calculationPolicy }])("rejects wrong types/enums or undeclared fields %j", (patch) => {
    expect(BirthInputSchema.safeParse({ ...birthInput, ...patch }).success).toBe(false);
  });

  it.each([null, undefined, [], "2000-02-29", 0])("rejects non-object birth input %j", (input) => {
    expect(BirthInputSchema.safeParse(input).success).toBe(false);
  });

  it("provides a nested field path for an invalid clock", () => {
    const result = AnalysisInputSchema.safeParse({ birthInput: { ...birthInput, birthTime: { status: "known", time: "24:00" } }, calculationPolicy });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toContainEqual(["birthInput", "birthTime", "time"]);
    }
  });
});

describe("CalculationPolicySchema and analysis envelope", () => {
  it("keeps policy and birth facts in separate typed objects", () => {
    const input = AnalysisInputSchema.parse({ birthInput, calculationPolicy });

    expectTypeOf(input).toEqualTypeOf<AnalysisInput>();
    expectTypeOf(input.calculationPolicy).toEqualTypeOf<CalculationPolicy>();
    expect(input).toEqual({ birthInput, calculationPolicy });
  });

  it.each(["standard", "mean-solar", "true-solar"])("accepts explicit %s policy with each day-boundary/DST choice", (solarTime) => {
    for (const dayBoundary of ["midnight", "zi-start"]) {
      for (const dstDisambiguation of ["reject", "earlier", "later"]) {
        expect(CalculationPolicySchema.safeParse({ solarTime, dayBoundary, dstDisambiguation }).success).toBe(true);
      }
    }
  });

  it.each([{}, { ...calculationPolicy, solarTime: "auto" }, { ...calculationPolicy, dayBoundary: "guess" }, { ...calculationPolicy, dstDisambiguation: "compatible" }, { ...calculationPolicy, timezoneId: "Asia/Seoul" }])("rejects absent/implicit/unknown policies %j", (input) => {
    expect(CalculationPolicySchema.safeParse(input).success).toBe(false);
  });

  it.each(Object.keys(calculationPolicy))("requires explicit policy field %s", (field) => {
    const incomplete: Record<string, unknown> = { ...calculationPolicy };
    delete incomplete[field];

    expect(CalculationPolicySchema.safeParse(incomplete).success).toBe(false);
  });

  it.each([{ birthInput }, { calculationPolicy }, { birthInput, calculationPolicy, userId: "untrusted" }])("rejects incomplete or extended envelopes %j", (input) => {
    expect(AnalysisInputSchema.safeParse(input).success).toBe(false);
  });

  it.each(["2024-03-10", "2024-11-03"])("leaves DST gap/fold resolution to the timezone module for %s", (birthDate) => {
    const input = { birthInput: { ...birthInput, birthDate, timezoneId: "America/New_York", birthTime: { status: "known", time: birthDate === "2024-03-10" ? "02:30" : "01:30" } }, calculationPolicy: { ...calculationPolicy, dstDisambiguation: "later" } };

    expect(AnalysisInputSchema.parse(input)).toEqual(input);
  });

  it("round-trips unknown values through JSON and freezes parsed objects without freezing caller input", () => {
    const raw = { birthInput: { ...birthInput, birthTime: { status: "unknown" }, longitudeDeg: null, directionBasis: "unspecified" }, calculationPolicy: { ...calculationPolicy } };
    const parsed = AnalysisInputSchema.parse(raw);

    expect(AnalysisInputSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.birthInput)).toBe(true);
    expect(Object.isFrozen(parsed.birthInput.birthTime)).toBe(true);
    expect(Object.isFrozen(parsed.calculationPolicy)).toBe(true);
    expect(Object.isFrozen(raw)).toBe(false);
    expect(Object.isFrozen(raw.birthInput)).toBe(false);
  });
});

describe("getInputInformation", () => {
  it("reports no missing data or limitations for complete input", () => {
    expect(getInputInformation(AnalysisInputSchema.parse({ birthInput, calculationPolicy }))).toEqual({ unknownFields: [], limitations: [] });
  });

  it("preserves all unknown fields without inventing defaults or emitting birth values", () => {
    const input = AnalysisInputSchema.parse({
      birthInput: { ...birthInput, birthTime: { status: "unknown" }, longitudeDeg: null, latitudeDeg: null, directionBasis: "unspecified" },
      calculationPolicy,
    });
    const original = structuredClone(input);
    const information = getInputInformation(input);

    expect(information.unknownFields).toEqual(["birthTime", "longitudeDeg", "latitudeDeg", "directionBasis"]);
    expect(information.limitations.map((limit) => limit.code)).toEqual(["BIRTH_TIME_UNKNOWN", "LUCK_DIRECTION_BASIS_UNKNOWN"]);
    expect(input).toEqual(original);
    expect(JSON.stringify(information)).not.toContain(birthInput.birthDate);
    expect(JSON.stringify(information)).not.toContain(birthInput.timezoneId);
  });

  it.each(["mean-solar", "true-solar"])("reports unavailable %s correction for missing longitude without choosing standard time", (solarTime) => {
    const input = AnalysisInputSchema.parse({ birthInput: { ...birthInput, longitudeDeg: null }, calculationPolicy: { ...calculationPolicy, solarTime } });

    expect(getInputInformation(input).limitations).toContainEqual({ code: "SOLAR_TIME_INPUT_MISSING", inputPaths: ["birthInput.longitudeDeg"] });
    expect(input.calculationPolicy.solarTime).toBe(solarTime);
  });

  it("reports both missing clock and longitude required by requested solar correction", () => {
    const input = AnalysisInputSchema.parse({ birthInput: { ...birthInput, birthTime: { status: "unknown" }, longitudeDeg: null }, calculationPolicy: { ...calculationPolicy, solarTime: "true-solar" } });

    expect(getInputInformation(input).limitations).toContainEqual({ code: "SOLAR_TIME_INPUT_MISSING", inputPaths: ["birthInput.birthTime", "birthInput.longitudeDeg"] });
  });

  it("reports missing time for solar correction even with known longitude", () => {
    const input = AnalysisInputSchema.parse({ birthInput: { ...birthInput, birthTime: { status: "unknown" } }, calculationPolicy: { ...calculationPolicy, solarTime: "mean-solar" } });

    expect(getInputInformation(input).limitations).toContainEqual({ code: "SOLAR_TIME_INPUT_MISSING", inputPaths: ["birthInput.birthTime"] });
  });

  it("treats zero longitude as known and missing latitude as informational", () => {
    const input = AnalysisInputSchema.parse({ birthInput: { ...birthInput, longitudeDeg: 0, latitudeDeg: null }, calculationPolicy: { ...calculationPolicy, solarTime: "true-solar" } });

    expect(getInputInformation(input)).toEqual({ unknownFields: ["latitudeDeg"], limitations: [] });
  });

  it("keeps known midnight distinct from unknown time when assessing limitations", () => {
    const input = AnalysisInputSchema.parse({ birthInput: { ...birthInput, birthTime: { status: "known", time: "00:00" } }, calculationPolicy });

    expect(getInputInformation(input)).toEqual({ unknownFields: [], limitations: [] });
  });

  it("validates metadata without allowing copied birth values, unsupported codes or empty evidence paths", () => {
    const information = getInputInformation(AnalysisInputSchema.parse({ birthInput: { ...birthInput, directionBasis: "unspecified" }, calculationPolicy }));

    expect(InputInformationSchema.parse(information)).toEqual(information);
    expect(InputInformationSchema.safeParse({ ...information, birthDate: birthInput.birthDate }).success).toBe(false);
    expect(InputInformationSchema.safeParse({ ...information, limitations: [{ code: "GUESSED_DIRECTION", inputPaths: ["birthInput.directionBasis"] }] }).success).toBe(false);
    expect(InputInformationSchema.safeParse({ ...information, limitations: [{ code: "LUCK_DIRECTION_BASIS_UNKNOWN", inputPaths: [] }] }).success).toBe(false);
    expect(Object.isFrozen(information)).toBe(true);
    expect(Object.isFrozen(information.unknownFields)).toBe(true);
    expect(Object.isFrozen(information.limitations[0].inputPaths)).toBe(true);
  });
});
