import { describe, expect, it, vi } from "vitest";
import { createExperimentRunner } from "@/application/narration/experiment";
import { narrateFeature, prepareFeatureNarration } from "@/application/narration/feature";
import { ExperimentPolicySchema } from "@/domain/experiment";
import type { NarrationProvider } from "@/domain/narration";
import { createPlanMockProvider } from "@/infrastructure/llm/plan-mock";
import { MemoryExperimentConcurrencyGate } from "@/infrastructure/llm/experiment-concurrency";
import { createApiTestCatalog } from "@/server/api-test-catalog";

const catalog = createApiTestCatalog();
const narrationOptions = { ...catalog, selection: catalog.selection("synthetic-style") };
const source = catalog.source("synthetic-known", "F03");
const execute = (
  value: unknown,
  provider: NarrationProvider,
  control: { readonly signal?: AbortSignal },
) => narrateFeature(value, provider, narrationOptions, control);
const request = () => prepareFeatureNarration(source, narrationOptions).request;
const start = Date.parse("2026-10-23T12:00:00Z");
const policy = {
  enabled: true,
  expiresAt: start + 86400000,
  allowedPrincipalIds: ["dev-a", "dev-b"],
  maxRequestBytes: 131072,
  maxConcurrent: 2,
};
const principal = { principalId: "dev-a", sessionId: "session-a" };
const mock = createPlanMockProvider();
function setup(p: unknown = policy, provider: NarrationProvider = mock) {
  let now = start;
  let access: unknown = principal;
  let environment = "development";
  const gate = new MemoryExperimentConcurrencyGate();
  const generate = vi.fn(provider.generate.bind(provider));
  const runner = createExperimentRunner({
    execute,
    policy: p,
    provider: { ...provider, generate },
    gate,
    environment: () => environment,
    now: () => now,
    resolveAccess: async () => access,
  });
  return {
    runner,
    gate,
    generate,
    time: (n: number) => {
      now = n;
    },
    access: (v: unknown) => {
      access = v;
    },
    environment: (v: string) => {
      environment = v;
    },
  };
}
function deferred() {
  let resolve!: (value: unknown) => void;
  let started!: () => void;
  const ready = new Promise<void>((done) => {
    started = done;
  });
  const result = new Promise<unknown>((done) => {
    resolve = done;
  });
  const provider: NarrationProvider = {
    kind: "mock",
    generate: async () => {
      started();
      return result;
    },
  };
  return { provider, ready, resolve };
}

