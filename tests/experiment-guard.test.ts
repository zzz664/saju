import { describe, expect, it, vi } from "vitest";
import { calculateCoreExport } from "@/application/core-export";
import { createExperimentRunner } from "@/application/narration/experiment";
import { ExperimentPolicySchema, quoteExperimentRequest } from "@/domain/experiment";
import { createNarrationRequest, type NarrationProvider } from "@/domain/narration";
import { createMockNarrationProvider } from "@/infrastructure/llm/mock";
import { MemoryExperimentBudgetStore } from "@/infrastructure/llm/experiment-budget";
import { fingerprintInput, fingerprintDependencies } from "./helpers/fingerprint-input";

const core = calculateCoreExport(fingerprintInput, fingerprintDependencies);
const start = Date.parse("2026-10-23T12:00:00Z");
const budget = { calls: 10, tokens: 1000000, microUsd: 1000000 };
const policy = {
  enabled: true, expiresAt: start + 86400000, allowedPrincipalIds: ["dev-a", "dev-b"],
  maxRequestBytes: 100000, maxOutputTokens: 256, maxConcurrent: 2,
  rates: { inputMicroUsdPerMillionTokens: 1000000, outputMicroUsdPerMillionTokens: 2000000 },
  daily: budget, perPrincipalDaily: budget, perSession: budget,
};
const principal = { principalId: "dev-a", sessionId: "session-a" };
const mock = createMockNarrationProvider();
function setup(p: unknown = policy, provider: NarrationProvider = mock) {
  let now = start;
  let access: unknown = principal;
  let environment = "development";
  const store = new MemoryExperimentBudgetStore();
  const generate = vi.fn(provider.generate.bind(provider));
  const runner = createExperimentRunner({ policy: p, provider: { ...provider, generate }, store,
    environment: () => environment, now: () => now, resolveAccess: async () => access });
  return { runner, store, generate, time: (n: number) => { now = n; }, access: (v: unknown) => { access = v; }, environment: (v: string) => { environment = v; } };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  let started!: () => void;
  const ready = new Promise<void>(done => { started = done; });
  const result = new Promise<unknown>(done => { resolve = done; });
  const provider: NarrationProvider = { kind: "mock", generate: async () => { started(); return result; } };
  return { provider, ready, resolve };
}
const quote = quoteExperimentRequest(createNarrationRequest(core), ExperimentPolicySchema.parse(policy));

