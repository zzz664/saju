import { calculateCoreExport } from "../application/core-export/index";
import { createApprovedPersonaRegistry, PersonaError } from "../domain/persona/index";
import { syntheticFormalProfile } from "../domain/persona/synthetic-formal";
import { nodeSha256Adapter } from "../infrastructure/hashing/index";
import { manseryeokCalendarConversionAdapter, manseryeokEquationOfTimeAdapter, manseryeokPolicyCalendarAdapter, manseryeokSymbolCatalogAdapter } from "../infrastructure/manseryeok/index";
import { temporalTimeZoneAdapter } from "../infrastructure/timezone/index";

// Approved only for this local developer tool. These are synthetic style labels,
// never a product character or an arbitrary uploaded prompt/profile.
const profile = { schemaVersion: "1.0.0", personaId: "synthetic-style", personaVersion: "1.0.0", displayName: "합성 해요체", description: "개발자 Mock 검증용 합성 설정",
  role: "검증된 판단을 설명하는 가상의 안내자", identityDisclosure: "fictional_narrator",
  personality: { coreTraits: [{ trait: "신중함", strength: 0.8, expression: "근거와 한계를 함께 짚는다" }], values: ["정확성", "절제"], avoidPersonality: ["전지전능한 예언가"] },
  voice: { locale: "ko-KR", register: "haeyo", relationship: "예의를 지키는 안내자", sentenceRhythm: "짧은 문장과 중간 길이 문장 혼합", directness: "balanced",
    metaphorLevel: "none", humorLevel: "none", emojiPolicy: "none", preferredExpressions: ["먼저 살펴볼게요"], avoidExpressions: ["이는 ~을 의미합니다"], catchphrases: [], catchphraseMaxPerReport: 0 },
  narrative: { introStrategy: "인사 없이 관찰부터", paragraphsPerSection: { min: 1, max: 3 }, sentencesPerParagraph: { min: 1, max: 4 }, preferredFlow: ["관찰", "한계"], avoid: ["과장과 예언"] },
  examples: [{ intent: "uncertainty", avoid: "반드시 성사됩니다.", prefer: "제공된 근거만으로 확정할 수는 없어요." }] };
export function createApiTestCatalog() {
  const profiles = [profile, syntheticFormalProfile];
  const registry = createApprovedPersonaRegistry(profiles.map(item => ({ status: "approved", personaId: item.personaId, personaVersion: item.personaVersion, json: JSON.stringify(item) })));
  const fixtures = [{ id: "synthetic-known", label: "가상 사례 · 시각 있음" }, { id: "synthetic-unknown", label: "가상 사례 · 시각 미상" }, { id: "synthetic-unavailable", label: "가상 사례 · 경도 누락" }];
  const cache = new Map<string, ReturnType<typeof calculateCoreExport>>();
  return { registry, hash: nodeSha256Adapter, fixtures, personas: profiles.map(item => ({ id: item.personaId, label: item.displayName })),
    selection(personaId: string) {
      const selected = profiles.find(item => item.personaId === personaId);
      if (!selected) throw new PersonaError("SELECTION_REJECTED");
      return { personaId: selected.personaId, personaVersion: selected.personaVersion };
    },
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
