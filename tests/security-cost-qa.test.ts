import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestHandler } from "@/server/api-test";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { createPersonaMockProvider } from "@/infrastructure/llm/persona-mock";
import { FileLiveBudget } from "@/infrastructure/openai/live-budget";

const secret = "synthetic-qa-session-secret-no-real-value-0001";
const key = "synthetic-qa-api-key-no-real-value-0001";
const privateText = "SYNTHETIC_PRIVATE_RESPONSE_SENTINEL";
const origin = "http://127.0.0.1:3000",
  now = Date.parse("2026-10-23T12:00:00Z");
const folders: string[] = [];
const catalog = createApiTestCatalog(),
  mock = createPersonaMockProvider();
function request(
  route: string,
  value?: unknown,
  cookie?: string,
  csrf?: string,
  extra: Record<string, string> = {},
) {
  return new Request(origin + "/api/dev/api-test/" + route, {
    method: value === undefined ? "GET" : "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-api-test-csrf": csrf } : {}),
      ...extra,
    },
    body: value === undefined ? undefined : JSON.stringify(value),
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
const envelope = (text: string) => ({
  id: "resp_security_synthetic",
  model: "gpt-4o-mini",
  status: "completed",
  usage: { input_tokens: 220, output_tokens: 80 },
  output: [
    {
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text }],
    },
  ],
});
async function complete(_url: Parameters<typeof fetch>[0], options?: RequestInit) {
  const requestBody = JSON.parse(String(options?.body));
  const generated = (await mock.generate(requestBody)) as { outputText: string };
  return Response.json(envelope(generated.outputText));
}
function setup(response: typeof fetch = complete, extra: Record<string, string | undefined> = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "saju-security-qa-"));
  folders.push(directory);
  const env = {
    NODE_ENV: "development",
    API_TEST_LOCAL_ONLY: "true",
    ENABLE_LIVE_API_TESTS: "true",
    OPENAI_API_KEY: key,
    DEV_TEST_SESSION_SECRET: secret,
    LIVE_API_TEST_MAX_REQUESTS_PER_DAY: "1",
    ...extra,
  };
  const transport = vi.fn<typeof fetch>(response),
    budget = new FileLiveBudget(directory);
  const createHandler = () =>
    createApiTestHandler({
      environment: () => env,
      now: () => now,
      provider: mock,
      catalog,
      live: { budget: new FileLiveBudget(directory), transport },
    });
  return { env, transport, budget, createHandler, handler: createHandler() };
}
async function unlock(handler: ReturnType<typeof createApiTestHandler>) {
  const response = await handler(request("unlock", { secret }));
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const config = await (await handler(request("config", undefined, cookie))).json();
  return { cookie, csrf: config.csrfToken as string };
}
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("External network forbidden in QA");
    }),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const directory of folders.splice(0)) {
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(tmpdir()) ||
      !path.basename(resolved).startsWith("saju-security-qa-")
    )
      throw new Error("Unexpected QA directory");
    rmSync(resolved, { recursive: true });
  }
});

describe("WBS-26 privacy and durable cost QA", () => {
  it.each([{ NODE_ENV: "production" }, { CI: "true" }, { VERCEL: "1" }, { VERCEL_ENV: "preview" }])(
    "blocks every developer API with key/Live enabled in %j without reading input or touching a ledger",
    async (extra) => {
      const { handler, transport, budget } = setup(complete, extra);
      const core = vi.spyOn(catalog, "core");
      for (const route of ["config", "unlock", "runs", "runs/synthetic-id"]) {
        const req = request(route, { ...input(), secret, raw: privateText });
        const response = await handler(req);
        expect(response.status).toBe(404);
        expect(req.bodyUsed).toBe(false);
        expect(await response.text()).not.toMatch(/SYNTHETIC_PRIVATE|synthetic-qa/);
      }
      expect(transport).not.toHaveBeenCalled();
      expect(core).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      expect(existsSync(budget.file)).toBe(false);
      expect(existsSync(budget.lock)).toBe(false);
    },
  );

  it("rejects raw inputs and sanitizes failed output while charging known usage and keeping secrets/prose out of logs and disk", async () => {
    const logs = ["log", "info", "warn", "error", "debug"].map((method) =>
      vi.spyOn(console, method as "log").mockImplementation(() => {}),
    );
    const { handler, transport, budget } = setup(async () => Response.json(envelope(privateText)));
    const session = await unlock(handler);
    const invalid = await handler(
      request(
        "runs",
        { ...input(), question: privateText, birthDate: "1900-01-01", apiKey: privateText },
        session.cookie,
        session.csrf,
      ),
    );
    expect(invalid.status).toBe(422);
    expect(transport).not.toHaveBeenCalled();
    expect(existsSync(budget.file)).toBe(false);
    const response = await handler(request("runs", input(), session.cookie, session.csrf));
    expect(response.status).toBe(502);
    const run = await response.json();
    expect(run).toMatchObject({
      errorCode: "OUTPUT_REJECTED",
      providerStatus: "completed",
      inputTokens: 220,
      outputTokens: 80,
    });
    expect(JSON.stringify(run)).not.toMatch(/SYNTHETIC_PRIVATE|synthetic-qa|resp_security/);
    const sent = JSON.parse(String(transport.mock.calls[0][1]!.body));
    expect(sent).toMatchObject({ store: false, stream: false });
    expect(JSON.stringify(sent)).not.toMatch(
      /birthDate|birthTime|2024-02-10|05:30|SYNTHETIC_PRIVATE/,
    );
    const ledger = readFileSync(budget.file, "utf8");
    expect(ledger).not.toMatch(/SYNTHETIC_PRIVATE|synthetic-qa|birthDate|paragraphs|instructions/);
    expect(Object.keys(JSON.parse(ledger).entries[0]).sort()).toEqual(
      [
        "day",
        "inputTokens",
        "key",
        "modelId",
        "outputTokens",
        "pending",
        "providerStatus",
        "responseId",
        "tokens",
      ].sort(),
    );
    expect(budget.inspect(now)).toEqual({ calls: 1, tokens: 300 });
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("prevents a paid replay with a valid old cookie after handler restart and shares the daily cap with new sessions", async () => {
    const { handler, createHandler, transport, budget } = setup();
    const session = await unlock(handler),
      value = input();
    expect((await handler(request("runs", value, session.cookie, session.csrf))).status).toBe(200);
    const before = readFileSync(budget.file, "utf8"),
      restarted = createHandler();
    const repeated = await restarted(request("runs", value, session.cookie, session.csrf));
    expect((await repeated.json()).errorCode).toBe("ACCESS_DENIED");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(readFileSync(budget.file, "utf8")).toBe(before);
    const fresh = await unlock(restarted);
    expect((await restarted(request("runs", input(), fresh.cookie, fresh.csrf))).status).toBe(429);
    expect(budget.inspect(now)).toEqual({ calls: 1, tokens: 300 });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("retains an unknown-usage reservation after a provider error across a restart without refund or retry", async () => {
    const { handler, createHandler, transport, budget } = setup(async () =>
      Response.json({ error: privateText }, { status: 500 }),
    );
    const session = await unlock(handler);
    const response = await handler(request("runs", input(), session.cookie, session.csrf));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(privateText);
    const reserved = budget.inspect(now);
    expect(reserved.calls).toBe(1);
    expect(reserved.tokens).toBeGreaterThan(1200);
    const restarted = createHandler(),
      fresh = await unlock(restarted);
    expect((await restarted(request("runs", input(), fresh.cookie, fresh.csrf))).status).toBe(429);
    expect(budget.inspect(now)).toEqual(reserved);
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
