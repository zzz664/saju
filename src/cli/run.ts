import { ZodError } from "zod";

import { calculateSajuSnapshot } from "../application/saju/index";
import { prepareBirthTime, type SolarTimeDependencies } from "../application/solar-time/index";
import type { CalendarAdapter } from "../domain/calendar/index";
import { AnalysisInputSchema, getInputInformation } from "../domain/input/index";

export type CliResult = { exitCode: 0 | 1 | 2; stdout: string; stderr: string };
export const HELP = "Usage: npm run --silent saju -- <validate|calculate|normalize-time> < input.json\nInput: one UTF-8 AnalysisInput JSON document, at most 64 KiB.\nnormalize-time resolves IANA civil time and applies the requested solar policy; day policy is separate.\ncalculate currently requires Etc/GMT-9 and standard/midnight/reject.\n";

export function cliError(exitCode: 1 | 2, code: string, message: string): CliResult {
  return { exitCode, stdout: "", stderr: JSON.stringify({ error: { code, message } }) + "\n" };
}

export function runCli(args: readonly string[], text: string, adapter: CalendarAdapter, timeDependencies?: SolarTimeDependencies): CliResult {
  if (args.length === 1 && args[0] === "--help") return { exitCode: 0, stdout: HELP, stderr: "" };
  if (args.length !== 1 || !["validate", "calculate", "normalize-time"].includes(args[0])) {
    return cliError(2, "USAGE", "Use validate, calculate, normalize-time or --help; provide JSON through standard input.");
  }

  let raw: unknown;
  try { raw = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { return cliError(2, "INVALID_JSON", "Provide one valid JSON document."); }

  try {
    if (args[0] === "validate") {
      const input = AnalysisInputSchema.parse(raw);
      return { exitCode: 0, stdout: JSON.stringify({ status: "valid", information: getInputInformation(input) }) + "\n", stderr: "" };
    }
    if (args[0] === "normalize-time") {
      if (!timeDependencies) return cliError(1, "TIME_NORMALIZATION_FAILED", "Local time normalization is unavailable.");
      const result = prepareBirthTime(raw, timeDependencies);
      return { exitCode: result.status === "normalized" ? 0 : 2, stdout: JSON.stringify(result) + "\n", stderr: "" };
    }
    const result = calculateSajuSnapshot(raw, adapter);
    return { exitCode: result.status === "calculated" ? 0 : 2, stdout: JSON.stringify(result) + "\n", stderr: "" };
  } catch (error) {
    if (error instanceof ZodError) return cliError(2, "INVALID_INPUT", "The input does not satisfy the AnalysisInput contract.");
    if (args[0] === "normalize-time") return cliError(1, "TIME_NORMALIZATION_FAILED", "Local time normalization failed.");
    return cliError(1, "CALCULATION_FAILED", "Calendar calculation failed.");
  }
}
