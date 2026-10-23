import { PINNED_CALENDAR_LIBRARY } from "@/domain/provenance";
import { isGregorianDate } from "@/domain/utilities";
import { z } from "zod";

const dateFields = {
  year: z.number().int().min(1391).max(2101),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
};

/** Gregorian structure only; lunar month lengths belong to the calendar provider. */

const SolarDateSchema = z
  .strictObject(dateFields)
  .refine(isGregorianDate, {
    path: ["day"],
    message: "A real Gregorian date is required.",
  })
  .readonly();

const lunarFields = {
  ...dateFields,
  year: z.number().int().min(1391).max(2100),
  day: z.number().int().min(1).max(30),
  isLeapMonth: z.boolean(),
};

const LunarDateSchema = z.strictObject(lunarFields).readonly();

/** The provider validates the exact solar interval and real lunar dates. */
export const CalendarConversionRequestSchema = z
  .discriminatedUnion("calendarType", [
    z
      .strictObject({
        ...dateFields,
        calendarType: z.literal("solar"),
        isLeapMonth: z.literal(false),
      })
      .refine(isGregorianDate, {
        path: ["day"],
        message: "A real Gregorian date is required.",
      }),
    z.strictObject({ ...lunarFields, calendarType: z.literal("lunar") }),
  ])
  .readonly();

export const CalendarConversionSnapshotSchema = z
  .strictObject({
    solar: SolarDateSchema,
    lunar: LunarDateSchema,
    provenance: z
      .strictObject({
        libraryName: z.literal(PINNED_CALENDAR_LIBRARY.name),
        libraryVersion: z.literal(PINNED_CALENDAR_LIBRARY.version),
        ruleId: z.literal("calendar.solar-lunar-conversion"),
        ruleVersion: z.literal("1.0.0"),
      })
      .readonly(),
  })
  .readonly();

export type CalendarConversionRequest = z.infer<typeof CalendarConversionRequestSchema>;
export type CalendarConversionSnapshot = z.infer<typeof CalendarConversionSnapshotSchema>;

/** Date conversion is independent of the four-pillar/time-normalization port. */
export interface CalendarConversionAdapter {
  readonly convert: (request: CalendarConversionRequest) => CalendarConversionSnapshot;
}
