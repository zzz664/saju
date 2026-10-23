import { SolarTimeReasonSchema } from "@/domain/contracts";
import { z } from "zod";
import {
  AnalysisInputSchema,
  InputInformationSchema,
  getInputInformation,
  type AnalysisInput,
} from "@/domain/input";
import {
  applySolarTimePolicy,
  SolarTimeSnapshotSchema,
  type EquationOfTimeAdapter,
} from "@/domain/solar-time";
import {
  normalizeParsedBirthTime,
  TimeNormalizationResultSchema,
  type TimeNormalizationDependencies,
} from "@/application/time-normalization";

export interface SolarTimeDependencies extends TimeNormalizationDependencies {
  readonly equationOfTime?: EquationOfTimeAdapter;
}

export const PreparedBirthTimeSchema = z
  .discriminatedUnion("status", [
    TimeNormalizationResultSchema.unwrap().options[0].extend({
      solarTime: SolarTimeSnapshotSchema,
    }),
    TimeNormalizationResultSchema.unwrap().options[1],
    z.strictObject({
      status: z.literal("unavailable"),
      information: InputInformationSchema,
      reasons: z.array(SolarTimeReasonSchema).min(1).readonly(),
    }),
  ])
  .readonly();
export type PreparedBirthTime = z.infer<typeof PreparedBirthTimeSchema>;

/** Resolve civil time first, then apply the requested solar clock policy once. */
export function prepareBirthTime(
  value: unknown,
  dependencies: SolarTimeDependencies,
): PreparedBirthTime {
  const input = AnalysisInputSchema.parse(value);
  return PreparedBirthTimeSchema.parse(prepareParsedBirthTime(input, dependencies));
}

/** Internal typed pipeline: no hypothetical minute needs to reparse AnalysisInput. */
export function prepareParsedBirthTime(
  input: AnalysisInput,
  dependencies: SolarTimeDependencies,
): PreparedBirthTime {
  if (input.birthInput.birthTime.status === "unknown")
    return PreparedBirthTimeSchema.parse({
      status: "unavailable",
      reasons: ["BIRTH_TIME_UNKNOWN"],
      information: getInputInformation(input),
    });
  if (input.calculationPolicy.solarTime !== "standard" && input.birthInput.longitudeDeg === null) {
    return PreparedBirthTimeSchema.parse({
      status: "unavailable",
      reasons: ["LONGITUDE_UNKNOWN"],
      information: getInputInformation(input),
    });
  }
  const result = normalizeParsedBirthTime(input, dependencies);
  if (result.status !== "normalized") return result;
  return Object.freeze({
    ...result,
    solarTime: applySolarTimePolicy(
      {
        time: result.time,
        mode: input.calculationPolicy.solarTime,
        longitudeDeg: input.birthInput.longitudeDeg,
      },
      dependencies.equationOfTime,
    ),
  });
}
