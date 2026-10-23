import { calculateFourPillars, type BirthInfo } from "manseryeok";
import packageInfo from "manseryeok/package.json";
import { CalendarAdapterError } from "@/domain/calendar";
import {
  PolicyPillarsRequestSchema,
  PolicyPillarsSnapshotSchema,
  type PolicyCalendarAdapter,
  type PolicyPillarsRequest,
} from "@/domain/policy-calendar";
import { SdkPillarsProjectionSchema } from "@/infrastructure/manseryeok/schemas";

function clockFields(ms: number): BirthInfo {
  const date = new Date(ms);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    isLunar: false,
    isLeapMonth: false,
  };
}

/** Project two explicit clocks through public SDK calls; never reuse shifted solar time for terms. */
export const manseryeokPolicyCalendarAdapter: PolicyCalendarAdapter = Object.freeze({
  calculate(value: PolicyPillarsRequest) {
    const request = PolicyPillarsRequestSchema.safeParse(value);
    if (!request.success) throw new CalendarAdapterError("INPUT_REJECTED");
    const { instant, policyClock, dayBoundary } = request.data;
    let utcRaw: unknown, policyRaw: unknown;
    try {
      // SDK input is fixed UTC+9. Dropping seconds floors each clock independently.
      utcRaw = calculateFourPillars({
        ...clockFields(Date.parse(instant) + 9 * 3600000),
        dayBoundary: "midnight",
      });
      policyRaw = calculateFourPillars({
        ...clockFields(Date.parse(policyClock + "Z")),
        dayBoundary: dayBoundary === "zi-start" ? "jasi" : "midnight",
      });
    } catch (error) {
      throw new CalendarAdapterError(
        error instanceof RangeError ? "INPUT_REJECTED" : "CALCULATION_FAILED",
      );
    }
    const absolute = SdkPillarsProjectionSchema.safeParse(utcRaw);
    const policy = SdkPillarsProjectionSchema.safeParse(policyRaw);
    if (!absolute.success || !policy.success) throw new CalendarAdapterError("OUTPUT_INVALID");
    const result = PolicyPillarsSnapshotSchema.safeParse({
      request: request.data,
      pillars: {
        year: absolute.data.year,
        month: absolute.data.month,
        day: policy.data.day,
        hour: policy.data.hour,
      },
      provenance: {
        libraryName: packageInfo.name,
        libraryVersion: packageInfo.version,
        ruleId: "calendar.policy-pillars",
        ruleVersion: "1.0.0",
        yearMonthBasis: "absolute-utc",
        dayHourBasis: "policy-clock",
        sdkPrecision: "floor-minute",
      },
    });
    if (!result.success) throw new CalendarAdapterError("OUTPUT_INVALID");
    return result.data;
  },
});
