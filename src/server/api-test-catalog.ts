import { createCoreDependencies } from "@/server/core-dependencies";
import { calculateCoreExport } from "@/application/core-export";
import { createSyntheticPersonaCatalog } from "@/infrastructure/persona/synthetic-catalog";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { executeFeature } from "@/application/saju/features";
import { AnalysisInputSchema } from "@/domain/input/schemas";

const coreSpec = {
  specId: "developer-core-observations",
  specVersion: "1.0.0",
  featureId: "core-base",
  sections: [{ id: "overview", purpose: "기초 관찰과 한계", minFindings: 0 }],
  maxCharactersPerSection: 1200,
  readerLevel: "general",
  includeLimitations: true,
  allowFortuneScore: false,
};
const strengthsSpec = {
  ...coreSpec,
  specId: "developer-f03-strengths",
  featureId: "F03",
  sections: [
    { id: "strengths", purpose: "강점으로 살펴볼 점", minFindings: 0 },
    { id: "weaknesses", purpose: "주의·보완할 점", minFindings: 0 },
    { id: "limits", purpose: "해석 범위와 한계", minFindings: 0 },
  ],
};
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

export function createApiTestCatalog() {
  const { registry, personas, selection } = createSyntheticPersonaCatalog();
  const fixtures = [
    { id: "synthetic-known", label: "가상 사례 · 시각 있음" },
    { id: "synthetic-unknown", label: "가상 사례 · 시각 미상" },
    { id: "synthetic-unavailable", label: "가상 사례 · 경도 누락" },
  ];
  const cache = new Map<string, ReturnType<typeof calculateCoreExport>>();
  const featureCache = new Map<string, ReturnType<typeof executeFeature>>();
  return {
    registry,
    hash: nodeSha256Adapter,
    fixtures,
    personas,
    selection,
    features: [
      { id: "core-base" as const, label: "기초 관찰 (core-base)" },
      { id: "F03" as const, label: "오행·십성 강점·약점 (F03)" },
    ],
    spec: coreSpec,
    specFor(featureId: "core-base" | "F03") {
      return featureId === "F03" ? strengthsSpec : coreSpec;
    },
    source(id: string, featureId: "core-base" | "F03") {
      if (featureId === "core-base") return this.core(id);
      if (!fixtures.some((item) => item.id === id)) throw new Error("Fixture rejected.");
      if (!featureCache.has(id))
        featureCache.set(
          id,
          executeFeature(
            { ...fixtureInput(id), featureId },
            { ...createCoreDependencies(), hash: nodeSha256Adapter },
          ),
        );
      return featureCache.get(id)!;
    },
    core(id: string) {
      if (!fixtures.some((item) => item.id === id)) throw new Error("Fixture rejected.");
      if (!cache.has(id))
        cache.set(id, calculateCoreExport(fixtureInput(id), createCoreDependencies()));
      return cache.get(id)!;
    },
  };
}
