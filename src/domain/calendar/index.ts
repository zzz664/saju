import { z } from "zod";

export {
  CalendarConversionRequestSchema,
  CalendarConversionSnapshotSchema,
  type CalendarConversionRequest,
  type CalendarConversionSnapshot,
  type CalendarConversionAdapter,
} from "@/domain/calendar/conversion";

/** Current adapter contract: explicit fixed UTC+09:00, not general civil time. */
export const CalendarRequestSchema = z
  .strictObject({
    year: z.number().int().min(1800).max(2300),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    calendarType: z.enum(["solar", "lunar"]),
    isLeapMonth: z.boolean(),
    timeReference: z.literal("fixed-utc+09:00"),
    dayBoundary: z.literal("midnight"),
  })
  .refine((input) => input.calendarType !== "lunar" || input.year <= 2100, {
    path: ["year"],
    message: "The pinned lunar calculation API supports 1800–2100.",
  })
  .refine((input) => input.calendarType !== "lunar" || input.day <= 30, {
    path: ["day"],
    message: "A lunar month has at most 30 days.",
  })
  .refine((input) => input.calendarType === "lunar" || !input.isLeapMonth, {
    path: ["isLeapMonth"],
    message: "A solar date cannot be a lunar leap month.",
  })
  .readonly();

const PillarSchema = z
  .strictObject({
    heavenlyStem: z.enum(["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"]),
    earthlyBranch: z.enum(["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"]),
  })
  .readonly();

export const CalendarPillarsSchema = z.strictObject({
  year: PillarSchema,
  month: PillarSchema,
  day: PillarSchema,
  hour: PillarSchema,
});

export const CalendarSnapshotSchema = z
  .strictObject({
    pillars: CalendarPillarsSchema.readonly(),
    provenance: z
      .strictObject({
        libraryName: z.literal("manseryeok"),
        libraryVersion: z.literal("2.0.0"),
        timeReference: z.literal("fixed-utc+09:00"),
        dayBoundary: z.literal("midnight"),
      })
      .readonly(),
  })
  .readonly();

export type CalendarRequest = z.infer<typeof CalendarRequestSchema>;
export type CalendarSnapshot = z.infer<typeof CalendarSnapshotSchema>;

/** No Next.js, Node I/O, infrastructure imports or supplier SDK types. */
export interface CalendarAdapter {
  readonly calculate: (request: CalendarRequest) => CalendarSnapshot;
}

const errorMessages = {
  INPUT_REJECTED: "Calendar input was rejected.",
  CALCULATION_FAILED: "Calendar calculation failed.",
  OUTPUT_INVALID: "Calendar adapter returned invalid output.",
} as const;

export class CalendarAdapterError extends Error {
  constructor(readonly code: keyof typeof errorMessages) {
    super(errorMessages[code]);
    this.name = "CalendarAdapterError";
  }
}

const solarTermNames = [
  "소한",
  "대한",
  "입춘",
  "우수",
  "경칩",
  "춘분",
  "청명",
  "곡우",
  "입하",
  "소만",
  "망종",
  "하지",
  "소서",
  "대서",
  "입추",
  "처서",
  "백로",
  "추분",
  "한로",
  "상강",
  "입동",
  "소설",
  "대설",
  "동지",
] as const;

const SolarTermYearSchema = z.number().int().min(1800).max(2300);
export const SolarTermsRequestSchema = z.strictObject({ year: SolarTermYearSchema }).readonly();

const solarProvenance = {
  libraryName: z.literal("manseryeok"),
  libraryVersion: z.literal("2.0.0"),
  precision: z.literal("minute"),
  ruleVersion: z.literal("1.0.0"),
};

const SolarTermSchema = z
  .strictObject({
    index: z.number().int().min(0).max(23),
    name: z.enum(solarTermNames),
    startsAt: z.iso.datetime({ precision: 3 }).refine((value) => value.endsWith(":00.000Z"), {
      message: "Solar term timestamps must have minute resolution in UTC.",
    }),
    isMonthBoundary: z.boolean(),
  })
  .readonly();

export const SolarTermsSnapshotSchema = z
  .strictObject({
    year: SolarTermYearSchema,
    terms: z.array(SolarTermSchema).length(24).readonly(),
    provenance: z
      .strictObject({ ...solarProvenance, ruleId: z.literal("calendar.solar-terms") })
      .readonly(),
  })
  .refine(
    (snapshot) =>
      snapshot.terms.every(
        (term, index, terms) =>
          term.index === index &&
          term.name === solarTermNames[index] &&
          term.isMonthBoundary === (index % 2 === 0) &&
          new Date(term.startsAt).getUTCFullYear() === snapshot.year &&
          (index === 0 || terms[index - 1].startsAt < term.startsAt),
      ),
    {
      path: ["terms"],
      message: "Expected the requested year's ordered 24 solar terms and twelve jeol boundaries.",
    },
  )
  .readonly();

export const YearMonthSnapshotSchema = z
  .strictObject({
    pillars: z.strictObject({ year: PillarSchema, month: PillarSchema }).readonly(),
    provenance: z
      .strictObject({
        ...solarProvenance,
        timeReference: z.literal("fixed-utc+09:00"),
        yearBoundary: z.literal("lichun"),
        monthBoundary: z.literal("12-jeol"),
        boundaryInclusion: z.literal("start-inclusive"),
        ruleId: z.literal("calendar.year-month-pillars"),
      })
      .readonly(),
  })
  .readonly();

export type SolarTermsRequest = z.infer<typeof SolarTermsRequestSchema>;
export type SolarTermsSnapshot = z.infer<typeof SolarTermsSnapshotSchema>;
export type YearMonthSnapshot = z.infer<typeof YearMonthSnapshotSchema>;

/** UTC term instants; pillar requests use the existing explicit fixed UTC+9 clock. */
export interface SolarCalendarAdapter {
  readonly getSolarTerms: (request: SolarTermsRequest) => SolarTermsSnapshot;
  readonly calculateYearMonth: (request: CalendarRequest) => YearMonthSnapshot;
}

export const DaySnapshotSchema = z
  .strictObject({
    pillars: z.strictObject({ day: PillarSchema }).readonly(),
    provenance: z
      .strictObject({
        libraryName: z.literal("manseryeok"),
        libraryVersion: z.literal("2.0.0"),
        timeReference: z.literal("fixed-utc+09:00"),
        dayBoundary: z.literal("midnight"),
        ruleId: z.literal("calendar.day-pillar"),
        ruleVersion: z.literal("1.0.0"),
      })
      .readonly(),
  })
  .readonly();

export type DaySnapshot = z.infer<typeof DaySnapshotSchema>;

/** A known fixed-UTC+9 clock under the explicit midnight policy, not general civil time. */
export interface DayCalendarAdapter {
  readonly calculateDay: (request: CalendarRequest) => DaySnapshot;
}
