import { z } from "zod";
import { ResolvedTimeSchema } from "@/domain/timezone";

export const EquationOfTimeRequestSchema = z
  .strictObject({
    instant: z.iso.datetime({ precision: 0 }).refine((value) => {
      const year = Number(value.slice(0, 4));
      return year >= 1799 && year <= 2301;
    }),
  })
  .readonly();

export const EquationOfTimeSnapshotSchema = z
  .strictObject({
    instant: EquationOfTimeRequestSchema.unwrap().shape.instant,
    minutes: z.number().min(-30).max(30),
    provenance: z
      .strictObject({
        libraryName: z.literal("manseryeok"),
        libraryVersion: z.literal("2.0.0"),
        model: z.literal("meeus-28.3"),
        convention: z.literal("apparent-minus-mean"),
        ruleId: z.literal("astro.equation-of-time"),
        ruleVersion: z.literal("1.0.0"),
      })
      .readonly(),
  })
  .readonly();

export type EquationOfTimeRequest = z.infer<typeof EquationOfTimeRequestSchema>;
export type EquationOfTimeSnapshot = z.infer<typeof EquationOfTimeSnapshotSchema>;
export interface EquationOfTimeAdapter {
  readonly calculate: (request: EquationOfTimeRequest) => EquationOfTimeSnapshot;
}

export const SolarTimeRequestSchema = z
  .strictObject({
    time: ResolvedTimeSchema,
    mode: z.enum(["standard", "mean-solar", "true-solar"]),
    longitudeDeg: z.number().min(-180).max(180).nullable(),
  })
  .readonly();
export type SolarTimeRequest = z.infer<typeof SolarTimeRequestSchema>;

function clockAt(instant: string, offsetSeconds: number): string | undefined {
  const ms = Math.round(Date.parse(instant) + offsetSeconds * 1000);
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15
    ? new Date(ms).toISOString().slice(0, -1)
    : undefined;
}

export const SolarTimeSnapshotSchema = z
  .strictObject({
    mode: SolarTimeRequestSchema.unwrap().shape.mode,
    instant: EquationOfTimeRequestSchema.unwrap().shape.instant,
    civilClock: z.iso.datetime({ local: true, precision: 0 }).length(19),
    civilOffsetSeconds: z.number().int().min(-86400).max(86400),
    longitudeDeg: SolarTimeRequestSchema.unwrap().shape.longitudeDeg,
    equationOfTime: EquationOfTimeSnapshotSchema.nullable(),
    offsetFromUtcSeconds: z.number().min(-86400).max(86400),
    correctionSeconds: z.number().min(-172800).max(172800),
    policyClock: z.iso.datetime({ local: true, precision: 3 }).length(23),
    provenance: z
      .strictObject({
        ruleId: z.literal("time.solar-policy"),
        ruleVersion: z.literal("1.0.0"),
        rounding: z.literal("nearest-millisecond"),
        standardBasis: z.literal("resolved-civil-clock"),
        longitudeConvention: z.literal("east-positive"),
      })
      .readonly(),
  })
  .refine(
    (value) => {
      const { mode, longitudeDeg, equationOfTime, civilOffsetSeconds, offsetFromUtcSeconds } =
        value;
      if (
        clockAt(value.instant, civilOffsetSeconds) !== value.civilClock + ".000" ||
        clockAt(value.instant, offsetFromUtcSeconds) !== value.policyClock
      )
        return false;
      if (mode === "standard" && (longitudeDeg !== null || equationOfTime !== null)) return false;
      if (mode !== "standard" && longitudeDeg === null) return false;
      if (
        mode === "true-solar" ? equationOfTime?.instant !== value.instant : equationOfTime !== null
      )
        return false;
      const expected =
        mode === "standard"
          ? civilOffsetSeconds
          : longitudeDeg! * 240 + (equationOfTime?.minutes ?? 0) * 60;
      return (
        Math.abs(expected - offsetFromUtcSeconds) < 1e-7 &&
        Math.abs(offsetFromUtcSeconds - civilOffsetSeconds - value.correctionSeconds) < 1e-7
      );
    },
    { message: "Solar clock, correction, UTC instant and selected policy must agree." },
  )
  .readonly();
export type SolarTimeSnapshot = z.infer<typeof SolarTimeSnapshotSchema>;

const messages = {
  INPUT_REJECTED: "Solar time input was rejected.",
  LONGITUDE_REQUIRED: "Solar time requires an explicit longitude.",
  CALCULATION_FAILED: "Solar time calculation failed.",
  OUTPUT_INVALID: "Solar time adapter returned invalid output.",
} as const;
export class SolarTimeError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "SolarTimeError";
  }
}

/** Clock labels only: the physical UTC instant remains unchanged. */
export function applySolarTimePolicy(
  value: unknown,
  adapter?: EquationOfTimeAdapter,
): SolarTimeSnapshot {
  const parsed = SolarTimeRequestSchema.safeParse(value);
  if (!parsed.success) throw new SolarTimeError("INPUT_REJECTED");
  const { time, mode } = parsed.data;
  const longitudeDeg = mode === "standard" ? null : parsed.data.longitudeDeg;
  if (mode !== "standard" && longitudeDeg === null) throw new SolarTimeError("LONGITUDE_REQUIRED");
  const { instant, offsetSeconds: civilOffsetSeconds, localDateTime: civilClock } = time.resolved;
  let equationOfTime: EquationOfTimeSnapshot | null = null;
  if (mode === "true-solar") {
    if (!adapter) throw new SolarTimeError("CALCULATION_FAILED");
    let raw: unknown;
    try {
      raw = adapter.calculate({ instant });
    } catch (error) {
      throw new SolarTimeError(error instanceof SolarTimeError ? error.code : "CALCULATION_FAILED");
    }
    const result = EquationOfTimeSnapshotSchema.safeParse(raw);
    if (!result.success || result.data.instant !== instant)
      throw new SolarTimeError("OUTPUT_INVALID");
    equationOfTime = result.data;
  }
  const offsetFromUtcSeconds =
    mode === "standard"
      ? civilOffsetSeconds
      : longitudeDeg! * 240 + (equationOfTime?.minutes ?? 0) * 60;
  const result = SolarTimeSnapshotSchema.safeParse({
    mode,
    instant,
    civilClock,
    civilOffsetSeconds,
    longitudeDeg,
    equationOfTime,
    offsetFromUtcSeconds,
    correctionSeconds: offsetFromUtcSeconds - civilOffsetSeconds,
    policyClock: clockAt(instant, offsetFromUtcSeconds),
    provenance: {
      ruleId: "time.solar-policy",
      ruleVersion: "1.0.0",
      rounding: "nearest-millisecond",
      standardBasis: "resolved-civil-clock",
      longitudeConvention: "east-positive",
    },
  });
  if (!result.success) throw new SolarTimeError("OUTPUT_INVALID");
  return result.data;
}
