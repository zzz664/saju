import { z } from "zod";

import {
  CalendarAdapterError,
  CalendarRequestSchema,
  CalendarSnapshotSchema,
  type CalendarAdapter,
} from "@/domain/calendar";
import { AnalysisInputSchema, InputInformationSchema, getInputInformation } from "@/domain/input";

const UnsupportedReasonSchema = z.enum([
  "BIRTH_TIME_UNKNOWN",
  "TIMEZONE_UNSUPPORTED",
  "SOLAR_TIME_UNSUPPORTED",
  "DAY_BOUNDARY_UNSUPPORTED",
  "DST_POLICY_UNSUPPORTED",
  "CALENDAR_RANGE_UNSUPPORTED",
  "CALENDAR_INPUT_REJECTED",
]);

export const CalculationResultSchema = z
  .discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("calculated"),
      snapshot: CalendarSnapshotSchema,
      information: InputInformationSchema,
    }),
    z.strictObject({
      status: z.literal("unavailable"),
      reasons: z.array(UnsupportedReasonSchema).min(1).readonly(),
      information: InputInformationSchema,
    }),
  ])
  .readonly();

export type CalculationResult = z.infer<typeof CalculationResultSchema>;

/** @deprecated Fixed UTC+9 CLI compatibility. New entry points use calculatePolicySaju. */
export function calculateSajuSnapshot(value: unknown, adapter: CalendarAdapter): CalculationResult {
  const input = AnalysisInputSchema.parse(value);
  const { birthInput, calculationPolicy } = input;
  const { birthTime } = birthInput;
  const information = getInputInformation(input);
  const reasons: z.infer<typeof UnsupportedReasonSchema>[] = [];
  const unavailable = (items: typeof reasons): CalculationResult =>
    CalculationResultSchema.parse({ status: "unavailable", reasons: items, information });

  if (birthTime.status === "unknown") reasons.push("BIRTH_TIME_UNKNOWN");
  // IANA Etc/GMT signs are reversed: -9 is explicit fixed UTC+09:00.
  // This legacy port keeps its fixed-clock contract. General clock policies and
  // unknown-time possibilities are available through application/policy-saju.
  if (birthInput.timezoneId !== "Etc/GMT-9") reasons.push("TIMEZONE_UNSUPPORTED");
  if (calculationPolicy.solarTime !== "standard") reasons.push("SOLAR_TIME_UNSUPPORTED");
  if (calculationPolicy.dayBoundary !== "midnight") reasons.push("DAY_BOUNDARY_UNSUPPORTED");
  if (calculationPolicy.dstDisambiguation !== "reject") reasons.push("DST_POLICY_UNSUPPORTED");
  if (reasons.length > 0 || birthTime.status === "unknown") return unavailable(reasons);

  const [year, month, day] = birthInput.birthDate.split("-").map(Number);
  const [hour, minute] = birthTime.time.split(":").map(Number);
  const request = CalendarRequestSchema.safeParse({
    year,
    month,
    day,
    hour,
    minute,
    calendarType: birthInput.calendarType,
    isLeapMonth: birthInput.isLeapMonth,
    timeReference: "fixed-utc+09:00",
    dayBoundary: calculationPolicy.dayBoundary,
  });
  if (!request.success) return unavailable(["CALENDAR_RANGE_UNSUPPORTED"]);

  let raw: unknown;
  try {
    raw = adapter.calculate(request.data);
  } catch (error) {
    if (error instanceof CalendarAdapterError && error.code === "INPUT_REJECTED") {
      return unavailable(["CALENDAR_INPUT_REJECTED"]);
    }
    throw new CalendarAdapterError("CALCULATION_FAILED");
  }
  const snapshot = CalendarSnapshotSchema.safeParse(raw);
  if (!snapshot.success) throw new CalendarAdapterError("OUTPUT_INVALID");
  return CalculationResultSchema.parse({
    status: "calculated",
    snapshot: snapshot.data,
    information,
  });
}
