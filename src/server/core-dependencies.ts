import type { NatalFactsDependencies } from "@/application/natal-facts";
import {
  manseryeokCalendarConversionAdapter,
  manseryeokEquationOfTimeAdapter,
  manseryeokPolicyCalendarAdapter,
  manseryeokSymbolCatalogAdapter,
} from "@/infrastructure/manseryeok";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";

/** CLI, local analysis and API-test share the same adapter composition. */
export function createCoreDependencies(): NatalFactsDependencies {
  return Object.freeze({
    timeZone: temporalTimeZoneAdapter,
    calendar: manseryeokCalendarConversionAdapter,
    equationOfTime: manseryeokEquationOfTimeAdapter,
    pillars: manseryeokPolicyCalendarAdapter,
    symbols: manseryeokSymbolCatalogAdapter,
  });
}
