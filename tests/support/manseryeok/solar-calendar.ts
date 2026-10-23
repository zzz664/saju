import { getSolarTermsOfYear } from "manseryeok";
import packageInfo from "manseryeok/package.json";
import { z } from "zod";

import {
  CalendarAdapterError,
  SolarTermsRequestSchema,
  SolarTermsSnapshotSchema,
  YearMonthSnapshotSchema,
  type CalendarRequest,
  type SolarCalendarAdapter,
  type SolarTermsRequest,
} from "@/domain/calendar";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok/port";

const SdkTermsSchema = z
  .array(
    z.object({
      index: z.number().int(),
      name: z.string(),
      date: z.date(),
    }),
  )
  .length(24);

const provenance = {
  libraryName: packageInfo.name,
  libraryVersion: packageInfo.version,
  precision: "minute",
  ruleVersion: "1.0.0",
} as const;

export const manseryeokSolarCalendarAdapter: SolarCalendarAdapter = Object.freeze({
  getSolarTerms(value: SolarTermsRequest) {
    const request = SolarTermsRequestSchema.safeParse(value);
    if (!request.success) throw new CalendarAdapterError("INPUT_REJECTED");
    let raw: unknown;
    try {
      raw = getSolarTermsOfYear(request.data.year);
    } catch (error) {
      throw new CalendarAdapterError(
        error instanceof RangeError ? "INPUT_REJECTED" : "CALCULATION_FAILED",
      );
    }
    const terms = SdkTermsSchema.safeParse(raw);
    if (!terms.success) throw new CalendarAdapterError("OUTPUT_INVALID");
    const result = SolarTermsSnapshotSchema.safeParse({
      year: request.data.year,
      terms: terms.data.map((term) => ({
        index: term.index,
        name: term.name,
        startsAt: term.date.toISOString(),
        isMonthBoundary: term.index % 2 === 0,
      })),
      provenance: { ...provenance, ruleId: "calendar.solar-terms" },
    });
    if (!result.success) throw new CalendarAdapterError("OUTPUT_INVALID");
    return result.data;
  },
  calculateYearMonth(request: CalendarRequest) {
    // Reuse the pinned four-pillar calculation; do not implement another engine.
    const snapshot = manseryeokCalendarAdapter.calculate(request);
    const result = YearMonthSnapshotSchema.safeParse({
      pillars: { year: snapshot.pillars.year, month: snapshot.pillars.month },
      provenance: {
        ...provenance,
        timeReference: snapshot.provenance.timeReference,
        yearBoundary: "lichun",
        monthBoundary: "12-jeol",
        boundaryInclusion: "start-inclusive",
        ruleId: "calendar.year-month-pillars",
      },
    });
    if (!result.success) throw new CalendarAdapterError("OUTPUT_INVALID");
    return result.data;
  },
});
