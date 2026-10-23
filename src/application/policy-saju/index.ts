import { deepEqualCanonical } from "@/domain/json";
import { PolicyCalculationReasonSchema } from "@/domain/contracts";

import { z } from "zod";
import { CalendarAdapterError, CalendarPillarsSchema } from "@/domain/calendar";
import {
  AnalysisInputSchema,
  BirthInputSchema,
  CalculationPolicySchema,
  InputInformationSchema,
  TimezoneIdSchema,
  getInputInformation,
  type AnalysisInput,
} from "@/domain/input";
import {
  PolicyPillarsRequestSchema,
  PolicyPillarsSnapshotSchema,
  PolicyPillarsProvenanceSchema,
  type PolicyCalendarAdapter,
} from "@/domain/policy-calendar";
import { ResolvedTimeSchema } from "@/domain/timezone";
import { SolarTimeSnapshotSchema } from "@/domain/solar-time";
import {
  prepareParsedBirthTime,
  PreparedBirthTimeSchema,
  type SolarTimeDependencies,
} from "@/application/solar-time";

export interface PolicySajuDependencies extends SolarTimeDependencies {
  readonly pillars: PolicyCalendarAdapter;
}

const ReasonSchema = PolicyCalculationReasonSchema;
const interval = {
  startMinute: z.number().int().min(0).max(1439),
  endMinuteExclusive: z.number().int().min(1).max(1440),
};
const CandidateSchema = z
  .discriminatedUnion("status", [
    z.strictObject({
      ...interval,
      status: z.literal("possible"),
      pillars: CalendarPillarsSchema.readonly(),
    }),
    z.strictObject({
      ...interval,
      status: z.literal("rejected"),
      reason: z.enum(["AMBIGUOUS_LOCAL_TIME", "NONEXISTENT_LOCAL_TIME"]),
    }),
    z.strictObject({
      ...interval,
      status: z.literal("unavailable"),
      reasons: z.array(ReasonSchema).min(1).readonly(),
    }),
  ])
  .refine((value) => value.startMinute < value.endMinuteExclusive)
  .readonly();
export type TimeCandidate = z.infer<typeof CandidateSchema>;

function commonPillars(candidates: readonly TimeCandidate[]) {
  type Pillar = z.infer<typeof CalendarPillarsSchema>["year"];
  const common: { year: Pillar | null; month: Pillar | null; day: Pillar | null; hour: null } = {
    year: null,
    month: null,
    day: null,
    hour: null,
  };
  const first = candidates[0];
  if (
    first?.status !== "possible" ||
    candidates.some((candidate) => candidate.status !== "possible")
  )
    return common;
  for (const key of ["year", "month", "day"] as const) {
    if (
      candidates.every(
        (candidate) =>
          candidate.status === "possible" &&
          candidate.pillars[key].heavenlyStem === first.pillars[key].heavenlyStem &&
          candidate.pillars[key].earthlyBranch === first.pillars[key].earthlyBranch,
      )
    )
      common[key] = first.pillars[key];
  }
  return common;
}

export const PolicyCalculationResultSchema = z
  .discriminatedUnion("status", [
    z
      .strictObject({
        status: z.literal("calculated"),
        snapshot: PolicyPillarsSnapshotSchema,
        time: ResolvedTimeSchema,
        solarTime: SolarTimeSnapshotSchema,
        information: InputInformationSchema,
      })
      .refine(
        (value) =>
          value.snapshot.request.instant === value.time.resolved.instant &&
          value.solarTime.instant === value.time.resolved.instant &&
          value.solarTime.civilClock === value.time.resolved.localDateTime &&
          value.solarTime.civilOffsetSeconds === value.time.resolved.offsetSeconds &&
          value.snapshot.request.policyClock === value.solarTime.policyClock,
      ),
    z
      .strictObject({
        status: z.literal("partial"),
        candidates: z.array(CandidateSchema).min(1).max(1440).readonly(),
        confirmedPillars: z
          .strictObject({
            year: CalendarPillarsSchema.shape.year.nullable(),
            month: CalendarPillarsSchema.shape.month.nullable(),
            day: CalendarPillarsSchema.shape.day.nullable(),
            hour: z.null(),
          })
          .readonly(),
        information: InputInformationSchema,
        context: z
          .strictObject({
            birthDate: BirthInputSchema.unwrap().shape.birthDate,
            calendarType: z.enum(["solar", "lunar"]),
            isLeapMonth: z.boolean(),
            birthTime: z.literal("unknown"),
            timezoneId: TimezoneIdSchema,
            policy: CalculationPolicySchema,
          })
          .readonly(),
        provenance: z
          .strictObject({
            ruleId: z.literal("calendar.unknown-time-candidates"),
            ruleVersion: z.literal("1.0.0"),
            basis: z.literal("all-1440-input-civil-minutes"),
            library: PolicyPillarsProvenanceSchema,
            normalization: ResolvedTimeSchema.unwrap().shape.provenance,
          })
          .readonly(),
      })
      .refine(
        (value) =>
          value.candidates[0]?.startMinute === 0 &&
          value.candidates[value.candidates.length - 1]?.endMinuteExclusive === 1440 &&
          value.candidates.every(
            (candidate, index, candidates) =>
              index === 0 || candidates[index - 1].endMinuteExclusive === candidate.startMinute,
          ) &&
          value.candidates.some((candidate) => candidate.status === "possible") &&
          value.information.unknownFields.includes("birthTime") &&
          deepEqualCanonical(value.confirmedPillars, commonPillars(value.candidates)),
      ),
    PreparedBirthTimeSchema.unwrap().options[1],
    z.strictObject({
      status: z.literal("unavailable"),
      reasons: z.array(ReasonSchema).min(1).readonly(),
      information: InputInformationSchema,
    }),
  ])
  .readonly();
