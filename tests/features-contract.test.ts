import { describe, expect, it } from "vitest";
import { FeatureRequestSchema, FeatureIdSchema } from "@/schemas/features";
import { featureRequest } from "./helpers/feature-input";

describe("M09 public discriminated request contract", () => {
  it.each(FeatureIdSchema.options)("accepts %s with only its documented parameters", (id) => {
    const value = featureRequest(id),
      result = FeatureRequestSchema.parse(value);
    expect(result.featureId).toBe(id);
    expect(Object.isFrozen(result)).toBe(true);
    expect(FeatureRequestSchema.safeParse({ ...value, model: "private-model" }).success).toBe(
      false,
    );
    expect(FeatureRequestSchema.safeParse({ ...value, clientUserId: "private" }).success).toBe(
      false,
    );
  });
  it.each(["F08", "F09", "F10"] as const)(
    "requires a target and rejects the wrong target kind for %s",
    (id) => {
      const without: Record<string, unknown> = { ...featureRequest(id) };
      delete without.target;
      expect(FeatureRequestSchema.safeParse(without).success).toBe(false);
      expect(
        FeatureRequestSchema.safeParse({ ...without, target: { private: true } }).success,
      ).toBe(false);
    },
  );
  it("requires both other birth information and an explicit independent policy for F11", () => {
    const input = featureRequest("F11") as ReturnType<typeof featureRequest> & {
      otherBirthInput: unknown;
      otherCalculationPolicy: unknown;
    };
    expect(FeatureRequestSchema.safeParse({ ...input, otherBirthInput: undefined }).success).toBe(
      false,
    );
    expect(
      FeatureRequestSchema.safeParse({ ...input, otherCalculationPolicy: undefined }).success,
    ).toBe(false);
    expect(
      FeatureRequestSchema.safeParse({
        ...featureRequest("F03"),
        otherBirthInput: input.otherBirthInput,
      }).success,
    ).toBe(false);
  });
  it("accepts F10 subtypes and rejects invalid Gregorian dates/months without inferring today", () => {
    for (const target of [
      { kind: "monthly", year: 2024, month: 2, timezoneId: "Asia/Seoul" },
      { kind: "daily", date: "2024-02-29", timezoneId: "UTC" },
      { kind: "today", date: "2026-10-24", timezoneId: "America/New_York" },
    ])
      expect(FeatureRequestSchema.safeParse({ ...featureRequest("F10"), target }).success).toBe(
        true,
      );
    for (const target of [
      { kind: "monthly", year: 2024, month: 13, timezoneId: "Asia/Seoul" },
      { kind: "daily", date: "2023-02-29", timezoneId: "UTC" },
      { kind: "today", timezoneId: "UTC" },
      { kind: "daily", date: "2024-01-01", timezoneId: "+09:00" },
    ])
      expect(FeatureRequestSchema.safeParse({ ...featureRequest("F10"), target }).success).toBe(
        false,
      );
    expect(
      FeatureRequestSchema.safeParse({
        ...featureRequest("F08"),
        target: { at: "2026-10-24T00:00:00", timezoneId: "UTC" },
      }).success,
    ).toBe(false);
    expect(
      FeatureRequestSchema.safeParse({
        ...featureRequest("F03"),
        target: { year: 2026, timezoneId: "UTC" },
      }).success,
    ).toBe(false);
  });
});
