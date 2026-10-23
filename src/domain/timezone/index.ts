import { CalculationPolicySchema } from "@/domain/input/schemas";
import { defineCodedError } from "@/domain/utilities";
import { z } from "zod";
import { TimezoneIdSchema } from "@/domain/input/schemas";

export const LocalTimeRequestSchema = z
  .strictObject({
    localDateTime: z.iso
      .datetime({ local: true, precision: -1 })
      .length(16)
      .refine(
        (value) => {
          const year = Number(value.slice(0, 4));
          return year >= 1800 && year <= 2300;
        },
        { message: "Local time normalization supports Gregorian years 1800–2300." },
      ),
    timezoneId: TimezoneIdSchema,
    disambiguation: CalculationPolicySchema.unwrap().shape.dstDisambiguation,
  })
  .readonly();

const ProvenanceSchema = z
  .strictObject({
    engineName: z.literal("@js-temporal/polyfill"),
    engineVersion: z.literal("0.5.1"),
    icuVersion: z.string().min(1).max(100),
    tzdbVersion: z.string().min(1).max(100),
    ruleId: z.literal("time.local-to-instant"),
    ruleVersion: z.literal("1.0.0"),
  })
  .readonly();

export const ResolvedTimeSchema = z
  .strictObject({
    status: z.literal("resolved"),
    kind: z.enum(["unique", "fold", "gap"]),
    request: LocalTimeRequestSchema,
    resolved: z
      .strictObject({
        instant: z.iso.datetime({ precision: 0 }),
        localDateTime: z.iso.datetime({ local: true, precision: 0 }).length(19),
        offsetSeconds: z.number().int().min(-86400).max(86400),
      })
      .readonly(),
    provenance: ProvenanceSchema,
  })
  .refine(
    (value) => {
      const { request, resolved, kind } = value;
      const localMs = Date.parse(resolved.instant) + resolved.offsetSeconds * 1000;
      if (!Number.isFinite(localMs)) return false;
      const local = new Date(localMs).toISOString().slice(0, 19);
      if (local !== resolved.localDateTime) return false;
      if (kind !== "gap")
        return (
          resolved.localDateTime === request.localDateTime + ":00" &&
          (kind === "unique" || request.disambiguation !== "reject")
        );
      return request.disambiguation === "earlier"
        ? resolved.localDateTime < request.localDateTime + ":00"
        : request.disambiguation === "later" &&
            resolved.localDateTime > request.localDateTime + ":00";
    },
    { message: "Resolved clock, UTC offset and explicit policy must agree." },
  )
  .readonly();

export const RejectedTimeSchema = z
  .strictObject({
    status: z.literal("rejected"),
    kind: z.enum(["fold", "gap"]),
    request: LocalTimeRequestSchema,
    reason: z.enum(["AMBIGUOUS_LOCAL_TIME", "NONEXISTENT_LOCAL_TIME"]),
    provenance: ProvenanceSchema,
  })
  .refine(
    (value) =>
      value.request.disambiguation === "reject" &&
      value.reason === (value.kind === "fold" ? "AMBIGUOUS_LOCAL_TIME" : "NONEXISTENT_LOCAL_TIME"),
    {
      message: "A rejected fold/gap must use the explicit reject policy and corresponding reason.",
    },
  )
  .readonly();

export const TimeZoneResultSchema = z.discriminatedUnion("status", [
  ResolvedTimeSchema,
  RejectedTimeSchema,
]);
export type LocalTimeRequest = z.infer<typeof LocalTimeRequestSchema>;
export type TimeZoneResult = z.infer<typeof TimeZoneResultSchema>;

export interface TimeZoneAdapter {
  readonly resolve: (request: LocalTimeRequest) => TimeZoneResult;
  /** Optional request-local resolver; must preserve every civil minute, fold and gap. */
  readonly scopeForCandidates?: () => TimeZoneAdapter;
}

const messages = {
  INPUT_REJECTED: "Local time input was rejected.",
  RESOLUTION_FAILED: "Local time resolution failed.",
  OUTPUT_INVALID: "Time zone adapter returned invalid output.",
} as const;

export class TimeZoneAdapterError extends defineCodedError("TimeZoneAdapterError", messages) {}
