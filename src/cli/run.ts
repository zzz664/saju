import { INPUT_COMMANDS, CLI_COMMANDS } from "@/cli/commands";
import { ZodError } from "zod";

import { calculateSajuSnapshot } from "@/application/saju";
import { prepareBirthTime, type SolarTimeDependencies } from "@/application/solar-time";
import { calculatePolicySaju } from "@/application/policy-saju";
import { calculateNatalFacts } from "@/application/natal-facts";
import { calculateJudgments, calculateArbitratedJudgments } from "@/application/judgment";
import { calculateCoreExport } from "@/application/core-export";
import { calculateStructureDiagnosis } from "@/application/structure";
import { calculateRelations } from "@/application/relations";
import { calculateTopic } from "@/application/topics";
import { executeFeature } from "@/application/saju/features";
import { TopicSchema } from "@/domain/judgment/topics/schemas";
import { calculateHashedCoreExport } from "@/application/core-fingerprint";
import type { Sha256Adapter } from "@/domain/core-fingerprint";
import { serializeCoreExport, buildManualPrompt, coreExportJsonSchema } from "@/domain/core-export";
import type { SymbolCatalogAdapter } from "@/domain/natal-facts";
import type { PolicyCalendarAdapter } from "@/domain/policy-calendar";
import type { CalendarAdapter } from "@/domain/calendar";
import { AnalysisInputSchema, getInputInformation } from "@/domain/input";

export type CliResult = { exitCode: 0 | 1 | 2; stdout: string; stderr: string };
export const HELP = `Usage: npm run --silent saju -- <${INPUT_COMMANDS.join("|")}> < input.json\nInput: one UTF-8 AnalysisInput document (FeatureRequest for feature-json), at most 64 KiB.\nnormalize-time resolves IANA civil time and applies the requested solar policy.\ncalculate-policy applies day/hour policies or returns partial unknown-time possibilities.\nderive-facts adds ten gods, hidden stems and separate element counts from confirmed pillars.\njudge-facts evaluates twenty reviewed structural rules with classical sources and evidence.\narbitrate-facts preserves judgments and adds conflict decisions and uncertainty traces.\ndiagnose-structure emits separate M01 candidates and unresolved limits (exit 2).\ndiagnose-relations emits M02 relation occurrences with unassessed effects (exit 2).\ndiagnose-topic <temperament|strengths|career|wealth|romance|social> evaluates one M03 candidate pack (exit 2).\nfeature-json composes the shared F01-F11 FeatureRequest/FeatureResult contract; pending executors remain incomplete.\nexport-json emits a validated core document without raw birth data or candidate clocks.\nmanual-prompt emits copyable Korean instructions and confirmed accepted findings only.\nhash-json adds a deterministic versioned SHA-256 checksum to the core document.\nexport-schema emits the structural JSON Schema without stdin.\ncalculate is the compatibility fixed-clock command; prefer calculate-policy.\n`;

export function cliError(exitCode: 1 | 2, code: string, message: string): CliResult {
  return { exitCode, stdout: "", stderr: JSON.stringify({ error: { code, message } }) + "\n" };
}

