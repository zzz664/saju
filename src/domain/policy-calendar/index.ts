import { CalculationPolicySchema } from "@/domain/input/schemas";
import { PINNED_CALENDAR_LIBRARY } from "@/domain/provenance";
import { z } from "zod";
import { CalendarPillarsSchema } from "@/domain/calendar";

export const PolicyPillarsRequestSchema = z
  .strictObject({
    instant: z.iso.datetime({ precision: 0 }),
    policyClock: z.iso.datetime({ local: true, precision: 3 }).length(23),
    dayBoundary: CalculationPolicySchema.unwrap().shape.dayBoundary,
  })
  .refine(
    (value) => {
      const ms = Date.parse(value.instant);
      const policyYear = Number(value.policyClock.slice(0, 4));
      if (!Number.isFinite(ms)) return false;
      const kstYear = new Date(ms + 9 * 3600000).getUTCFullYear();
      return kstYear >= 1800 && kstYear <= 2300 && policyYear >= 1800 && policyYear <= 2300;
    },
    { message: "Both SDK clock projections must be within Gregorian years 1800–2300." },
  )
  .readonly();

export const PolicyPillarsProvenanceSchema = z
  .strictObject({
    libraryName: z.literal(PINNED_CALENDAR_LIBRARY.name),
    libraryVersion: z.literal(PINNED_CALENDAR_LIBRARY.version),
    ruleId: z.literal("calendar.policy-pillars"),
    ruleVersion: z.literal("1.0.0"),
    yearMonthBasis: z.literal("absolute-utc"),
    dayHourBasis: z.literal("policy-clock"),
    sdkPrecision: z.literal("floor-minute"),
  })
  .readonly();

export const PolicyPillarsSnapshotSchema = z
  .strictObject({
    request: PolicyPillarsRequestSchema,
    pillars: CalendarPillarsSchema.readonly(),
    provenance: PolicyPillarsProvenanceSchema,
  })
  .readonly();
export type PolicyPillarsRequest = z.infer<typeof PolicyPillarsRequestSchema>;
export type PolicyPillarsSnapshot = z.infer<typeof PolicyPillarsSnapshotSchema>;
export interface PolicyCalendarAdapter {
  readonly calculate: (request: PolicyPillarsRequest) => PolicyPillarsSnapshot;
}
