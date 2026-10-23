import { INPUT_COMMANDS } from "@/cli/commands";
import { TopicSchema } from "@/domain/judgment/topics/schemas";
import { createCoreDependencies } from "@/server/core-dependencies";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { CliInputError, readUtf8Input } from "@/cli/input";
import { cliError, runCli, type CliResult } from "@/cli/run";

function writeResult(result: CliResult): void {
  process.exitCode = result.exitCode;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

// A closed output pipe is an I/O failure, never an uncaught stack trace.
process.stdout.on("error", () => {
  process.exitCode = 1;
});
process.stderr.on("error", () => {
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const needsInput =
    (args[0] === "diagnose-topic"
      ? args.length === 2 && TopicSchema.safeParse(args[1]).success
      : args.length === 1) && (INPUT_COMMANDS as readonly string[]).includes(args[0]);
  const text = needsInput ? await readUtf8Input(process.stdin) : "";
  writeResult(
    runCli(args, text, manseryeokCalendarAdapter, {
      ...createCoreDependencies(),
      hash: nodeSha256Adapter,
    }),
  );
}

main().catch((error: unknown) => {
  if (error instanceof CliInputError) {
    writeResult(cliError(error.code === "STDIN_ERROR" ? 1 : 2, error.code, error.message));
  } else {
    writeResult(cliError(1, "IO_ERROR", "CLI input/output failed."));
  }
});
