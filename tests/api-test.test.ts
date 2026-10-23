import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiTestHandler } from "@/server/api-test";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { createPersonaMockProvider } from "@/infrastructure/llm/persona-mock";
import { createApprovedPersonaCatalog } from "@/domain/persona/catalog";

const secret = "synthetic-unlock-secret-for-tests-only-0001";
const origin = "http://127.0.0.1:3000";
let now = Date.parse("2026-10-23T00:00:00Z");
const make = (
  extra: Record<string, string | undefined> = {},
  provider = createPersonaMockProvider(),
) => {
  const env = {
    NODE_ENV: "development",
    API_TEST_LOCAL_ONLY: "true",
    DEV_TEST_SESSION_SECRET: secret,
    ...extra,
  };
  const generate = vi.spyOn(provider, "generate");
  return {
    handler: createApiTestHandler({
      environment: () => env,
      now: () => now,
      provider,
      catalog: createApiTestCatalog(),
    }),
    generate,
    env,
  };
};
function request(
  path: string,
  body?: unknown,
  cookie?: string,
  csrf?: string,
  extra: Record<string, string> = {},
) {
  return new Request(origin + "/api/dev/api-test/" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { "x-api-test-csrf": csrf } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function unlock(handler: ReturnType<typeof createApiTestHandler>) {
  const response = await handler(request("unlock", { secret }));
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const config = await handler(request("config", undefined, cookie));
  expect(config.status).toBe(200);
  return { cookie, config: await config.json() };
}
const body = (requestId = crypto.randomUUID()) => ({
  mode: "mock",
  scenario: "narration",
  fixtureId: "synthetic-known",
  featureId: "core-base",
  personaId: "synthetic-style",
  acknowledgedCost: false,
  requestId,
});
beforeEach(() => {
  now = Date.parse("2026-10-23T00:00:00Z");
});

describe("WBS-65 protected local API settings and Mock runs", () => {
  it("lists more than ten approved personas through the same configuration endpoint without provider calls", async () => {
    const source = createApiTestCatalog(),
      base = source.registry.load(source.selection("synthetic-style"));
    const profiles = Array.from({ length: 12 }, (_, i) => ({
      ...base,
      personaId: `synthetic-extra-${i}`,
      displayName: `추가 합성 프로필 ${i}`,
    }));
    const catalog = createApprovedPersonaCatalog(
      profiles.map((profile) => ({
        status: "approved",
        personaId: profile.personaId,
        personaVersion: profile.personaVersion,
        json: JSON.stringify(profile),
      })),
      profiles.map(({ personaId, personaVersion }) => ({ personaId, personaVersion })),
    );
    const provider = createPersonaMockProvider(),
      generate = vi.spyOn(provider, "generate");
    const { env } = make();
    const handler = createApiTestHandler({
      environment: () => env,
      now: () => now,
      provider,
      catalog: { ...source, ...catalog },
    });
    const { config } = await unlock(handler);
    expect(config.personas).toEqual(
      profiles.map((profile) => ({ id: profile.personaId, label: profile.displayName })),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses the selected formal revision in the Mock request and exported result metadata", async () => {
    const { handler, generate } = make(),
      { cookie, config } = await unlock(handler);
    const response = await handler(
      request("runs", { ...body(), personaId: "synthetic-formal" }, cookie, config.csrfToken),
    );
    expect(response.status).toBe(200);
    const run = await response.json();
    expect(run).toMatchObject({
      evidence: "MOCK_PASS",
      personaVersion: "1.0.1",
      result: { meta: { personaId: "synthetic-formal", personaVersion: "1.0.1" } },
    });
    const profile = JSON.parse(
      generate.mock.calls[0][0].messages[0].content.split("\n").at(-1)!,
    ).persona;
    expect(profile.voice).toMatchObject({
      register: "hapsyo",
      preferredExpressions: ["먼저 살펴보겠습니다"],
    });
    expect(profile.examples[0].prefer).toBe("제공된 근거만으로 확정할 수는 없습니다.");
  });

  it("requires an independent unlock session and returns no key/secret or raw birth input", async () => {
    const { handler, generate } = make({ OPENAI_API_KEY: "synthetic-api-value-not-a-real-key" });
    expect((await handler(request("config"))).status).toBe(401);
    const { cookie, config } = await unlock(handler);
    expect(config).toMatchObject({
      defaultMode: "mock",
      modelId: "gpt-4o-mini",
      keyStatus: "ready",
      liveAvailable: false,
      liveStatus: "LIVE_BLOCKED",
    });
    expect(cookie).not.toContain(secret);
    expect(JSON.stringify(config)).not.toMatch(
      /synthetic-api-value|synthetic-unlock-secret|birthDate/,
    );
    const response = await handler(request("runs", body(), cookie, config.csrfToken));
    expect(response.status).toBe(200);
    const run = await response.json();
    expect(run).toMatchObject({
      mode: "mock",
      status: "passed",
      evidence: "MOCK_PASS",
      inputTokens: null,
      outputTokens: null,
    });
    expect(run.result.meta).toMatchObject({ providerKind: "mock", modelId: "gpt-4o-mini" });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(run)).not.toMatch(
      /synthetic-api-value|synthetic-unlock-secret|"birthDate"|"birthTime"/,
    );
    expect((await handler(request("runs/" + run.testRunId, undefined, cookie))).status).toBe(200);
  });

  it.each([
    { NODE_ENV: "production" },
    { API_TEST_LOCAL_ONLY: "false" },
    { CI: "true" },
    { VERCEL: "1" },
  ])("hides every endpoint outside dedicated local development: %s", async (env) => {
    const { handler, generate } = make(env);
    for (const req of [request("config"), request("unlock", { secret }), request("runs", body())])
      expect((await handler(req)).status).toBe(404);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects remote hosts, forwarded remote peers, foreign origins and missing CSRF", async () => {
    const { handler, generate } = make();
    expect(
      (await handler(request("unlock", { secret }, undefined, undefined, { host: "example.test" })))
        .status,
    ).toBe(404);
    expect(
      (
        await handler(
          request("unlock", { secret }, undefined, undefined, { "x-forwarded-for": "203.0.113.1" }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handler(
          request("unlock", { secret }, undefined, undefined, { "x-real-ip": "203.0.113.1" }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await handler(
          request("unlock", { secret }, undefined, undefined, { origin: "https://evil.test" }),
        )
      ).status,
    ).toBe(403);
    const { cookie } = await unlock(handler);
    expect((await handler(request("runs", body(), cookie))).status).toBe(403);
    expect(generate).not.toHaveBeenCalled();
  });

  it("rate limits failed unlocks, rejects weak configuration, tampered and expired cookies", async () => {
    const { handler } = make();
    for (let i = 0; i < 5; i++)
      expect((await handler(request("unlock", { secret: "wrong" }))).status).toBe(403);
    expect((await handler(request("unlock", { secret }))).status).toBe(429);
    now += 61_000;
    const { cookie } = await unlock(handler);
    expect((await handler(request("config", undefined, cookie + "tamper"))).status).toBe(401);
    now += 1_800_001;
    expect((await handler(request("config", undefined, cookie))).status).toBe(401);
    expect(
      (
        await make({ DEV_TEST_SESSION_SECRET: "short" }).handler(
          request("unlock", { secret: "short" }),
        )
      ).status,
    ).toBe(503);
  });

  it("enforces per-session ownership, idempotency and changed-payload conflicts", async () => {
    const { handler, generate } = make();
    const first = await unlock(handler);
    const input = body();
    const response = await handler(request("runs", input, first.cookie, first.config.csrfToken));
    const run = await response.json();
    expect(
      await (await handler(request("runs", input, first.cookie, first.config.csrfToken))).json(),
    ).toEqual(run);
    expect(
      (
        await handler(
          request(
            "runs",
            { ...input, personaId: "synthetic-formal" },
            first.cookie,
            first.config.csrfToken,
          ),
        )
      ).status,
    ).toBe(409);
    const second = await unlock(handler);
    expect((await handler(request("runs/" + run.testRunId, undefined, second.cookie))).status).toBe(
      404,
    );
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("keeps Live blocked even with consent, flags and a synthetic configured key", async () => {
    const { handler, generate } = make({
      ENABLE_LIVE_API_TESTS: "true",
      OPENAI_API_KEY: "synthetic-api-value-not-a-real-key",
    });
    const { cookie, config } = await unlock(handler);
    for (const acknowledgedCost of [false, true]) {
      const result = await handler(
        request("runs", { ...body(), mode: "live", acknowledgedCost }, cookie, config.csrfToken),
      );
      expect(result.status).toBe(403);
      expect(await result.json()).toMatchObject({ evidence: "LIVE_BLOCKED" });
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects unapproved IDs, unimplemented scenarios/features, forged roles and oversized input", async () => {
    const { handler, generate } = make();
    const { cookie, config } = await unlock(handler);
    for (const patch of [
      { fixtureId: "private-user" },
      { personaId: "character-a" },
      { scenario: "report_stream" },
      { scenario: "follow_up" },
      { featureId: "F01" },
      { role: "admin" },
      { apiKey: "private" },
    ])
      expect(
        (await handler(request("runs", { ...body(), ...patch }, cookie, config.csrfToken))).status,
      ).toBeGreaterThanOrEqual(400);
    expect(
      (
        await handler(
          request("runs", { ...body(), extra: "가".repeat(5000) }, cookie, config.csrfToken),
        )
      ).status,
    ).toBe(413);
    expect(generate).not.toHaveBeenCalled();
  });

  it("uses the shared daily cap across newly unlocked sessions without spending on denials", async () => {
    const { handler, generate } = make({ LIVE_API_TEST_MAX_REQUESTS_PER_DAY: "1" });
    const first = await unlock(handler);
    expect(
      (await handler(request("runs", body(), first.cookie, first.config.csrfToken))).status,
    ).toBe(200);
    const second = await unlock(handler);
    expect(
      (await handler(request("runs", body(), second.cookie, second.config.csrfToken))).status,
    ).toBe(429);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("fails closed on malformed budget settings and sanitizes provider failures", async () => {
    const invalid = make({ LIVE_API_TEST_MAX_TOKENS_PER_DAY: "-1" });
    expect((await invalid.handler(request("unlock", { secret }))).status).toBe(503);
    const provider = {
      kind: "mock" as const,
      generate: async () => {
        throw new Error("private-upstream-secret");
      },
    };
    const { handler } = make({}, provider);
    const { cookie, config } = await unlock(handler);
    const response = await handler(request("runs", body(), cookie, config.csrfToken));
    expect(response.status).toBe(502);
    const run = await response.json();
    expect(run.status).toBe("failed");
    expect(JSON.stringify(run)).not.toContain("private-upstream");
  });

  it("blocks request races and new concurrent runs without double reservations", async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
    const base = createPersonaMockProvider();
    const { handler, generate } = make(
      {},
      {
        kind: "mock",
        async generate(request) {
          entered();
          await gate;
          return base.generate(request);
        },
      },
    );
    const { cookie, config } = await unlock(handler),
      input = body();
    const running = handler(request("runs", input, cookie, config.csrfToken));
    await ready;
    expect((await handler(request("runs", input, cookie, config.csrfToken))).status).toBe(409);
    expect((await handler(request("runs", body(), cookie, config.csrfToken))).status).toBe(409);
    expect(generate).toHaveBeenCalledTimes(1);
    release();
    expect((await running).status).toBe(200);
    expect((await handler(request("runs", input, cookie, config.csrfToken))).status).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("does not reserve or call the provider when even one request exceeds the token cap", async () => {
    const { handler, generate } = make({ LIVE_API_TEST_MAX_TOKENS_PER_DAY: "1" });
    const { cookie, config } = await unlock(handler);
    expect((await handler(request("runs", body(), cookie, config.csrfToken))).status).toBe(429);
    expect(generate).not.toHaveBeenCalled();
    expect((await (await handler(request("config", undefined, cookie))).json()).used).toEqual({
      calls: 0,
      tokens: 0,
    });
  });

  it("cancels a run without refunding reservations or prematurely unlocking the supplier", async () => {
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
    const base = createPersonaMockProvider();
    const { handler } = make(
      {},
      {
        kind: "mock",
        async generate(request) {
          entered();
          await gate;
          return base.generate(request);
        },
      },
    );
    const { cookie, config } = await unlock(handler);
    const controller = new AbortController();
    const running = handler(
      new Request(request("runs", body(), cookie, config.csrfToken), { signal: controller.signal }),
    );
    await ready;
    controller.abort();
    const result = await (await running).json();
    expect(result).toMatchObject({ status: "interrupted", errorCode: "CANCELLED" });
    expect((await handler(request("runs", body(), cookie, config.csrfToken))).status).toBe(409);
    expect((await (await handler(request("config", undefined, cookie))).json()).used.calls).toBe(1);
    release();
  });
});
