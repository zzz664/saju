import type { FeatureExecutor } from "@/application/saju/features/ports";
import { CAREER_VERSION } from "@/domain/features/career";

export const careerExecutor: FeatureExecutor = Object.freeze({
  version: CAREER_VERSION,
  execute(context) {
    const selected = context.availableJudgments.filter(
      (j) => j.originModule === "M03" && j.topic === "career",
    );
    return {
      status: selected.length ? "partial" : "unavailable",
      judgmentIds: selected.map((j) => j.judgmentId),
    };
  },
});