export function runCli(
  args: readonly string[],
  text: string,
  adapter: CalendarAdapter,
  timeDependencies?: SolarTimeDependencies & {
    readonly pillars?: PolicyCalendarAdapter;
    readonly symbols?: SymbolCatalogAdapter;
    readonly hash?: Sha256Adapter;
  },
): CliResult {
  if (args.length === 1 && args[0] === "--help") return { exitCode: 0, stdout: HELP, stderr: "" };
  if (args.length === 1 && args[0] === "export-schema")
    return {
      exitCode: 0,
      stdout: JSON.stringify(coreExportJsonSchema(), null, 2) + "\n",
      stderr: "",
    };
  const topicCommand = args[0] === "diagnose-topic";
  if (
    (topicCommand
      ? args.length !== 2 || !TopicSchema.safeParse(args[1]).success
      : args.length !== 1) ||
    !(INPUT_COMMANDS as readonly string[]).includes(args[0])
  ) {
    return cliError(
      2,
      "USAGE",
      `Use ${CLI_COMMANDS.join(", ")}; provide JSON through standard input when required.`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    return cliError(2, "INVALID_JSON", "Provide one valid JSON document.");
  }

  try {
    if (args[0] === "feature-json") {
      if (!timeDependencies?.pillars || !timeDependencies.symbols || !timeDependencies.hash)
        return cliError(1, "CALCULATION_FAILED", "Feature composition is unavailable.");
      const result = executeFeature(raw, {
        ...timeDependencies,
        pillars: timeDependencies.pillars,
        symbols: timeDependencies.symbols,
        hash: timeDependencies.hash,
      });
      return {
        exitCode: result.status === "complete" ? 0 : 2,
        stdout: JSON.stringify(result) + "\n",
        stderr: "",
      };
    }
    if (topicCommand) {
      if (!timeDependencies?.pillars || !timeDependencies.symbols)
        return cliError(1, "CALCULATION_FAILED", "Topic analysis is unavailable.");
      const result = calculateTopic(raw, args[1], {
        ...timeDependencies,
        pillars: timeDependencies.pillars,
        symbols: timeDependencies.symbols,
      });
      return { exitCode: 2, stdout: JSON.stringify(result) + "\n", stderr: "" };
    }
    if (args[0] === "diagnose-relations") {
      if (!timeDependencies?.pillars || !timeDependencies.symbols)
        return cliError(1, "CALCULATION_FAILED", "Relation analysis is unavailable.");
      const result = calculateRelations(raw, {
        ...timeDependencies,
        pillars: timeDependencies.pillars,
        symbols: timeDependencies.symbols,
      });
      return { exitCode: 2, stdout: JSON.stringify(result) + "\n", stderr: "" };
    }
    if (args[0] === "diagnose-structure") {
      if (!timeDependencies?.pillars || !timeDependencies.symbols)
        return cliError(1, "CALCULATION_FAILED", "Structure diagnosis is unavailable.");
      const result = calculateStructureDiagnosis(raw, {
        ...timeDependencies,
        pillars: timeDependencies.pillars,
        symbols: timeDependencies.symbols,
      });
      // M01 v1 deliberately preserves candidate-only / unassessed limits.
      return { exitCode: 2, stdout: JSON.stringify(result) + "\n", stderr: "" };
    }
    if (args[0] === "hash-json") {
      if (!timeDependencies?.pillars || !timeDependencies.symbols || !timeDependencies.hash)
        return cliError(1, "CALCULATION_FAILED", "Core fingerprint calculation is unavailable.");
      const result = calculateHashedCoreExport(
        raw,
        {
          ...timeDependencies,
          pillars: timeDependencies.pillars,
          symbols: timeDependencies.symbols,
        },
        timeDependencies.hash,
      );
      return {
        exitCode: result.status === "complete" ? 0 : 2,
        stdout: JSON.stringify(result) + "\n",
        stderr: "",
      };
    }
    if (args[0] === "export-json" || args[0] === "manual-prompt") {
      if (!timeDependencies?.pillars || !timeDependencies.symbols)
        return cliError(1, "CALCULATION_FAILED", "Core export calculation is unavailable.");
      const result = calculateCoreExport(raw, {
        ...timeDependencies,
        pillars: timeDependencies.pillars,
        symbols: timeDependencies.symbols,
      });
      return {
        exitCode: result.status === "complete" ? 0 : 2,
        stdout: args[0] === "export-json" ? serializeCoreExport(result) : buildManualPrompt(result),
        stderr: "",
      };
    }
    if (args[0] === "validate") {
      const input = AnalysisInputSchema.parse(raw);
      return {
        exitCode: 0,
        stdout: JSON.stringify({ status: "valid", information: getInputInformation(input) }) + "\n",
        stderr: "",
      };
    }
    if (args[0] === "normalize-time") {
      if (!timeDependencies)
        return cliError(1, "TIME_NORMALIZATION_FAILED", "Local time normalization is unavailable.");
      const result = prepareBirthTime(raw, timeDependencies);
      return {
        exitCode: result.status === "normalized" ? 0 : 2,
        stdout: JSON.stringify(result) + "\n",
        stderr: "",
      };
    }
    if (args[0] === "calculate-policy") {
      if (!timeDependencies?.pillars)
        return cliError(1, "CALCULATION_FAILED", "Policy calculation is unavailable.");
      const result = calculatePolicySaju(raw, {
        ...timeDependencies,
        pillars: timeDependencies.pillars,
      });
      return {
        exitCode: result.status === "calculated" ? 0 : 2,
        stdout: JSON.stringify(result) + "\n",
        stderr: "",
      };
    }
    if (args[0] === "derive-facts" || args[0] === "judge-facts" || args[0] === "arbitrate-facts") {
      if (!timeDependencies?.pillars || !timeDependencies.symbols)
        return cliError(1, "CALCULATION_FAILED", "Natal facts calculation is unavailable.");
      const dependencies = {
        ...timeDependencies,
        pillars: timeDependencies.pillars,
        symbols: timeDependencies.symbols,
      };
      const result =
        args[0] === "arbitrate-facts"
          ? calculateArbitratedJudgments(raw, dependencies)
          : args[0] === "judge-facts"
            ? calculateJudgments(raw, dependencies)
            : calculateNatalFacts(raw, dependencies);
      return {
        exitCode: result.status === "complete" ? 0 : 2,
        stdout: JSON.stringify(result) + "\n",
        stderr: "",
      };
    }
    const result = calculateSajuSnapshot(raw, adapter);
    return {
      exitCode: result.status === "calculated" ? 0 : 2,
      stdout: JSON.stringify(result) + "\n",
      stderr: "",
    };
  } catch (error) {
    if (error instanceof ZodError)
      return cliError(2, "INVALID_INPUT", "The input does not satisfy the AnalysisInput contract.");
    if (args[0] === "normalize-time")
      return cliError(1, "TIME_NORMALIZATION_FAILED", "Local time normalization failed.");
    return cliError(1, "CALCULATION_FAILED", "Calendar calculation failed.");
  }
}