describe("local Mock access and concurrency without usage budgets", () => {
  it("allows repeated full-catalog calls without token caps or usage reservations", async () => {
    const run = setup();
    for (let i = 0; i < 20; i++)
      expect((await run.runner.run(source)).sourceStatus).toBe("partial");
    expect(run.generate).toHaveBeenCalledTimes(20);
    expect(run.generate.mock.calls[0][0]).toEqual(request());
    expect(run.generate.mock.calls[0][0].maxOutputTokens).toBeUndefined();
  });
  it.each(["production", "test", "", "preview"])(
    "denies %s before provider invocation",
    async (env) => {
      const run = setup();
      run.environment(env);
      await expect(run.runner.run(source)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      expect(run.generate).not.toHaveBeenCalled();
    },
  );
  it.each([
    null,
    {},
    { principalId: "other", sessionId: "s" },
    { ...principal, role: "admin" },
    { ...principal, sessionId: "" },
  ])("rejects absent/unapproved/forged access", async (access) => {
    const run = setup();
    run.access(access);
    await expect(run.runner.run(source)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(run.generate).not.toHaveBeenCalled();
  });
  it("disables experiments and expires approval at the exact timestamp", async () => {
    await expect(setup({ ...policy, enabled: false }).runner.run(source)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    const expired = setup();
    expired.time(policy.expiresAt);
    await expect(expired.runner.run(source)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(expired.generate).not.toHaveBeenCalled();
  });
  it("rejects forged source fields and Live providers before invocation", async () => {
    const run = setup();
    await expect(run.runner.run({ ...source, userId: "dev-a" })).rejects.toMatchObject({
      code: "INPUT_REJECTED",
    });
    expect(run.generate).not.toHaveBeenCalled();
    const live = setup(policy, { kind: "openai", generate: vi.fn(async () => ({})) });
    await expect(live.runner.run(source)).rejects.toMatchObject({ code: "LIVE_DISABLED" });
    expect(live.generate).not.toHaveBeenCalled();
  });
  it("keeps the byte-size resource boundary independently of financial budgets", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(request())).byteLength;
    const exact = setup({ ...policy, maxRequestBytes: bytes });
    await exact.runner.run(source);
    expect(exact.generate).toHaveBeenCalledTimes(1);
    const over = setup({ ...policy, maxRequestBytes: bytes - 1 });
    await expect(over.runner.run(source)).rejects.toMatchObject({ code: "REQUEST_TOO_LARGE" });
    expect(over.generate).not.toHaveBeenCalled();
  });
  it("keeps per-principal concurrency across sessions until the provider settles", async () => {
    const pending = deferred();
    const run = setup(policy, pending.provider);
    const first = run.runner.run(source);
    const rejected = expect(first).rejects.toMatchObject({ code: "OUTPUT_REJECTED" });
    await pending.ready;
    run.access({ ...principal, sessionId: "second-session" });
    await expect(run.runner.run(source)).rejects.toMatchObject({ code: "CONCURRENCY_LIMIT" });
    expect(run.generate).toHaveBeenCalledTimes(1);
    pending.resolve({});
    await rejected;
    const lease = run.gate.acquire(principal.principalId, 2);
    lease.release();
    lease.release();
  });
  it("enforces global concurrency for different principals", async () => {
    const pending = deferred();
    const run = setup({ ...policy, maxConcurrent: 1 }, pending.provider);
    const first = run.runner.run(source);
    const rejected = expect(first).rejects.toMatchObject({ code: "OUTPUT_REJECTED" });
    await pending.ready;
    run.access({ principalId: "dev-b", sessionId: "session-b" });
    await expect(run.runner.run(source)).rejects.toMatchObject({ code: "CONCURRENCY_LIMIT" });
    pending.resolve({});
    await rejected;
  });
  it("keeps a cancelled call locked until its underlying provider settles", async () => {
    const pending = deferred();
    const run = setup(policy, pending.provider);
    const controller = new AbortController();
    const first = run.runner.run(source, { signal: controller.signal });
    const cancelled = expect(first).rejects.toMatchObject({ code: "CANCELLED" });
    await pending.ready;
    controller.abort();
    await cancelled;
    await expect(run.runner.run(source)).rejects.toMatchObject({ code: "CONCURRENCY_LIMIT" });
    pending.resolve({});
    await new Promise((resolve) => setTimeout(resolve, 0));
    const lease = run.gate.acquire(principal.principalId, 2);
    lease.release();
  });
  it.each(["refused", "incomplete", "failed"] as const)(
    "releases concurrency after %s without retry",
    async (outcome) => {
      const run = setup(policy, createPlanMockProvider({ outcome }));
      await expect(run.runner.run(source)).rejects.toThrow();
      expect(run.generate).toHaveBeenCalledTimes(1);
      const lease = run.gate.acquire(principal.principalId, 2);
      lease.release();
    },
  );
  it("rejects malformed policies and keeps a trusted immutable snapshot", async () => {
    for (const value of [
      { ...policy, maxRequestBytes: -1 },
      { ...policy, maxConcurrent: 1.5 },
      { ...policy, allowedPrincipalIds: ["a", "a"] },
    ])
      expect(() => setup(value)).toThrow("Experiment policy was rejected.");
    const copy = structuredClone(policy);
    const run = setup(copy);
    copy.enabled = false;
    copy.allowedPrincipalIds.length = 0;
    await run.runner.run(source);
    expect(run.generate).toHaveBeenCalledTimes(1);
    expect(Object.keys(ExperimentPolicySchema.parse(policy)).sort()).toEqual([
      "allowedPrincipalIds",
      "enabled",
      "expiresAt",
      "maxConcurrent",
      "maxRequestBytes",
    ]);
  });
  it("defaults to denied access and sanitizes resolver, clock and gate errors", async () => {
    const generate = vi.fn(mock.generate.bind(mock));
    const base = {
      policy,
      provider: { kind: "mock" as const, generate },
      gate: new MemoryExperimentConcurrencyGate(),
      now: () => start,
      execute,
    };
    await expect(createExperimentRunner(base).run(source)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      createExperimentRunner({ ...base, environment: () => "development" }).run(source),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(
      createExperimentRunner({
        ...base,
        environment: () => {
          throw new Error("private secret");
        },
      }).run(source),
    ).rejects.toMatchObject({ message: "Experiment access was denied." });
    await expect(
      createExperimentRunner({
        ...base,
        environment: () => "development",
        resolveAccess: async () => {
          throw new Error("private secret");
        },
      }).run(source),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const broken = setup();
    broken.time(NaN);
    await expect(broken.runner.run(source)).rejects.toMatchObject({ code: "CLOCK_INVALID" });
    await expect(
      createExperimentRunner({
        ...base,
        environment: () => "development",
        resolveAccess: async () => principal,
        gate: {
          acquire() {
            throw new Error("private secret");
          },
        },
      }).run(source),
    ).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("rechecks expiry after authorization and respects pre-cancellation", async () => {
    const run = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(run.runner.run(source, { signal: controller.signal })).rejects.toMatchObject({
      code: "CANCELLED",
    });
    let clock = start;
    const generate = vi.fn(mock.generate.bind(mock));
    const runner = createExperimentRunner({
      execute,
      policy,
      provider: { kind: "mock", generate },
      gate: run.gate,
      environment: () => "development",
      now: () => clock,
      resolveAccess: async () => {
        clock = policy.expiresAt;
        return principal;
      },
    });
    await expect(runner.run(source)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    expect(generate).not.toHaveBeenCalled();
  });
  it("emits no network calls or raw input logs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("forbidden"));
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    await setup().runner.run(source);
    expect(fetch).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
