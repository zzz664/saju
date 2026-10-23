import { calculateCoreExport } from "../application/core-export/index";
import { createSyntheticPersonaCatalog } from "../infrastructure/persona/synthetic-catalog";
import { nodeSha256Adapter } from "../infrastructure/hashing/index";
import { manseryeokCalendarConversionAdapter, manseryeokEquationOfTimeAdapter, manseryeokPolicyCalendarAdapter, manseryeokSymbolCatalogAdapter } from "../infrastructure/manseryeok/index";
import { temporalTimeZoneAdapter } from "../infrastructure/timezone/index";

export function createApiTestCatalog() {
  const { registry, personas, selection } = createSyntheticPersonaCatalog();
  const fixtures = [{ id: "synthetic-known", label: "가상 사례 · 시각 있음" }, { id: "synthetic-unknown", label: "가상 사례 · 시각 미상" }, { id: "synthetic-unavailable", label: "가상 사례 · 경도 누락" }];
  const cache = new Map<string, ReturnType<typeof calculateCoreExport>>();
  return { registry, hash: nodeSha256Adapter, fixtures, personas, selection,
    spec: { specId: "developer-core-observations", specVersion: "1.0.0", featureId: "core-base", sections: [{ id: "overview", purpose: "기초 관찰과 한계", minFindings: 0 }],
      maxCharactersPerSection: 1200, readerLevel: "general", includeLimitations: true, allowFortuneScore: false },
    core(id: string) {
      if (!fixtures.some(item => item.id === id)) throw new Error("Fixture rejected.");
      if (!cache.has(id)) cache.set(id, calculateCoreExport({
        birthInput: { calendarType: "solar", birthDate: "2024-02-10", isLeapMonth: false,
          birthTime: id === "synthetic-unknown" ? { status: "unknown" } : { status: "known", time: "05:30" },
          timezoneId: "Asia/Seoul", longitudeDeg: null, latitudeDeg: null, directionBasis: "unspecified" },
        calculationPolicy: { solarTime: id === "synthetic-unavailable" ? "true-solar" : "standard", dayBoundary: "midnight", dstDisambiguation: "reject" },
      }, { timeZone: temporalTimeZoneAdapter, calendar: manseryeokCalendarConversionAdapter, equationOfTime: manseryeokEquationOfTimeAdapter,
        pillars: manseryeokPolicyCalendarAdapter, symbols: manseryeokSymbolCatalogAdapter }));
      return cache.get(id)!;
    } };
}
