import { z } from "zod";

const DateLabelSchema = z.string().length(10).regex(
  /^(?!0000)\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  "Use a calendar date in YYYY-MM-DD format (years 0001–9999).",
);

const ClockTimeSchema = z.string().length(5).regex(
  /^([01]\d|2[0-3]):[0-5]\d$/,
  "Use a local clock time in HH:mm format (00:00–23:59).",
);

export const BirthTimeSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("known"), time: ClockTimeSchema }),
  z.strictObject({ status: z.literal("unknown") }),
]).readonly();

function isTimezoneId(value: string): boolean {
  // Keep explicit region/area IDs (including IANA aliases), not abbreviations
  // such as PST or numeric offsets that newer Intl versions may also accept.
  if (value !== "UTC" && !value.includes("/")) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const TimezoneIdSchema = z.string().max(100).refine(isTimezoneId, {
  message: "Use an IANA area/location timezone identifier or UTC.",
});

function hasValidDay(input: { calendarType: "solar" | "lunar"; birthDate: string }): boolean {
  const [year, month, day] = input.birthDate.split("-").map(Number);
  // This is a structural bound only. The adapter must verify actual lunar
  // month length, leap-month existence and its supported year range later.
  if (input.calendarType === "lunar") return day <= 30;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (monthLengths[month - 1] ?? 0);
}

export const BirthInputSchema = z.strictObject({
  calendarType: z.enum(["solar", "lunar"]),
  birthDate: DateLabelSchema,
  isLeapMonth: z.boolean(),
  birthTime: BirthTimeSchema,
  timezoneId: TimezoneIdSchema,
  longitudeDeg: z.number().min(-180).max(180).nullable(),
  latitudeDeg: z.number().min(-90).max(90).nullable(),
  // This selects the traditional direction rule's input, not gender identity.
  directionBasis: z.enum(["male", "female", "unspecified"]),
}).refine(hasValidDay, {
  path: ["birthDate"],
  message: "The day is outside this calendar month's structural bounds.",
}).refine((input) => input.calendarType === "lunar" || !input.isLeapMonth, {
  path: ["isLeapMonth"],
  message: "A solar calendar date cannot be marked as a lunar leap month.",
}).readonly();

export const CalculationPolicySchema = z.strictObject({
  solarTime: z.enum(["standard", "mean-solar", "true-solar"]),
  dayBoundary: z.enum(["midnight", "zi-start"]),
  dstDisambiguation: z.enum(["reject", "earlier", "later"]),
}).readonly();

export const AnalysisInputSchema = z.strictObject({
  birthInput: BirthInputSchema,
  calculationPolicy: CalculationPolicySchema,
}).readonly();

export type BirthTime = z.infer<typeof BirthTimeSchema>;
export type BirthInput = z.infer<typeof BirthInputSchema>;
export type CalculationPolicy = z.infer<typeof CalculationPolicySchema>;
export type AnalysisInput = z.infer<typeof AnalysisInputSchema>;
