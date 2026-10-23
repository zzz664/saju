import { fingerprintInput, fingerprintDependencies } from "./fingerprint-input";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import type { FeatureId, ModuleId } from "@/schemas/features";
import type {
  FeatureDependencies,
  FeatureContext,
  ModuleContext,
} from "@/application/saju/features/ports";
export const featureDependencies = { ...fingerprintDependencies, hash: nodeSha256Adapter };
export function featureRequest(featureId: FeatureId) {
  const common = { featureId, ...fingerprintInput };
  if (featureId === "F08")
    return { ...common, target: { at: "2026-10-24T00:00:00Z", timezoneId: "Asia/Seoul" } };
  if (featureId === "F09") return { ...common, target: { year: 2026, timezoneId: "Asia/Seoul" } };
  if (featureId === "F10")
    return { ...common, target: { kind: "daily", date: "2026-10-24", timezoneId: "Asia/Seoul" } };
  if (featureId === "F11")
    return {
      ...common,
      otherBirthInput: { ...fingerprintInput.birthInput, birthDate: "2024-03-10" },
      otherCalculationPolicy: fingerprintInput.calculationPolicy,
    };
  return common;
}
export function mockFeaturePorts(calls: string[] = []) {
  const moduleExecutors: NonNullable<FeatureDependencies["moduleExecutors"]> = Object.fromEntries(
    (["M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08"] as ModuleId[]).map((id) => [
      id,
      {
        version: "1.0.0",
        execute: (context: ModuleContext) => {
          calls.push(`${context.subject}:${context.moduleId}:${context.topic ?? ""}`);
          return { status: "complete", judgments: [], limitations: [] };
        },
      },
    ]),
  );
  const featureExecutors: NonNullable<FeatureDependencies["featureExecutors"]> = Object.fromEntries(
    (["F02", "F03", "F04", "F05", "F06", "F07", "F08", "F09", "F10", "F11"] as FeatureId[]).map(
      (id) => [
        id,
        {
          version: "1.0.0",
          execute: (context: FeatureContext) => {
            calls.push(context.featureId);
            return {
              status: "complete",
              judgmentIds: context.availableJudgments
                .filter((j) => j.originModule === "base" && j.status === "complete")
                .slice(0, 1)
                .map((j) => j.judgmentId),
            };
          },
        },
      ],
    ),
  );
  return { moduleExecutors, featureExecutors };
}
