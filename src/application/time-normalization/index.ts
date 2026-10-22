import { z } from "zod";

import { CalendarAdapterError, CalendarConversionRequestSchema, CalendarConversionSnapshotSchema, type CalendarConversionAdapter } from "../../domain/calendar/index";
import { AnalysisInputSchema, InputInformationSchema, getInputInformation } from "../../domain/input/index";
import { LocalTimeRequestSchema, ResolvedTimeSchema, RejectedTimeSchema, TimeZoneResultSchema, TimeZoneAdapterError, type TimeZoneAdapter } from "../../domain/timezone/index";

export interface TimeNormalizationDependencies {
  readonly timeZone: TimeZoneAdapter;
  readonly calendar: CalendarConversionAdapter;
}

export const TimeNormalizationResultSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("normalized"), time: ResolvedTimeSchema, information: InputInformationSchema }),
  z.strictObject({ status: z.literal("rejected"), time: RejectedTimeSchema, information: InputInformationSchema }),
  z.strictObject({
    status: z.literal("unavailable"),
    reasons: z.array(z.enum(["BIRTH_TIME_UNKNOWN", "CALENDAR_RANGE_UNSUPPORTED", "CALENDAR_INPUT_REJECTED", "TIME_RANGE_UNSUPPORTED", "TIMEZONE_INPUT_REJECTED"])).min(1).readonly(),
    information: InputInformationSchema,
  }),
]).readonly();

export type TimeNormalizationResult = z.infer<typeof TimeNormalizationResultSchema>;

/** Civil-time normalization only. Solar-time and day-boundary policy are later stages. */
export function normalizeBirthTime(value: unknown, dependencies: TimeNormalizationDependencies): TimeNormalizationResult {
  const input = AnalysisInputSchema.parse(value);
  const { birthInput, calculationPolicy } = input;
  const information = getInputInformation(input);
  const unavailable = (reason: "BIRTH_TIME_UNKNOWN" | "CALENDAR_RANGE_UNSUPPORTED" | "CALENDAR_INPUT_REJECTED" | "TIME_RANGE_UNSUPPORTED" | "TIMEZONE_INPUT_REJECTED") =>
    TimeNormalizationResultSchema.parse({ status: "unavailable", reasons: [reason], information });
  if (birthInput.birthTime.status === "unknown") return unavailable("BIRTH_TIME_UNKNOWN");

  let solarDate = birthInput.birthDate;
  if (birthInput.calendarType === "lunar") {
    const [year, month, day] = birthInput.birthDate.split("-").map(Number);
    const request = CalendarConversionRequestSchema.safeParse({ year, month, day, calendarType: "lunar", isLeapMonth: birthInput.isLeapMonth });
    if (!request.success) return unavailable("CALENDAR_RANGE_UNSUPPORTED");
    let raw: unknown;
    try { raw = dependencies.calendar.convert(request.data); }
    catch (error) {
      if (error instanceof CalendarAdapterError && error.code === "INPUT_REJECTED") return unavailable("CALENDAR_INPUT_REJECTED");
      throw new TimeZoneAdapterError("RESOLUTION_FAILED");
    }
    const dates = CalendarConversionSnapshotSchema.safeParse(raw);
    if (!dates.success || dates.data.lunar.year !== year || dates.data.lunar.month !== month
      || dates.data.lunar.day !== day || dates.data.lunar.isLeapMonth !== birthInput.isLeapMonth) throw new TimeZoneAdapterError("OUTPUT_INVALID");
    const date = dates.data.solar;
    solarDate = `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  }

  const request = LocalTimeRequestSchema.safeParse({
    localDateTime: `${solarDate}T${birthInput.birthTime.time}`,
    timezoneId: birthInput.timezoneId, disambiguation: calculationPolicy.dstDisambiguation,
  });
  if (!request.success) return unavailable("TIME_RANGE_UNSUPPORTED");
  let raw: unknown;
  try { raw = dependencies.timeZone.resolve(request.data); }
  catch (error) {
    if (error instanceof TimeZoneAdapterError && error.code === "INPUT_REJECTED") return unavailable("TIMEZONE_INPUT_REJECTED");
    throw new TimeZoneAdapterError("RESOLUTION_FAILED");
  }
  const result = TimeZoneResultSchema.safeParse(raw);
  if (!result.success || result.data.request.localDateTime !== request.data.localDateTime
    || result.data.request.timezoneId !== request.data.timezoneId
    || result.data.request.disambiguation !== request.data.disambiguation) throw new TimeZoneAdapterError("OUTPUT_INVALID");
  return TimeNormalizationResultSchema.parse({ status: result.data.status === "resolved" ? "normalized" : "rejected", time: result.data, information });
}
