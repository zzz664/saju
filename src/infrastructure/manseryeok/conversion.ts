import { lunarToSolar, solarToLunar } from "manseryeok";
import packageInfo from "manseryeok/package.json";

import {
  CalendarAdapterError,
  CalendarConversionRequestSchema,
  CalendarConversionSnapshotSchema,
  type CalendarConversionAdapter,
  type CalendarConversionSnapshot,
} from "@/domain/calendar";

function convert(value: unknown): CalendarConversionSnapshot {
  const parsed = CalendarConversionRequestSchema.safeParse(value);
  if (!parsed.success) throw new CalendarAdapterError("INPUT_REJECTED");
  const request = parsed.data;
  const date = { year: request.year, month: request.month, day: request.day };

  let solar: unknown;
  let lunar: unknown;
  try {
    if (request.calendarType === "solar") {
      solar = date;
      lunar = solarToLunar(date.year, date.month, date.day);
    } else {
      lunar = { ...date, isLeapMonth: request.isLeapMonth };
      solar = lunarToSolar(date.year, date.month, date.day, request.isLeapMonth);
    }
  } catch (error) {
    // Provider messages may contain birth dates. Never propagate the raw cause.
    throw new CalendarAdapterError(error instanceof RangeError ? "INPUT_REJECTED" : "CALCULATION_FAILED");
  }

  const result = CalendarConversionSnapshotSchema.safeParse({
    solar, lunar,
    provenance: {
      libraryName: packageInfo.name,
      libraryVersion: packageInfo.version,
      ruleId: "calendar.solar-lunar-conversion",
      ruleVersion: "1.0.0",
    },
  });
  if (!result.success) throw new CalendarAdapterError("OUTPUT_INVALID");
  return result.data;
}

export const manseryeokCalendarConversionAdapter: CalendarConversionAdapter = Object.freeze({ convert });