export type PolicyCalculationResult = z.infer<typeof PolicyCalculationResultSchema>;

function unavailable(
  input: AnalysisInput,
  reasons: z.infer<typeof ReasonSchema>[],
): PolicyCalculationResult {
  return PolicyCalculationResultSchema.parse({
    status: "unavailable",
    reasons,
    information: getInputInformation(input),
  });
}

function known(
  input: AnalysisInput,
  dependencies: PolicySajuDependencies,
): PolicyCalculationResult {
  const prepared = prepareParsedBirthTime(input, dependencies);
  if (prepared.status !== "normalized") return PolicyCalculationResultSchema.parse(prepared);
  const request = PolicyPillarsRequestSchema.safeParse({
    instant: prepared.solarTime.instant,
    policyClock: prepared.solarTime.policyClock,
    dayBoundary: input.calculationPolicy.dayBoundary,
  });
  if (!request.success) return unavailable(input, ["PILLAR_RANGE_UNSUPPORTED"]);
  let raw: unknown;
  try {
    raw = dependencies.pillars.calculate(request.data);
  } catch (error) {
    if (error instanceof CalendarAdapterError && error.code === "INPUT_REJECTED")
      return unavailable(input, ["CALENDAR_INPUT_REJECTED"]);
    throw new CalendarAdapterError(
      error instanceof CalendarAdapterError ? error.code : "CALCULATION_FAILED",
    );
  }
  const snapshot = PolicyPillarsSnapshotSchema.safeParse(raw);
  if (!snapshot.success || !deepEqualCanonical(snapshot.data.request, request.data))
    throw new CalendarAdapterError("OUTPUT_INVALID");
  return Object.freeze({
    status: "calculated",
    snapshot: snapshot.data,
    time: prepared.time,
    solarTime: prepared.solarTime,
    information: prepared.information,
  });
}

/** Exhaust the input's minute-resolution domain; no hypothetical clock becomes an observed birth time. */
export function calculatePolicySaju(
  value: unknown,
  dependencies: PolicySajuDependencies,
): PolicyCalculationResult {
  const input = AnalysisInputSchema.parse(value);
  if (input.calculationPolicy.solarTime !== "standard" && input.birthInput.longitudeDeg === null)
    return unavailable(input, ["LONGITUDE_UNKNOWN"]);
  if (input.birthInput.birthTime.status === "known") return known(input, dependencies);

  // Every hypothetical minute uses the same lunar date; memoize just its conversion, including failure.
  let conversion:
    | { value: ReturnType<SolarTimeDependencies["calendar"]["convert"]> }
    | { error: unknown }
    | undefined;
  const candidateDependencies: PolicySajuDependencies = {
    ...dependencies,
    timeZone: dependencies.timeZone.scopeForCandidates?.() ?? dependencies.timeZone,
    pillars: dependencies.pillars.scopeForCandidates?.() ?? dependencies.pillars,
    calendar: {
      convert(request) {
        if (!conversion) {
          try {
            conversion = { value: dependencies.calendar.convert(request) };
          } catch (error) {
            conversion = { error };
          }
        }
        if ("error" in conversion) throw conversion.error;
        return conversion.value;
      },
    },
  };
  const candidates: TimeCandidate[] = [];
  let previousKey: string | undefined;
  let first: Extract<PolicyCalculationResult, { status: "calculated" }> | undefined;
  for (let minute = 0; minute < 1440; minute++) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
    const result = known(
      { ...input, birthInput: { ...input.birthInput, birthTime: { status: "known", time } } },
      candidateDependencies,
    );
    if (result.status === "partial") throw new CalendarAdapterError("OUTPUT_INVALID");
    if (result.status === "calculated") {
      if (first && !deepEqualCanonical(first.time.provenance, result.time.provenance))
        throw new CalendarAdapterError("OUTPUT_INVALID");
      first ??= result;
    }
    const payload =
      result.status === "calculated"
        ? { status: "possible" as const, pillars: result.snapshot.pillars }
        : result.status === "rejected"
          ? { status: "rejected" as const, reason: result.time.reason }
          : { status: "unavailable" as const, reasons: result.reasons };
    const key = JSON.stringify(payload);
    if (key === previousKey)
      candidates[candidates.length - 1] = {
        ...candidates[candidates.length - 1],
        endMinuteExclusive: minute + 1,
      };
    else candidates.push({ ...payload, startMinute: minute, endMinuteExclusive: minute + 1 });
    previousKey = key;
  }
  if (!first) {
    const reasons = [
      ...new Set(
        candidates.flatMap((candidate) =>
          candidate.status === "unavailable" ? [...candidate.reasons] : [],
        ),
      ),
    ];
    return unavailable(input, reasons.length ? reasons : ["NO_RESOLVED_CANDIDATES"]);
  }
  return PolicyCalculationResultSchema.parse({
    status: "partial",
    candidates,
    confirmedPillars: commonPillars(candidates),
    information: getInputInformation(input),
    context: {
      birthDate: input.birthInput.birthDate,
      calendarType: input.birthInput.calendarType,
      isLeapMonth: input.birthInput.isLeapMonth,
      birthTime: "unknown",
      timezoneId: input.birthInput.timezoneId,
      policy: input.calculationPolicy,
    },
    provenance: {
      ruleId: "calendar.unknown-time-candidates",
      ruleVersion: "1.0.0",
      basis: "all-1440-input-civil-minutes",
      library: first.snapshot.provenance,
      normalization: first.time.provenance,
    },
  });
}
