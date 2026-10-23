import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApiTestHandler } from "@/server/api-test";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { createPersonaMockProvider } from "@/infrastructure/llm/persona-mock";
import { FileLiveBudget } from "@/infrastructure/openai/live-budget";
import {
  createOpenAiNarrationProvider,
  type LiveObservation,
} from "@/infrastructure/openai/narration";
import { preparePersonaNarration } from "@/domain/persona/narration";
import {
  apiTestRunHeading,
  apiTestStyleIssueMessage,
  ApiTestRunSchema,
} from "@/application/dev-api-test/index";
import { toOpenAiResponsesBody } from "@/infrastructure/openai/request";
import { promptFromWire } from "./helpers/openai-wire";

const folders: string[] = [],
  secret = "synthetic-unlock-secret-for-tests-only-0001",
  apiKey = "synthetic-key-never-used-for-network-0001";
const origin = "http://127.0.0.1:3000",
  now = Date.parse("2026-10-23T00:00:00Z");
function folder() {
  const dir = mkdtempSync(path.join(realpathSync(tmpdir()), "saju-live-unit-"));
  folders.push(dir);
  return dir;
}
afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of folders.splice(0)) {
    const resolved = realpathSync(dir);
    if (
      path.dirname(resolved) !== realpathSync(tmpdir()) ||
      !path.basename(resolved).startsWith("saju-live-unit-")
    )
      throw new Error("Unexpected test directory");
    rmSync(resolved, { recursive: true });
  }
});
const catalog = createApiTestCatalog(),
  mock = createPersonaMockProvider();
const context = preparePersonaNarration(catalog.core("synthetic-known"), {
  ...catalog,
  selection: { personaId: "synthetic-style", personaVersion: "1.0.0" },
});
const prompt = { ...context.request, maxOutputTokens: 1200 };
const requestBody = toOpenAiResponsesBody(prompt);
async function envelope(request = requestBody) {
  const result = (await mock.generate(promptFromWire(request))) as { outputText: string };
  return {
    id: "resp_synthetic",
    model: "gpt-4o-mini-2024-07-18",
    status: "completed",
    usage: { input_tokens: 100, output_tokens: 60, total_tokens: 160 },
    output: [
      {
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: result.outputText }],
      },
    ],
  };
}
function req(
  route: string,
  body?: unknown,
  cookie?: string,
  csrf?: string,
  extra: Record<string, string> = {},
) {
  return new Request(origin + "/api/dev/api-test/" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-api-test-csrf": csrf } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const input = () => ({
  mode: "live",
  scenario: "narration",
  fixtureId: "synthetic-known",
  featureId: "core-base",
  personaId: "synthetic-style",
  acknowledgedCost: true,
  requestId: crypto.randomUUID(),
});
function setup(
  extra: Record<string, string | undefined> = {},
  custom?: typeof fetch,
  directory = folder(),
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Real network forbidden in unit tests");
    }),
  );
  const env = {
    NODE_ENV: "development",
    API_TEST_LOCAL_ONLY: "true",
    DEV_TEST_SESSION_SECRET: secret,
    ENABLE_LIVE_API_TESTS: "true",
    OPENAI_API_KEY: apiKey,
    ...extra,
  };
  const transport = vi.fn<typeof fetch>(
    custom ??
      (async (_url, options) =>
        Response.json(await envelope(JSON.parse(String(options?.body))), {
          headers: { "x-request-id": "req_synthetic" },
        })),
  );
  const budget = new FileLiveBudget(directory);
  const handler = createApiTestHandler({
    environment: () => env,
    now: () => now,
    provider: mock,
    catalog,
    live: { budget, transport },
  });
  return { env, transport, handler, budget, directory };
}
async function unlock(handler: ReturnType<typeof createApiTestHandler>) {
  const unlocked = await handler(req("unlock", { secret }));
  expect(unlocked.status).toBe(200);
  const cookie = unlocked.headers.get("set-cookie")!.split(";")[0];
  const config = await (await handler(req("config", undefined, cookie))).json();
  return { cookie, config };
}

