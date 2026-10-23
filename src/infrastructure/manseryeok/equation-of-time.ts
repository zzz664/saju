import { equationOfTimeMinutes } from "manseryeok";
import packageInfo from "manseryeok/package.json";
import {
  EquationOfTimeRequestSchema,
  EquationOfTimeSnapshotSchema,
  SolarTimeError,
  type EquationOfTimeAdapter,
  type EquationOfTimeRequest,
} from "@/domain/solar-time";

export const manseryeokEquationOfTimeAdapter: EquationOfTimeAdapter = Object.freeze({
  calculate(value: EquationOfTimeRequest) {
    const request = EquationOfTimeRequestSchema.safeParse(value);
    if (!request.success) throw new SolarTimeError("INPUT_REJECTED");
    let minutes: number;
    try {
      minutes = equationOfTimeMinutes(Date.parse(request.data.instant));
    } catch {
      throw new SolarTimeError("CALCULATION_FAILED");
    }
    const result = EquationOfTimeSnapshotSchema.safeParse({
      instant: request.data.instant,
      minutes,
      provenance: {
        libraryName: "manseryeok",
        libraryVersion: packageInfo.version,
        model: "meeus-28.3",
        convention: "apparent-minus-mean",
        ruleId: "astro.equation-of-time",
        ruleVersion: "1.0.0",
      },
    });
    if (!result.success) throw new SolarTimeError("OUTPUT_INVALID");
    return result.data;
  },
});
