import { describe, expect, it } from "vitest";
import { executeFeature } from "@/application/saju/features";
import { FeatureRequestSchema, FeatureResultSchema } from "@/schemas/features";
import { fingerprintInput, fingerprintDependencies } from "./helpers/fingerprint-input";
import { nodeSha256Adapter } from "@/infrastructure/hashing";

describe("M09 initial acceptance", () => {
  it("routes an unimplemented feature without claiming completion", () => {
    const request = { featureId: "F02", ...fingerprintInput };
    expect(FeatureRequestSchema.safeParse(request).success).toBe(true);
    const result = executeFeature(request, { ...fingerprintDependencies, hash: nodeSha256Adapter });
    expect(result.featureId).toBe("F02");
    expect(result.status).toBe("partial");
    expect(result.limitations).toContain("EXECUTOR_NOT_IMPLEMENTED");
    expect(result.judgments).toEqual([]);
    expect(FeatureResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
  it("requires target parameters and the second birth input for the right features", () => {
    expect(FeatureRequestSchema.safeParse({ featureId: "F08", ...fingerprintInput }).success).toBe(
      false,
    );
    expect(FeatureRequestSchema.safeParse({ featureId: "F11", ...fingerprintInput }).success).toBe(
      false,
    );
  });
});
