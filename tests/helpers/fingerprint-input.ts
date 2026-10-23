import {
  manseryeokCalendarConversionAdapter,
  manseryeokEquationOfTimeAdapter,
  manseryeokPolicyCalendarAdapter,
  manseryeokSymbolCatalogAdapter,
} from "@/infrastructure/manseryeok";
import { temporalTimeZoneAdapter } from "@/infrastructure/timezone";

// Synthetic test data; never import the user's editable CLI example for hash goldens.
export const fingerprintInput = {
  birthInput: {
    calendarType: "solar",
    birthDate: "2024-02-10",
    isLeapMonth: false,
    birthTime: { status: "known", time: "05:30" },
    timezoneId: "Asia/Seoul",
    longitudeDeg: null,
    latitudeDeg: null,
    directionBasis: "unspecified",
  },
  calculationPolicy: {
    solarTime: "standard",
    dayBoundary: "midnight",
    dstDisambiguation: "reject",
  },
} as const;
export const fingerprintDependencies = {
  timeZone: temporalTimeZoneAdapter,
  calendar: manseryeokCalendarConversionAdapter,
  equationOfTime: manseryeokEquationOfTimeAdapter,
  pillars: manseryeokPolicyCalendarAdapter,
  symbols: manseryeokSymbolCatalogAdapter,
};
