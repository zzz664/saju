import { writeFileSync } from "node:fs";
import {
  evaluateNarrationMatrix,
  renderNarrationReview,
} from "../../src/application/narration/evaluation";
import { evaluationManifest, evaluationOptions, loadEvaluationCases } from "./persona-fixtures";
import { readOpenAiModel } from "../../src/server/openai-model";

// Explicit local mock tool; it never reads credentials, selects a live provider or
// accepts arbitrary input/output paths. Production invocation fails closed.
async function main() {
  if (process.env.NODE_ENV === "production" || process.argv.length !== 2)
    throw new Error("Evaluation invocation rejected.");
  const report = await evaluateNarrationMatrix(
    {
      suiteId: evaluationManifest.suiteId,
      suiteVersion: evaluationManifest.suiteVersion,
      cases: loadEvaluationCases(),
    },
    { ...evaluationOptions(), model: readOpenAiModel(process.env) },
  );
  const directory = new URL("../../docs/evaluations/", import.meta.url);
  writeFileSync(
    new URL("narration-plan-mock-results.json", directory),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
  writeFileSync(
    new URL("narration-plan-mock-samples.md", directory),
    renderNarrationReview(report),
    "utf8",
  );
  // Aggregate metrics only; source prose and raw birth inputs never go to stdout.
  console.log(
    JSON.stringify({
      suiteId: report.suiteId,
      providerKind: report.providerKind,
      ...report.summary,
      rejectionCounts: report.rejectionCounts,
      humanEvaluation: report.humanEvaluation,
    }),
  );
  if (!report.summary.groundingPassed) process.exitCode = 1;
}
main().catch(() => {
  console.error("Narration mock evaluation failed.");
  process.exitCode = 1;
});
