import { z } from "zod";

export {
  CalendarConversionRequestSchema,
  CalendarConversionSnapshotSchema,
  type CalendarConversionRequest,
  type CalendarConversionSnapshot,
  type CalendarConversionAdapter,
} from "./conversion";

/** Current adapter contract: explicit fixed UTC+09:00, not general civil time. */
export const CalendarRequestSchema = z.strictObject({
  year: z.number().int().min(1800).max(2300),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
  calendarType: z.enum(["solar", "lunar"]),
  isLeapMonth: z.boolean(),
  timeReference: z.literal("fixed-utc+09:00"),
  dayBoundary: z.literal("midnight"),
}).refine((input) => input.calendarType !== "lunar" || input.year <= 2100, {
  path: ["year"], message: "The pinned lunar calculation API supports 1800–2100.",
}).refine((input) => input.calendarType !== "lunar" || input.day <= 30, {
  path: ["day"], message: "A lunar month has at most 30 days.",
}).refine((input) => input.calendarType === "lunar" || !input.isLeapMonth, {
  path: ["isLeapMonth"], message: "A solar date cannot be a lunar leap month.",
}).readonly();

const PillarSchema = z.strictObject({
  heavenlyStem: z.enum(["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"]),
  earthlyBranch: z.enum(["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"]),
}).readonly();

export const CalendarPillarsSchema = z.strictObject({
  year: PillarSchema, month: PillarSchema, day: PillarSchema, hour: PillarSchema,
});

export const CalendarSnapshotSchema = z.strictObject({
  pillars: CalendarPillarsSchema.readonly(),
  provenance: z.strictObject({
    libraryName: z.literal("manseryeok"),
    libraryVersion: z.literal("2.0.0"),
    timeReference: z.literal("fixed-utc+09:00"),
    dayBoundary: z.literal("midnight"),
  }).readonly(),
}).readonly();

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