describe("WBS-66 Responses adapter with fake HTTP only", () => {
  it("sends the full shared R01 request, fixed endpoint, store:false and token cap with no retries", async () => {
    const { handler, transport, budget } = setup(),
      { cookie, config } = await unlock(handler);
    expect(config).toMatchObject({
      liveAvailable: true,
      liveStatus: "LIVE_NOT_RUN",
      defaultMode: "mock",
    });
    expect(transport).not.toHaveBeenCalled();
    const body = input(),
      response = await handler(req("runs", body, cookie, config.csrfToken)),
      run = await response.json();
    expect(response.status).toBe(200);
    expect(run).toMatchObject({
      mode: "live",
      evidence: "LIVE_PASS",
      status: "passed",
      inputTokens: 100,
      outputTokens: 60,
      providerStatus: "completed",
      verdict: { evidenceIdsValid: true, styleHeuristicPassed: true },
      result: { meta: { providerKind: "openai" } },
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options).toMatchObject({ method: "POST", redirect: "error" });
    expect(JSON.parse(String(options!.body))).toEqual(requestBody);
    expect(String(options!.body)).not.toMatch(/birthDate|birthTime|2024-02-10/);
    expect(JSON.stringify(run)).not.toMatch(
      /synthetic-key|synthetic-unlock|resp_synthetic|req_synthetic/,
    );
    expect(budget.inspect(now)).toEqual({ calls: 1, tokens: 160 });
    expect(await (await handler(req("runs", body, cookie, config.csrfToken))).json()).toEqual(run);
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await handler(req("runs/" + run.testRunId, undefined, cookie))).status).toBe(200);
  });
  it.each([
    [{ ENABLE_LIVE_API_TESTS: "false" }, "LIVE_FLAG_DISABLED"],
    [{ OPENAI_API_KEY: "" }, "KEY_MISSING"],
  ])("blocks gated Live without any transport call: %j", async (env, reason) => {
    const { handler, transport } = setup(env),
      { cookie, config } = await unlock(handler);
    expect(config.liveReason).toBe(reason);
    const response = await handler(req("runs", input(), cookie, config.csrfToken));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ evidence: "LIVE_BLOCKED" });
    expect(transport).not.toHaveBeenCalled();
  });
  it("requires session, consent, CSRF, trusted origin and approved synthetic selections", async () => {
    const { handler, transport } = setup(),
      { cookie, config } = await unlock(handler);
    expect((await handler(req("runs", input()))).status).toBe(401);
    expect((await handler(req("runs", input(), cookie))).status).toBe(403);
    expect(
      (
        await handler(
          req("runs", input(), cookie, config.csrfToken, { origin: "http://evil.test" }),
        )
      ).status,
    ).toBe(403);
    for (const patch of [
      { acknowledgedCost: false },
      { fixtureId: "real-user" },
      { personaId: "unapproved" },
      { scenario: "report_stream" },
      { featureId: "F01" },
      { role: "admin" },
    ])
      expect(
        (await handler(req("runs", { ...input(), ...patch }, cookie, config.csrfToken))).status,
      ).toBeGreaterThanOrEqual(400);
    expect(transport).not.toHaveBeenCalled();
  });
  it("propagates OPENAI_MODEL through config, Mock/Live requests, metadata and response validation", async () => {
    const model = "gpt-4.1-mini";
    const { handler, transport, budget } = setup({ OPENAI_MODEL: model }, async (_url, options) => {
      const sent = JSON.parse(String(options?.body));
      return Response.json({ ...(await envelope(sent)), model: model + "-2025-04-14" });
    });
    const { cookie, config } = await unlock(handler);
    expect(config).toMatchObject({ modelId: model, liveAvailable: true });
    const mockRun = await (
      await handler(req("runs", { ...input(), mode: "mock" }, cookie, config.csrfToken))
    ).json();
    const liveRun = await (await handler(req("runs", input(), cookie, config.csrfToken))).json();
    expect(liveRun).toMatchObject({
      evidence: "LIVE_PASS",
      modelId: model,
      result: { meta: { modelId: model } },
    });
    expect(mockRun).toMatchObject({
      evidence: "MOCK_PASS",
      modelId: model,
      result: { meta: { modelId: model } },
    });
    expect(mockRun.result.cache).toEqual(liveRun.result.cache);
    expect(JSON.parse(String(transport.mock.calls[0][1]!.body)).model).toBe(model);
    expect(budget.inspect(now)).toEqual({ calls: 1, tokens: 160 });
    expect(JSON.parse(readFileSync(budget.file, "utf8")).entries[0].modelId).toBe(model);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed server models and client model overrides without any provider call", async () => {
    const malformed = setup({ OPENAI_MODEL: "../invalid" });
    const rejected = await malformed.handler(req("unlock", { secret }));
    expect(rejected.status).toBe(503);
    expect(await rejected.json()).toMatchObject({ error: { code: "MODEL_CONFIG_INVALID" } });
    expect(malformed.transport).not.toHaveBeenCalled();
    const configured = setup({ OPENAI_MODEL: "gpt-4.1-mini" }),
      { cookie, config } = await unlock(configured.handler);
    expect(
      (
        await configured.handler(
          req("runs", { ...input(), model: "other" }, cookie, config.csrfToken),
        )
      ).status,
    ).toBe(422);
    expect(configured.transport).not.toHaveBeenCalled();
  });
  it("does not allow a configured model to accept another model's response", async () => {
    const { handler } = setup({ OPENAI_MODEL: "gpt-4.1-mini" }),
      { cookie, config } = await unlock(handler);
    const run = await (await handler(req("runs", input(), cookie, config.csrfToken))).json();
    expect(run).toMatchObject({
      evidence: "LIVE_FAILED",
      errorCode: "MODEL_MISMATCH",
      modelId: "gpt-4.1-mini",
    });
  });
  it("ignores reasoning metadata and validates only assistant output_text for a selected model", async () => {
    const model = "gpt-5-mini";
    const { handler } = setup({ OPENAI_MODEL: model }, async (_url, options) => {
      const response = await envelope(JSON.parse(String(options?.body)));
      return Response.json({
        ...response,
        model,
        output: [
          { type: "reasoning", summary: [{ type: "summary_text", text: "not prose" }] },
          ...response.output,
        ],
      });
    });
    const { cookie, config } = await unlock(handler);
    const run = await (await handler(req("runs", input(), cookie, config.csrfToken))).json();
    expect(run).toMatchObject({ evidence: "LIVE_PASS", modelId: model });
    expect(JSON.stringify(run)).not.toContain("not prose");
  });
  it.each([
    { CI: "true" },
    { NODE_ENV: "production" },
    { API_TEST_LOCAL_ONLY: "false" },
    { VERCEL_ENV: "preview" },
  ])("returns 404 and makes zero provider calls in %j", async (env) => {
    const { handler, transport } = setup(env);
    expect((await handler(req("runs", input()))).status).toBe(404);
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    [429, "RATE_LIMITED"],
    [500, "PROVIDER_FAILED"],
    [401, "PROVIDER_FAILED"],
  ])("sanitizes HTTP %i and keeps unknown usage reservations", async (status, code) => {
    const { handler, transport, budget } = setup({}, async () =>
        Response.json({ private: apiKey }, { status }),
      ),
      { cookie, config } = await unlock(handler);
    const result = await (await handler(req("runs", input(), cookie, config.csrfToken))).json();
    expect(result).toMatchObject({ evidence: "LIVE_FAILED", errorCode: code, inputTokens: null });
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(budget.inspect(now).tokens).toBeGreaterThan(1200);
  });
  it.each([
    ["incomplete", "INCOMPLETE"],
    ["failed", "PROVIDER_FAILED"],
    ["refusal", "REFUSED"],
    ["missingUsage", "USAGE_MISSING"],
    ["model", "MODEL_MISMATCH"],
    ["badJSON", "OUTPUT_REJECTED"],
    ["badEvidence", "OUTPUT_REJECTED"],
  ])("rejects %s while preserving known usage or its reservation", async (kind, code) => {
    const { handler, budget } = setup({}, async () => {
      const value = await envelope();
      if (kind === "incomplete" || kind === "failed") value.status = kind;
      if (kind === "model") value.model = "gpt-other";
      if (kind === "missingUsage") return Response.json({ ...value, usage: null });
      if (kind === "refusal")
        return Response.json({
          ...value,
          output: [{ type: "message", content: [{ type: "refusal", refusal: "private" }] }],
        });
      if (kind === "badJSON") value.output[0].content[0].text = "invalid";
      if (kind === "badEvidence") {
        const draft = JSON.parse(value.output[0].content[0].text);
        draft.sections[0].evidenceIds = ["forged"];
        value.output[0].content[0].text = JSON.stringify(draft);
      }
      return Response.json(value);
    });
    const { cookie, config } = await unlock(handler),
      result = await (await handler(req("runs", input(), cookie, config.csrfToken))).json();
    expect(result).toMatchObject({ evidence: "LIVE_FAILED", errorCode: code });
    if (kind === "missingUsage") expect(budget.inspect(now).tokens).toBeGreaterThan(1200);
    else expect(budget.inspect(now).tokens).toBe(160);
  });
  it("marks style failures separately from valid source IDs", async () => {
    const { handler } = setup({}, async () => {
      const value = await envelope(),
        draft = JSON.parse(value.output[0].content[0].text);
      draft.sections[0].paragraphs = ["반드시 성공합니다."];
      value.output[0].content[0].text = JSON.stringify(draft);
      return Response.json(value);
    });
    const { cookie, config } = await unlock(handler);
    const result = await (await handler(req("runs", input(), cookie, config.csrfToken))).json();
    expect(result).toMatchObject({
      status: "failed",
      evidence: "LIVE_FAILED",
      verdict: { evidenceIdsValid: true, styleHeuristicPassed: false },
    });
    expect(result.styleIssues).toEqual(
      expect.arrayContaining([
        { code: "REGISTER", sectionId: "overview" },
        { code: "CERTAINTY", sectionId: "overview" },
      ]),
    );
  });
  it("explains a completed API call with a formal/haeyo mismatch without hiding failure or retrying", async () => {
    const { handler, transport, budget } = setup({}, async (_url, options) => {
      const value = await envelope(JSON.parse(String(options?.body))),
        draft = JSON.parse(value.output[0].content[0].text);
      draft.sections[0].paragraphs = ["제공된 근거를 살펴보겠습니다. 확인된 범위만 설명합니다."];
      value.output[0].content[0].text = JSON.stringify(draft);
      return Response.json(value);
    });
    const { cookie, config } = await unlock(handler);
    const failed = ApiTestRunSchema.parse(
      await (await handler(req("runs", input(), cookie, config.csrfToken))).json(),
    );
    expect(failed).toMatchObject({
      status: "failed",
      evidence: "LIVE_FAILED",
      providerStatus: "completed",
      expectedRegister: "haeyo",
      inputTokens: 100,
      outputTokens: 60,
    });
    expect(failed.styleIssues).toEqual([{ code: "REGISTER", sectionId: "overview" }]);
    expect(apiTestRunHeading(failed)).toBe("API 호출 완료 · 문체 검사 미통과");
    expect(apiTestStyleIssueMessage("REGISTER", failed.expectedRegister)).toContain("해요체");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(budget.inspect(now)).toEqual({ calls: 1, tokens: 160 });
    const formal = await (
      await handler(
        req("runs", { ...input(), personaId: "synthetic-formal" }, cookie, config.csrfToken),
      )
    ).json();
    expect(formal).toMatchObject({
      evidence: "LIVE_PASS",
      expectedRegister: "hapsyo",
      styleIssues: [],
      personaVersion: "1.0.1",
      result: { meta: { personaVersion: "1.0.1" } },
    });
    const formalSent = JSON.parse(String(transport.mock.calls[1][1]!.body));
    const formalProfile = JSON.parse(formalSent.input[0].content.split("\n").at(-1)).persona;
    expect(formalProfile).toMatchObject({
      personaVersion: "1.0.1",
      voice: { register: "hapsyo", preferredExpressions: ["먼저 살펴보겠습니다"] },
      examples: [{ prefer: "제공된 근거만으로 확정할 수는 없습니다." }],
    });
    const sent = JSON.parse(String(transport.mock.calls[0][1]!.body));
    expect(sent.input[0].content).toContain("haeyo이면 해요체");
    expect(sent.input[0].content).toContain("sentencesPerParagraph");
    expect(failed.promptVersion).toBe("1.0.1");
  });
  it("compares Mock/Live with identical normalized data, profiles and prompts", async () => {
    const { handler, transport } = setup(),
      { cookie, config } = await unlock(handler);
    const mockRun = await (
      await handler(req("runs", { ...input(), mode: "mock" }, cookie, config.csrfToken))
    ).json();
    const liveRun = await (await handler(req("runs", input(), cookie, config.csrfToken))).json();
    expect(liveRun.result.sections).toEqual(mockRun.result.sections);
    expect(liveRun.result.cache).toEqual(mockRun.result.cache);
    expect(liveRun.result.limitations).toEqual(mockRun.result.limitations);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("holds the persistent lock after cancellation until the transport actually settles", async () => {
    let release!: () => void, entered!: () => void;
    const ready = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    const { handler, transport, budget } = setup({}, async () => {
      entered();
      await gate;
      return Response.json(await envelope());
    });
    const { cookie, config } = await unlock(handler),
      controller = new AbortController(),
      body = input();
    const running = handler(
      new Request(req("runs", body, cookie, config.csrfToken), { signal: controller.signal }),
    );
    await ready;
    expect((await handler(req("runs", body, cookie, config.csrfToken))).status).toBe(409);
    controller.abort();
    expect(await (await running).json()).toMatchObject({
      status: "interrupted",
      evidence: "LIVE_FAILED",
      errorCode: "CANCELLED",
    });
    expect(existsSync(budget.lock)).toBe(true);
    expect(
      await (await handler(req("runs", input(), cookie, config.csrfToken))).json(),
    ).toMatchObject({
      status: "blocked",
      evidence: "LIVE_BLOCKED",
      errorCode: "CONCURRENCY_LIMIT",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    release();
    await vi.waitFor(() => expect(existsSync(budget.lock)).toBe(false));
    expect(budget.inspect(now)).toEqual({ calls: 1, tokens: 160 });
  });
  it.each(["oversized", "invalidUsage", "truncated", "excessOutput"])(
    "rejects bounded response contract: %s",
    async (kind) => {
      const { handler, budget } = setup({}, async () => {
        if (kind === "oversized") return new Response("x".repeat(300000));
        if (kind === "truncated") return new Response("{");
        const value = await envelope();
        if (kind === "invalidUsage") value.usage.input_tokens = -1;
        if (kind === "excessOutput") value.usage.output_tokens = 1201;
        return Response.json(value);
      });
      const { cookie, config } = await unlock(handler);
      const result = await (await handler(req("runs", input(), cookie, config.csrfToken))).json();
      expect(result).toMatchObject({
        status: "failed",
        evidence: "LIVE_FAILED",
        errorCode: "OUTPUT_REJECTED",
      });
      expect(budget.inspect(now).tokens).toBeGreaterThan(1200);
    },
  );
  it("handles network failure, timeout and explicit cancellation without automatic retries", async () => {
    const observation: LiveObservation = {};
    const network = vi.fn<typeof fetch>(async () => {
      throw new Error(apiKey);
    });
    await expect(
      createOpenAiNarrationProvider({
        apiKey,
        transport: network,
        observe: (value) => Object.assign(observation, value),
      }).generate(prompt),
    ).rejects.toMatchObject({ code: "PROVIDER_FAILED" });
    expect(network).toHaveBeenCalledTimes(1);
    const aborting: typeof fetch = async (_url, options) =>
      new Promise((_, reject) => {
        options!.signal!.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      });
    await expect(
      createOpenAiNarrationProvider({
        apiKey,
        transport: aborting,
        timeoutMs: 5,
        observe() {},
      }).generate(prompt),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    const controller = new AbortController();
    controller.abort();
    const spy = vi.fn(aborting);
    await expect(
      createOpenAiNarrationProvider({ apiKey, transport: spy, observe() {} }).generate(prompt, {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("durable local Live reservation ledger", () => {
  const key = "a".repeat(64),
    another = "b".repeat(64);
  const reservation = (keyValue = key) => ({
    now,
    key: keyValue,
    tokens: 1000,
    callsLimit: 1,
    tokensLimit: 2000,
  });
  it("persists across handler/session/restart boundaries and rejects duplicate spend", () => {
    const dir = folder(),
      first = new FileLiveBudget(dir);
    first
      .reserve(reservation())
      .finish({ inputTokens: 120, outputTokens: 80, responseId: "resp_synthetic" });
    const restarted = new FileLiveBudget(dir);
    expect(restarted.inspect(now)).toEqual({ calls: 1, tokens: 200 });
    expect(() => restarted.reserve(reservation(another))).toThrowError(
      expect.objectContaining({ code: "BUDGET_EXCEEDED" }),
    );
    expect(() => restarted.reserve({ ...reservation(), callsLimit: 5 })).toThrowError(
      expect.objectContaining({ code: "ACCESS_DENIED" }),
    );
    expect(JSON.stringify(JSON.parse(readFileSync(first.file, "utf8")))).not.toMatch(
      /birthDate|apiKey|paragraphs/,
    );
  });
  it("enforces atomic cross-instance concurrency and holds reservations when usage is missing", () => {
    const dir = folder(),
      first = new FileLiveBudget(dir),
      second = new FileLiveBudget(dir),
      lease = first.reserve(reservation());
    expect(() => second.reserve(reservation(another))).toThrowError(
      expect.objectContaining({ code: "CONCURRENCY_LIMIT" }),
    );
    lease.finish({});
    expect(second.inspect(now)).toEqual({ calls: 1, tokens: 1000 });
    expect(existsSync(first.lock)).toBe(false);
  });
  it("blocks over-budget calls before HTTP and across a newly unlocked session", async () => {
    const { handler, transport, directory } = setup({ LIVE_API_TEST_MAX_REQUESTS_PER_DAY: "1" });
    const first = await unlock(handler);
    expect((await handler(req("runs", input(), first.cookie, first.config.csrfToken))).status).toBe(
      200,
    );
    const resumed = setup({ LIVE_API_TEST_MAX_REQUESTS_PER_DAY: "1" }, undefined, directory),
      second = await unlock(resumed.handler);
    expect(
      (await resumed.handler(req("runs", input(), second.cookie, second.config.csrfToken))).status,
    ).toBe(429);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(resumed.transport).not.toHaveBeenCalled();
  });
  it("denies a single request exceeding the cap without reserving or sending", async () => {
    const { handler, budget, transport } = setup({ LIVE_API_TEST_MAX_TOKENS_PER_DAY: "1" }),
      { cookie, config } = await unlock(handler);
    expect((await handler(req("runs", input(), cookie, config.csrfToken))).status).toBe(429);
    expect(budget.inspect(now)).toEqual({ calls: 0, tokens: 0 });
    expect(transport).not.toHaveBeenCalled();
  });
  it("fails closed on corrupt records, crash locks, clock rollback and missing reservations", () => {
    const dir = folder(),
      budget = new FileLiveBudget(dir);
    writeFileSync(budget.file, "invalid");
    expect(() => budget.inspect(now)).toThrowError(
      expect.objectContaining({ code: "STORE_UNAVAILABLE" }),
    );
    writeFileSync(budget.file, JSON.stringify({ version: 1, lastNow: now + 1, entries: [] }));
    expect(() => budget.reserve(reservation())).toThrowError(
      expect.objectContaining({ code: "CLOCK_INVALID" }),
    );
    writeFileSync(budget.lock, "");
    expect(() => budget.reserve(reservation())).toThrowError(
      expect.objectContaining({ code: "CONCURRENCY_LIMIT" }),
    );
  });
  it("does not unlock or refund after settlement persistence fails", () => {
    const dir = folder(),
      budget = new FileLiveBudget(dir),
      lease = budget.reserve(reservation());
    expect(() => lease.finish({ inputTokens: -1, outputTokens: 0 })).toThrowError(
      expect.objectContaining({ code: "STORE_UNAVAILABLE" }),
    );
    expect(existsSync(budget.lock)).toBe(true);
    expect(budget.inspect(now)).toEqual({ calls: 1, tokens: 1000 });
  });
  it("charges known overrun usage rather than truncating it to the original reservation", () => {
    const budget = new FileLiveBudget(folder());
    budget.reserve(reservation()).finish({ inputTokens: 1500, outputTokens: 800 });
    expect(budget.inspect(now)).toEqual({ calls: 1, tokens: 2300 });
    expect(() => budget.reserve({ ...reservation(another), callsLimit: 5 })).toThrowError(
      expect.objectContaining({ code: "BUDGET_EXCEEDED" }),
    );
  });
});
