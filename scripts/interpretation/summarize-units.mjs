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
  parseEntailmentVerdict,
  summaryRequestBody,
} from "./lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const passagesFile = path.join(root, "src/infrastructure/interpretation/data/passages.json");
const summariesFile = path.join(root, "src/infrastructure/interpretation/data/summaries.json");
const argv = process.argv.slice(2);
const confirmed = argv.includes("--confirm");
const maxIndex = argv.indexOf("--max");
const max = maxIndex >= 0 ? Number(argv[maxIndex + 1]) : 10;
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
  if (!response.ok) throw new Error(`provider ${response.status}`);
  const envelope = await response.json();
  return {
    text: outputTextOf(envelope),
    usage: envelope?.usage ?? null,
    model: typeof envelope?.model === "string" ? envelope.model : model,
  };
}

async function main() {
  const scaffold = await loadScaffold();
  const passages = JSON.parse(readFileSync(passagesFile, "utf8")).passages;
  const file = JSON.parse(readFileSync(summariesFile, "utf8"));
  const pending = scaffold.filter(
    (entry) =>
      passages[entry.source.sourceId] &&
      (!file.summaries[entry.unit.unitId] ||
        file.summaries[entry.unit.unitId].passageDigest !==
          passages[entry.source.sourceId].passageDigest),
  );
  const batch = pending.slice(0, max);
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0, passed: 0, failed: 0, errors: 0 };
  for (const entry of batch) {
    const source = passages[entry.source.sourceId];
    try {
      const summary = await call(summaryRequestBody(model, source.passage, entry.source.locator));
      usage.calls++;
      usage.inputTokens += summary.usage?.input_tokens ?? 0;
      usage.outputTokens += summary.usage?.output_tokens ?? 0;
      if (!summary.text) throw new Error("empty summary");
      const verdict = await call(entailmentRequestBody(model, source.passage, summary.text));
      usage.calls++;
      usage.inputTokens += verdict.usage?.input_tokens ?? 0;
      usage.outputTokens += verdict.usage?.output_tokens ?? 0;
      const status = parseEntailmentVerdict(verdict.text);
      if (!status) throw new Error("unreadable verdict");
      const now = new Date().toISOString();
      file.summaries[entry.unit.unitId] = {
        text: summary.text.slice(0, 800),
        modelId: summary.model,
        promptVersion: SUMMARY_PROMPT_VERSION,
        generatedAt: now,
        passageDigest: source.passageDigest,
        entailment: { status, modelId: verdict.model, checkedAt: now },
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
