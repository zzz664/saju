import type { BudgetLedger } from "@/domain/budget-ledger";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  fsyncSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { experimentDay, ExperimentError } from "@/domain/experiment";
import type { LiveObservation } from "@/infrastructure/openai/narration";
import { ModelIdSchema } from "@/domain/narration/model";

const Entry = z.strictObject({
  key: z.string().regex(/^[a-f0-9]{64}$/),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tokens: z.number().int().nonnegative().max(2_000_000_000),
  pending: z.boolean(),
  modelId: ModelIdSchema.optional(),
  inputTokens: z.number().int().nonnegative().max(1_000_000_000).optional(),
  outputTokens: z.number().int().nonnegative().max(1_000_000_000).optional(),
  responseId: z
    .string()
    .regex(/^resp_[a-zA-Z0-9_-]{1,200}$/)
    .optional(),
  providerRequestId: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,200}$/)
    .optional(),
  providerStatus: z
    .enum(["completed", "failed", "incomplete", "cancelled", "queued", "in_progress"])
    .optional(),
});
const State = z.strictObject({
  version: z.literal(1),
  lastNow: z.number().int().nonnegative(),
  entries: z.array(Entry).max(10000),
});
type StateValue = z.infer<typeof State>;

/** Local disk only. Exclusive OS file lock survives crashes and fails closed until reviewed.
 * One host/project ledger across processes; not a distributed deployment budget. */
export type LiveBudgetReservation = {
  now: number;
  key: string;
  tokens: number;
  callsLimit: number;
  tokensLimit: number;
  modelId?: string;
};
export class FileLiveBudget implements BudgetLedger<LiveBudgetReservation, LiveObservation> {
  readonly file: string;
  readonly lock: string;
  constructor(readonly directory: string) {
    this.file = path.join(directory, "live-budget.json");
    this.lock = path.join(directory, "live-budget.lock");
  }
  private read(): StateValue {
    if (!existsSync(this.file)) return { version: 1, lastNow: 0, entries: [] };
    const raw = readFileSync(this.file);
    if (raw.byteLength > 5_000_000) throw new Error("size");
    return State.parse(JSON.parse(raw.toString("utf8")));
  }
  private save(state: StateValue) {
    const temporary = this.file + "." + randomUUID() + ".tmp";
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(descriptor, JSON.stringify(State.parse(state)));
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, this.file);
  }
  inspect(now: number) {
    try {
      const state = this.read(),
        day = experimentDay(now);
      if (now < state.lastNow) throw new ExperimentError("CLOCK_INVALID");
      const entries = state.entries.filter((item) => item.day === day);
      return { calls: entries.length, tokens: entries.reduce((sum, item) => sum + item.tokens, 0) };
    } catch (cause) {
      if (cause instanceof ExperimentError) throw cause;
      throw new ExperimentError("STORE_UNAVAILABLE");
    }
  }
  reserve(input: LiveBudgetReservation) {
    let descriptor: number;
    try {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      descriptor = openSync(this.lock, "wx", 0o600);
    } catch (cause) {
      throw new ExperimentError(
        (cause as NodeJS.ErrnoException).code === "EEXIST"
          ? "CONCURRENCY_LIMIT"
          : "STORE_UNAVAILABLE",
      );
    }
    closeSync(descriptor);
    let state: StateValue;
    try {
      state = this.read();
      const day = experimentDay(input.now);
      if (input.now < state.lastNow) throw new ExperimentError("CLOCK_INVALID");
      if (state.entries.some((item) => item.pending))
        throw new ExperimentError("STORE_UNAVAILABLE");
      if (state.entries.some((item) => item.key === input.key))
        throw new ExperimentError("ACCESS_DENIED");
      const used = this.inspect(input.now);
      if (used.calls >= input.callsLimit || input.tokens > input.tokensLimit - used.tokens)
        throw new ExperimentError("BUDGET_EXCEEDED");
      if (state.entries.length >= 10000) throw new ExperimentError("STORE_UNAVAILABLE");
      state.entries.push(
        Entry.parse({
          key: input.key,
          day,
          tokens: input.tokens,
          pending: true,
          modelId: input.modelId,
        }),
      );
      state.lastNow = input.now;
      this.save(state);
    } catch (cause) {
      // No provider has been entered; release only this lock. A pending record still blocks the next reservation.
      unlinkSync(this.lock);
      if (cause instanceof ExperimentError) throw cause;
      throw new ExperimentError("STORE_UNAVAILABLE");
    }
    let finished = false;
    const settle = (observation: LiveObservation) => {
      if (finished) return;
      try {
        const entry = state.entries[state.entries.length - 1];
        const usageKnown =
          observation.inputTokens !== undefined && observation.outputTokens !== undefined;
        Object.assign(entry, observation, { pending: false });
        // Unknown usage retains the full reservation; known usage can exceed the estimate and blocks future admissions.
        if (usageKnown) entry.tokens = observation.inputTokens! + observation.outputTokens!;
        this.save(state);
        unlinkSync(this.lock);
        finished = true;
      } catch {
        throw new ExperimentError("STORE_UNAVAILABLE");
      }
    };
    return { settle, finish: settle };
  }
}
