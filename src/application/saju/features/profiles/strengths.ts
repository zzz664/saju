import type { FeatureExecutor } from "@/application/saju/features/ports";
import { STRENGTHS_VERSION } from "@/domain/features/strengths";

export const strengthsExecutor: FeatureExecutor = Object.freeze({
  version: STRENGTHS_VERSION,
  execute(context) {
    const selected = context.availableJudgments.filter(
      (j) => j.originModule === "M03" && j.topic === "strengths",
    );
    return {
      status: selected.length ? "partial" : "unavailable",
      judgmentIds: selected.map((j) => j.judgmentId),
    };
  },
});