describe("local mock experiment admission guard", () => {
  it("reserves all scopes before one call and applies the server output cap", async () => {
    const run = setup();
    expect((await run.runner.run(core)).sourceStatus).toBe("complete");
    expect(run.generate).toHaveBeenCalledTimes(1);
    expect(run.generate.mock.calls[0][0].max_output_tokens).toBe(256);
    const usage = run.store.inspect(start, principal);
    expect(usage.daily).toEqual({ calls: 1, tokens: quote.tokens, microUsd: quote.microUsd });
    expect(usage.principal).toEqual(usage.daily);
    expect(usage.session).toEqual(usage.daily);
    expect(usage.active).toBe(0);
  });

  it.each(["production", "test", "", "preview"])("denies %s before provider invocation", async environment => {
    const run = setup(); run.environment(environment);
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(run.generate).not.toHaveBeenCalled();
  });

  it.each([null, {}, { principalId: "other", sessionId: "s" }, { ...principal, role: "admin" }, { ...principal, sessionId: "" }])("rejects absent/unapproved/forged access", async access => {
    const run = setup(); run.access(access);
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(run.generate).not.toHaveBeenCalled();
    expect(run.store.inspect(start, principal).daily.calls).toBe(0);
  });

  it("disables experiments by policy and expires approval at the exact timestamp", async () => {
    const disabled = setup({ ...policy, enabled: false });
    await expect(disabled.runner.run(core)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const expired = setup(); expired.time(policy.expiresAt);
    await expect(expired.runner.run(core)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(expired.generate).not.toHaveBeenCalled();
  });

  it("does not trust identity/budget fields in the core payload", async () => {
    const run = setup();
    await expect(run.runner.run({ ...core, userId: "dev-a", remainingTokens: 999999 })).rejects.toMatchObject({ code: "INPUT_REJECTED" });
    expect(run.generate).not.toHaveBeenCalled();
    expect(run.store.inspect(start, principal).daily.calls).toBe(0);
  });

  it.each(["daily", "perPrincipalDaily", "perSession"] as const)("enforces %s across exact call/token/cost limits atomically", async scope => {
    for (const dimension of ["calls", "tokens", "microUsd"] as const) {
      const cap = dimension === "calls" ? 1 : quote[dimension];
      const run = setup({ ...policy, [scope]: { ...budget, [dimension]: cap } });
      await run.runner.run(core);
      await expect(run.runner.run(core)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
      expect(run.generate).toHaveBeenCalledTimes(1);
      expect(run.store.inspect(start, principal).daily.calls).toBe(1);
    }
  });

  it("rejects zero budget and one token/cost unit below reservation without spending any scope", async () => {
    for (const limit of [{ ...budget, calls: 0 }, { ...budget, tokens: quote.tokens - 1 }, { ...budget, microUsd: quote.microUsd - 1 }]) {
      const run = setup({ ...policy, perSession: limit });
      await expect(run.runner.run(core)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
      expect(run.store.inspect(start, principal).daily.calls).toBe(0);
      expect(run.generate).not.toHaveBeenCalled();
    }
  });

  it("blocks oversize input and live providers before budget or supplier calls", async () => {
    const oversized = setup({ ...policy, maxRequestBytes: 1 });
    await expect(oversized.runner.run(core)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect(oversized.generate).not.toHaveBeenCalled();
    const live = setup(policy, { kind: "openai", generate: vi.fn(async () => ({})) });
    await expect(live.runner.run(core)).rejects.toMatchObject({ code: "LIVE_DISABLED" });
    expect(live.generate).not.toHaveBeenCalled();
  });

  it("keeps per-principal concurrency across sessions, releasing only when supplier settles", async () => {
    const pending = deferred(); const run = setup(policy, pending.provider);
    const first = run.runner.run(core); const rejected = expect(first).rejects.toMatchObject({ code: "OUTPUT_REJECTED" });
    await pending.ready;
    run.access({ ...principal, sessionId: "second-session" });
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "CONCURRENCY_LIMIT" });
    expect(run.generate).toHaveBeenCalledTimes(1);
    pending.resolve({}); await rejected;
    expect(run.store.inspect(start, principal).active).toBe(0);
  });

  it("racing principals cannot overspend the last daily reservation", async () => {
    const pending = deferred();
    const run = setup({ ...policy, daily: { ...budget, calls: 1 } }, pending.provider);
    const first = run.runner.run(core); const rejected = expect(first).rejects.toMatchObject({ code: "OUTPUT_REJECTED" });
    await pending.ready; run.access({ principalId: "dev-b", sessionId: "b" });
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(run.generate).toHaveBeenCalledTimes(1);
    pending.resolve({}); await rejected;
  });

  it("enforces global concurrency independently of daily budgets", async () => {
    const pending = deferred(); const run = setup({ ...policy, maxConcurrent: 1 }, pending.provider);
    const first = run.runner.run(core); const rejected = expect(first).rejects.toMatchObject({ code: "OUTPUT_REJECTED" });
    await pending.ready; run.access({ principalId: "dev-b", sessionId: "b" });
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "CONCURRENCY_LIMIT" });
    pending.resolve({}); await rejected;
  });

  it("does not release a pending supplier lock when the caller cancels", async () => {
    const pending = deferred(); const run = setup(policy, pending.provider); const controller = new AbortController();
    const first = run.runner.run(core, { signal: controller.signal }); const cancelled = expect(first).rejects.toMatchObject({ code: "CANCELLED" });
    await pending.ready; controller.abort(); await cancelled;
    expect(run.store.inspect(start, principal).active).toBe(1);
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "CONCURRENCY_LIMIT" });
    pending.resolve({}); await new Promise(resolve => setTimeout(resolve, 0));
    expect(run.store.inspect(start, principal).active).toBe(0);
    expect(run.store.inspect(start, principal).daily.calls).toBe(1);
  });

  it.each(["refused", "incomplete", "failed"] as const)("retains attempted budget after %s without retry", async outcome => {
    const run = setup(policy, createMockNarrationProvider({ outcome }));
    await expect(run.runner.run(core)).rejects.toThrow();
    expect(run.store.inspect(start, principal).daily.calls).toBe(1);
    expect(run.store.inspect(start, principal).active).toBe(0);
    expect(run.generate).toHaveBeenCalledTimes(1);
  });

  it("UTC rollover resets daily counters but preserves session totals", async () => {
    const run = setup({ ...policy, daily: { ...budget, calls: 1 }, perSession: { ...budget, calls: 2 } });
    await run.runner.run(core);
    run.time(Date.parse("2026-10-24T00:00:00Z"));
    await run.runner.run(core);
    expect(run.store.inspect(Date.parse("2026-10-24T00:00:00Z"), principal).daily.calls).toBe(1);
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  });

  it("fails closed on backwards clocks and store failures without leaking errors", async () => {
    const run = setup(); await run.runner.run(core); run.time(start - 1);
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "CLOCK_INVALID" });
    const generate = vi.fn(mock.generate.bind(mock));
    const broken = createExperimentRunner({ policy, provider: { kind: "mock", generate }, environment: () => "development", now: () => start, resolveAccess: async () => principal,
      store: { reserve: () => { throw new Error("private secret"); } } });
    await expect(broken.run(core)).rejects.toMatchObject({ code: "STORE_UNAVAILABLE", message: "Experiment budget store is unavailable." });
    expect(generate).not.toHaveBeenCalled();
  });

  it("validates immutable policy, safe integers, identities and fixed-point rates", () => {
    for (const value of [{ ...policy, maxOutputTokens: -1 }, { ...policy, daily: { ...budget, tokens: NaN } }, { ...policy, maxConcurrent: 1.5 }, { ...policy, allowedPrincipalIds: ["a", "a"] }, { ...policy, rates: { ...policy.rates, inputMicroUsdPerMillionTokens: Infinity } }, { ...policy, rates: { ...policy.rates, outputMicroUsdPerMillionTokens: 0 } }]) {
      expect(() => setup(value)).toThrow("Experiment policy was rejected.");
    }
    const parsed = ExperimentPolicySchema.parse(policy);
    expect(Object.isFrozen(parsed.daily)).toBe(true);
    expect(quote.microUsd).toBe(quote.tokens + policy.maxOutputTokens);
  });

  it("defaults to denied access and hides resolver/environment exceptions", async () => {
    const generate = vi.fn(mock.generate.bind(mock));
    const base = { policy, provider: { kind: "mock" as const, generate }, store: new MemoryExperimentBudgetStore(), now: () => start };
    await expect(createExperimentRunner(base).run(core)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(createExperimentRunner({ ...base, environment: () => "development" }).run(core)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(createExperimentRunner({ ...base, environment: () => { throw new Error("private secret"); } }).run(core)).rejects.toMatchObject({ message: "Experiment access was denied." });
    await expect(createExperimentRunner({ ...base, environment: () => "development", resolveAccess: async () => { throw new Error("private secret"); } }).run(core)).rejects.toMatchObject({ message: "Experiment access was denied." });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rechecks expiry after async authorization and consumes nothing on pre-cancel", async () => {
    const run = setup(); const controller = new AbortController(); controller.abort();
    await expect(run.runner.run(core, { signal: controller.signal })).rejects.toMatchObject({ code: "CANCELLED" });
    expect(run.store.inspect(start, principal).daily.calls).toBe(0);
    let clock = start;
    const generate = vi.fn(mock.generate.bind(mock));
    const runner = createExperimentRunner({ policy, provider: { kind: "mock", generate }, store: run.store, environment: () => "development", now: () => clock,
      resolveAccess: async () => { clock = policy.expiresAt; return principal; } });
    await expect(runner.run(core)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(generate).not.toHaveBeenCalled();
    expect(run.store.inspect(start, principal).daily.calls).toBe(0);
  });

  it("cannot bypass principal budgets with a fresh server session", async () => {
    const run = setup({ ...policy, perPrincipalDaily: { ...budget, calls: 1 } });
    await run.runner.run(core); run.access({ ...principal, sessionId: "fresh-session" });
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
    expect(run.generate).toHaveBeenCalledTimes(1);
  });

  it("keeps active locks across UTC midnight and retains rejected-attempt counters", async () => {
    const pending = deferred(); const run = setup(policy, pending.provider);
    const first = run.runner.run(core); const failed = expect(first).rejects.toMatchObject({ code: "OUTPUT_REJECTED" });
    await pending.ready; const midnight = Date.parse("2026-10-24T00:00:00Z"); run.time(midnight);
    await expect(run.runner.run(core)).rejects.toMatchObject({ code: "CONCURRENCY_LIMIT" });
    expect(run.store.inspect(midnight, principal).daily.calls).toBe(0);
    pending.resolve({}); await failed;
    expect(run.store.inspect(start, principal).daily.calls).toBe(1);
    expect(run.store.inspect(midnight, principal).session.calls).toBe(1);
  });

  it("bounds ledger memory without evicting spent budget and makes release idempotent", () => {
    const store = new MemoryExperimentBudgetStore(3);
    const input = { now: start, access: principal, allocation: quote, policy: ExperimentPolicySchema.parse(policy) };
    const lease = store.reserve(input); lease.release(); lease.release();
    expect(store.inspect(start, principal).active).toBe(0);
    expect(() => store.reserve({ ...input, access: { ...principal, sessionId: "new" } })).toThrow("Experiment budget store is unavailable.");
    expect(store.inspect(start, principal).daily.calls).toBe(1);
    for (const allocation of [{ ...quote, calls: 0 }, { ...quote, tokens: -1 }, { ...quote, microUsd: Number.MAX_SAFE_INTEGER + 1 }])
      expect(() => store.reserve({ ...input, allocation })).toThrow("Experiment policy was rejected.");
  });

  it("keeps trusted policy snapshots and charges rounded-up simulated rates", async () => {
    const copy = structuredClone(policy); const run = setup(copy); copy.enabled = false; copy.daily.calls = 0;
    await run.runner.run(core);
    expect(run.generate).toHaveBeenCalledTimes(1);
    const fractional = quoteExperimentRequest(createNarrationRequest(core), ExperimentPolicySchema.parse({ ...policy, rates: { inputMicroUsdPerMillionTokens: 1, outputMicroUsdPerMillionTokens: 1 } }));
    expect(fractional.microUsd).toBe(2);
    expect(ExperimentPolicySchema.safeParse({ ...policy, daily: { ...budget, microUsd: 0.5 } }).success).toBe(false);
  });

  it("admits exactly the remaining budget during a simultaneous burst", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `burst-${i}`);
    const store = new MemoryExperimentBudgetStore(); const generate = vi.fn(mock.generate.bind(mock)); let caller = 0;
    const runner = createExperimentRunner({ policy: { ...policy, allowedPrincipalIds: ids, maxConcurrent: 32, daily: { ...budget, calls: 3 } },
      provider: { kind: "mock", generate }, store, environment: () => "development", now: () => start,
      resolveAccess: async () => ({ principalId: ids[caller++], sessionId: "session" }) });
    const results = await Promise.allSettled(ids.map(() => runner.run(core)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(3);
    const rejected = results.filter(result => result.status === "rejected");
    expect(rejected).toHaveLength(7);
    expect(rejected.every(result => result.reason.code === "BUDGET_EXCEEDED")).toBe(true);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(store.inspect(start, principal).daily.calls).toBe(3);
    expect(store.inspect(start, principal).active).toBe(0);
  });

  it("emits no network calls or raw input logs through the guarded mock", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("forbidden"));
    const log = vi.spyOn(console, "log"); const error = vi.spyOn(console, "error");
    await setup().runner.run(core);
    expect(fetch).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
  });

  it("uses the full request byte boundary including the server output cap", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ ...createNarrationRequest(core), max_output_tokens: policy.maxOutputTokens })).byteLength;
    const exact = setup({ ...policy, maxRequestBytes: bytes }); await exact.runner.run(core);
    expect(exact.generate).toHaveBeenCalledTimes(1);
    const over = setup({ ...policy, maxRequestBytes: bytes - 1 });
    await expect(over.runner.run(core)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect(over.store.inspect(start, principal).daily.calls).toBe(0);
  });
});
