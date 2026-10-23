import { writeFileSync } from "node:fs";
import {
  evaluatePersonaMatrix,
  renderPersonaReview,
} from "../../src/application/narration/evaluation";
import { evaluationManifest, evaluationOptions, loadEvaluationCases } from "./persona-fixtures";
import { readOpenAiModel } from "../../src/server/openai-model";

// Explicit local mock tool; it never reads credentials, selects a live provider or
// accepts arbitrary input/output paths. Production invocation fails closed.
async function main() {
  if (process.env.NODE_ENV === "production" || process.argv.length !== 2)
    throw new Error("Evaluation invocation rejected.");
  const report = await evaluatePersonaMatrix(
    {
      suiteId: evaluationManifest.suiteId,
      suiteVersion: evaluationManifest.suiteVersion,
      cases: loadEvaluationCases(),
    },
    { ...evaluationOptions(), model: readOpenAiModel(process.env) },
  );
  const directory = new URL("../../docs/evaluations/", import.meta.url);
  writeFileSync(
    new URL("WBS-25-persona-quality-results.json", directory),
    JSON.stringify(report, null, 2) + "\n",
    "utf8",
  );
  writeFileSync(
    new URL("WBS-25-persona-quality-samples.md", directory),
    renderPersonaReview(report),
    "utf8",
  );
  // Aggregate metrics only; source prose and raw birth inputs never go to stdout.
  console.log(
    JSON.stringify({
      suiteId: report.suiteId,
      providerKind: report.providerKind,
      ...report.summary,
      humanEvaluation: report.humanEvaluation,
    }),
  );
  if (!report.summary.contractPassed || report.summary.styleFlagged > 0) process.exitCode = 1;
}
main().catch(() => {
  console.error("Persona mock evaluation failed.");
  process.exitCode = 1;
});
