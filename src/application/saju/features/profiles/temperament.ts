import type { FeatureExecutor } from "@/application/saju/features/ports";
import { TEMPERAMENT_VERSION } from "@/domain/features/temperament";

export const temperamentExecutor: FeatureExecutor = Object.freeze({
  version: TEMPERAMENT_VERSION,
  execute(context) {
    const selected = context.availableJudgments.filter(
      (j) => j.originModule === "M03" && j.topic === "temperament",
    );
    return {
      status: selected.length ? "partial" : "unavailable",
      judgmentIds: selected.map((j) => j.judgmentId),
    };
  },
});
