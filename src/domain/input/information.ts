import { z } from "zod";

import type { AnalysisInput } from "@/domain/input/schemas";

const UnknownFieldSchema = z.enum(["birthTime", "longitudeDeg", "latitudeDeg", "directionBasis"]);

const LimitationSchema = z
  .strictObject({
    code: z.enum([
      "BIRTH_TIME_UNKNOWN",
      "LUCK_DIRECTION_BASIS_UNKNOWN",
      "SOLAR_TIME_INPUT_MISSING",
    ]),
    inputPaths: z
      .array(
        z.enum(["birthInput.birthTime", "birthInput.longitudeDeg", "birthInput.directionBasis"]),
      )
      .min(1)
      .readonly(),
  })
  .readonly();

export const InputInformationSchema = z
  .strictObject({
    unknownFields: z.array(UnknownFieldSchema).readonly(),
    limitations: z.array(LimitationSchema).readonly(),
  })
  .readonly();

export type InputInformation = z.infer<typeof InputInformationSchema>;
type UnknownField = z.infer<typeof UnknownFieldSchema>;
type Limitation = z.infer<typeof LimitationSchema>;

/** Assess parsed input only; this never computes pillars or applies a policy. */
export function getInputInformation(input: AnalysisInput): InputInformation {
  const { birthInput, calculationPolicy } = input;
  const unknownFields: UnknownField[] = [];
  const limitations: Limitation[] = [];

  if (birthInput.birthTime.status === "unknown") {
    unknownFields.push("birthTime");
    limitations.push({ code: "BIRTH_TIME_UNKNOWN", inputPaths: ["birthInput.birthTime"] });
  }
  if (birthInput.longitudeDeg === null) unknownFields.push("longitudeDeg");
  if (birthInput.latitudeDeg === null) unknownFields.push("latitudeDeg");
  if (birthInput.directionBasis === "unspecified") {
    unknownFields.push("directionBasis");
    limitations.push({
      code: "LUCK_DIRECTION_BASIS_UNKNOWN",
      inputPaths: ["birthInput.directionBasis"],
    });
  }

  if (calculationPolicy.solarTime !== "standard") {
    const inputPaths: Limitation["inputPaths"][number][] = [];
    if (birthInput.birthTime.status === "unknown") inputPaths.push("birthInput.birthTime");
    if (birthInput.longitudeDeg === null) inputPaths.push("birthInput.longitudeDeg");
    if (inputPaths.length > 0) {
      limitations.push({ code: "SOLAR_TIME_INPUT_MISSING", inputPaths });
    }
  }

  return InputInformationSchema.parse({ unknownFields, limitations });
}
