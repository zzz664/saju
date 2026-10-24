// Generates Korean summaries for collected passages and checks each summary against its passage
// with a second, independent entailment call. Writes src/infrastructure/interpretation/data/summaries.json.
//
// This is an explicit Live run (AGENTS.md v2.5). It refuses to start unless all of these hold:
//   ENABLE_INTERPRETATION_SUMMARY=true   OPENAI_API_KEY set   --confirm flag   not CI/production
//   --max <n>  bounds the number of units per run (default 10) so cost stays predictable.
//
//   node --env-file-if-exists=.env --env-file-if-exists=.env.local \
//        scripts/interpretation/summarize-units.mjs --confirm --max 10
//
// Each unit costs two small calls. Summaries whose entailment verdict is FAIL are stored with
// status "failed" so the catalog shows them as unusable instead of silently dropping them.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  SUMMARY_PROMPT_VERSION,
  entailmentRequestBody,
  outputTextOf,
  partialTextOf,
  parseEntailmentReason,
  parseEntailmentVerdict,
  summaryRequestBody,
} from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const passagesFile = path.join(root, "src/infrastructure/interpretation/data/passages.json");
const summariesFile = path.join(root, "src/infrastructure/interpretation/data/summaries.json");
const argv = process.argv.slice(2);
const confirmed = argv.includes("--confirm");
// --retry-failed: regenerate units whose last entailment verdict was FAIL (otherwise they are kept
// as unusable and skipped, so a re-run never silently spends money on the same unit twice).
const retryFailed = argv.includes("--retry-failed");
const maxIndex = argv.indexOf("--max");
const max = maxIndex >= 0 ? Number(argv[maxIndex + 1]) : 10;
// OPENAI_MODEL picks the model for this offline batch (default gpt-4o-mini). gpt-4o-mini misread
// 丙/丁 and 科甲 in the first calibration run (2/10 passed); a stronger model is recommended here.
const model = (process.env.OPENAI_MODEL ?? "").trim() || "gpt-4o-mini";

function refuse(reason) {
  console.error(`LIVE_BLOCKED: ${reason}`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production" || process.env.CI) refuse("production/CI");
if (process.env.ENABLE_INTERPRETATION_SUMMARY !== "true") refuse("ENABLE_INTERPRETATION_SUMMARY");
if (!process.env.OPENAI_API_KEY) refuse("OPENAI_API_KEY");
if (!confirmed) refuse("--confirm flag");
if (!Number.isInteger(max) || max < 1 || max > 200) refuse("--max must be 1..200");
if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/.test(model)) refuse("OPENAI_MODEL");

async function loadScaffold() {
  const { pathToFileURL } = await import("node:url");
  const tsx = await import("tsx/esm/api");
  const unregister = tsx.register();
  try {
    const loaded = await import(
      pathToFileURL(path.join(root, "src/infrastructure/interpretation/scaffold.ts")).href
    );
    return loaded.buildScaffold();
  } finally {
    unregister();
  }
}

/** The data files must keep their top-level object; a hand edit that drops it fails here, not later. */
function readDataFile(filePath, key) {
  const parsed = JSON.parse(readFileSync(filePath, "utf8"));
  if (!parsed || typeof parsed !== "object" || typeof parsed[key] !== "object" || !parsed[key]) {
    console.error(
      `${path.basename(filePath)}: 최상위 "${key}" 객체가 없다. 파일을 손으로 고쳤다면 git checkout -- ${path.relative(root, filePath)} 로 되돌린 뒤 다시 실행한다.`,
    );
    process.exit(1);
  }
  return parsed[key];
}

async function call(body) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    redirect: "error",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    // Surface the provider's reason (its error body carries no key or prompt text), bounded.
    const detail = await response.text().catch(() => "");
    let reason = "";
    try {
      reason = JSON.parse(detail)?.error?.message ?? "";
    } catch {
      reason = "";
    }
    throw new Error(`provider ${response.status}${reason ? ` — ${reason.slice(0, 200)}` : ""}`);
  }
  const envelope = await response.json();
  return {
    text: outputTextOf(envelope),
    partial: partialTextOf(envelope),
    // Why there is no text, when there is none: "incomplete/max_output_tokens", "failed/…", etc.
    why: `${envelope?.status ?? "no-status"}${envelope?.incomplete_details?.reason ? `/${envelope.incomplete_details.reason}` : ""}`,
    usage: envelope?.usage ?? null,
    model: typeof envelope?.model === "string" ? envelope.model : model,
  };
}

async function main() {
  const scaffold = await loadScaffold();
  const passages = readDataFile(passagesFile, "passages");
  const file = JSON.parse(readFileSync(summariesFile, "utf8"));
  readDataFile(summariesFile, "summaries"); // shape check only; `file` is written back as a whole
  const pending = scaffold.filter((entry) => {
    const passage = passages[entry.source.sourceId];
    const existing = file.summaries[entry.unit.unitId];
    if (!passage) return false;
    if (!existing || existing.passageDigest !== passage.passageDigest) return true;
    return retryFailed && existing.entailment.status === "failed";
  });
  const batch = pending.slice(0, max);
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0, passed: 0, failed: 0, errors: 0 };
  for (const entry of batch) {
    const source = passages[entry.source.sourceId];
    try {
      const summary = await call(summaryRequestBody(model, source.passage, entry.source.locator));
      usage.calls++;
      usage.inputTokens += summary.usage?.input_tokens ?? 0;
      usage.outputTokens += summary.usage?.output_tokens ?? 0;
      if (!summary.text) throw new Error(`empty summary (${summary.why})`);
      const verdict = await call(entailmentRequestBody(model, source.passage, summary.text));
      usage.calls++;
      usage.inputTokens += verdict.usage?.input_tokens ?? 0;
      usage.outputTokens += verdict.usage?.output_tokens ?? 0;
      // A verdict cut off mid-reason still starts with PASS/FAIL; a summary is never read partially.
      const status = parseEntailmentVerdict(verdict.text ?? verdict.partial);
      if (!status) throw new Error(`unreadable verdict (${verdict.why})`);
      const reason =
        status === "failed" ? parseEntailmentReason(verdict.text ?? verdict.partial) : null;
      const now = new Date().toISOString();
      file.summaries[entry.unit.unitId] = {
        text: summary.text.slice(0, 800),
        modelId: summary.model,
        promptVersion: SUMMARY_PROMPT_VERSION,
        generatedAt: now,
        passageDigest: source.passageDigest,
        entailment: {
          status,
          modelId: verdict.model,
          checkedAt: now,
          ...(reason ? { reason } : {}),
        },
      };
      usage[status]++;
      // Persist after every unit so an interruption never loses paid work.
      writeFileSync(summariesFile, JSON.stringify(file, null, 2) + "\n", "utf8");
    } catch (error) {
      usage.errors++;
      console.error(`${entry.unit.unitId}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
  // Metadata only: no passage or summary text goes to stdout.
  console.log(
    JSON.stringify({
      status: "LIVE_RUN",
      model,
      attempted: batch.length,
      remaining: pending.length - batch.length,
      ...usage,
    }),
  );
  if (usage.errors) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Summarizer failed.");
  process.exitCode = 1;
});
