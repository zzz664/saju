import { createCoreDependencies } from "@/server/core-dependencies";
import { createSyntheticPersonaCatalog } from "@/infrastructure/persona/synthetic-catalog";
import { loadInterpretationCatalog } from "@/infrastructure/interpretation/catalog";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { executeFeature } from "@/application/saju/features";
import { AnalysisInputSchema } from "@/domain/input/schemas";

export const API_TEST_FEATURES = [{ id: "F03" as const, label: "오행·십성 강점·약점 (F03)" }];
export type ApiTestFeatureId = (typeof API_TEST_FEATURES)[number]["id"];

function fixtureInput(id: string) {
  return AnalysisInputSchema.parse({
    birthInput: {
      calendarType: "solar",
      birthDate: "2024-02-10",
      isLeapMonth: false,
      birthTime:
        id === "synthetic-unknown" ? { status: "unknown" } : { status: "known", time: "05:30" },
      timezoneId: "Asia/Seoul",
      longitudeDeg: null,
      latitudeDeg: null,
      directionBasis: "unspecified",
    },
    calculationPolicy: {
      solarTime: id === "synthetic-unavailable" ? "true-solar" : "standard",
      dayBoundary: "midnight",
      dstDisambiguation: "reject",
    },
  });
}

/** Synthetic fixtures, approved personas and the classical lookup catalog for the developer console. */
export function createApiTestCatalog() {
  const { registry, personas, selection } = createSyntheticPersonaCatalog();
  const fixtures = [
    { id: "synthetic-known", label: "가상 사례 · 시각 있음" },
    { id: "synthetic-unknown", label: "가상 사례 · 시각 미상" },
    { id: "synthetic-unavailable", label: "가상 사례 · 경도 누락" },
  ];
  const featureCache = new Map<string, ReturnType<typeof executeFeature>>();
  return {
    registry,
    hash: nodeSha256Adapter,
    interpretation: loadInterpretationCatalog(),
    fixtures,
    personas,
    selection,
    features: API_TEST_FEATURES,
    source(id: string, featureId: ApiTestFeatureId) {
      if (!fixtures.some((item) => item.id === id)) throw new Error("Fixture rejected.");
      const key = `${featureId}:${id}`;
      if (!featureCache.has(key))
        featureCache.set(
          key,
          executeFeature(
            { ...fixtureInput(id), featureId },
            { ...createCoreDependencies(), hash: nodeSha256Adapter },
          ),
        );
      return featureCache.get(key)!;
    },
  };
}
