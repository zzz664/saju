import { z } from "zod";

export const CoverageStatusSchema = z.enum(["complete", "partial", "unavailable"]);
export const TenGodSchema = z.enum([
  "비견",
  "겁재",
  "식신",
  "상관",
  "편재",
  "정재",
  "편관",
  "정관",
  "편인",
  "정인",
]);
export const HexDigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const TimeNormalizationReasonSchema = z.enum([
  "BIRTH_TIME_UNKNOWN",
  "CALENDAR_RANGE_UNSUPPORTED",
  "CALENDAR_INPUT_REJECTED",
  "TIME_RANGE_UNSUPPORTED",
  "TIMEZONE_INPUT_REJECTED",
]);
export const SolarTimeReasonSchema = z.enum([
  ...TimeNormalizationReasonSchema.options,
  "LONGITUDE_UNKNOWN",
]);
export const PolicyCalculationReasonSchema = z.enum([
  ...SolarTimeReasonSchema.options,
  "PILLAR_RANGE_UNSUPPORTED",
  "NO_RESOLVED_CANDIDATES",
]);
export const CalculationReasonSchema = z.enum([
  ...PolicyCalculationReasonSchema.options,
  "AMBIGUOUS_LOCAL_TIME",
  "NONEXISTENT_LOCAL_TIME",
]);
