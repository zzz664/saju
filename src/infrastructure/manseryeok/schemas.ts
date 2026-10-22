import { z } from "zod";

/** Package-level request; these clock fields are explicitly fixed UTC+09:00. */
export const ManseryeokRequestSchema = z.strictObject({
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

const pillarShape = {
  year: PillarSchema, month: PillarSchema, day: PillarSchema, hour: PillarSchema,
};

// Only the four data fields are projected from the richer upstream SDK object.
export const SdkPillarsProjectionSchema = z.object(pillarShape).readonly();

export const ManseryeokSnapshotSchema = z.strictObject({
  pillars: z.strictObject(pillarShape).readonly(),
  provenance: z.strictObject({
    libraryName: z.literal("manseryeok"),
    libraryVersion: z.literal("2.0.0"),
    timeReference: z.literal("fixed-utc+09:00"),
    dayBoundary: z.literal("midnight"),
  }).readonly(),
}).readonly();

export type ManseryeokRequest = z.infer<typeof ManseryeokRequestSchema>;
export type ManseryeokSnapshot = z.infer<typeof ManseryeokSnapshotSchema>;
