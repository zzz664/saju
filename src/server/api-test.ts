import { readBoundedUtf8, webBytes, BoundedInputError } from "@/infrastructure/io/bounded-utf8";

import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isLocalDevelopmentEnvironment, isLocalDeveloperRequest } from "@/server/developer-access";
import {
  apiTestLimits,
  apiTestPolicy,
  ApiTestRequestSchema,
  ApiTestConfigSchema,
  ApiTestRunSchema,
  type ApiTestConfig,
} from "@/application/dev-api-test";
import { createFeatureNarrationExperiment } from "@/application/narration/feature";
import { canonicalizeJson } from "@/domain/core-fingerprint";
import { ExperimentError } from "@/domain/experiment";
import { NarrationError, type NarrationProvider } from "@/domain/narration";
import { NarrationPlanError } from "@/domain/narration/plan";
import { NarrationRejection } from "@/domain/narration/render";
import { MemoryExperimentConcurrencyGate } from "@/infrastructure/llm/experiment-concurrency";
import { COMMON_SYSTEM_PROMPT_VERSION, R01_PLAN_CONTRACT_VERSION } from "@/domain/narration/prompt";
import type { createApiTestCatalog } from "@/server/api-test-catalog";
import { runLiveNarration } from "@/server/api-test-live";
import type { FileLiveBudget } from "@/infrastructure/openai/live-budget";
import type { LiveObservation } from "@/infrastructure/openai/narration";
import { PersonaError } from "@/domain/persona";
import { readOpenAiModel } from "@/server/openai-model";

const COOKIE = "saju_api_test";
const SessionSchema = z.strictObject({
  id: z.uuid(),
  csrf: z.string().regex(/^[a-f0-9]{64}$/),
  expires: z.number().int().positive(),
});
type Session = z.infer<typeof SessionSchema>;
type Env = Record<string, string | undefined>;
const responseHeaders = {
  "cache-control": "no-store, max-age=0",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};
const json = (value: unknown, status = 200, extra = {}) =>
  Response.json(value, { status, headers: { ...responseHeaders, ...extra } });
const error = (status: number, code: string, evidence?: string) =>
  json({ error: { code }, ...(evidence ? { evidence } : {}) }, status);
const equal = (left: string, right: string) =>
  timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest(),
  );
export function apiTestLocalEnvironment(env: Env) {
  return isLocalDevelopmentEnvironment(env) && env.API_TEST_LOCAL_ONLY === "true";
}
export function apiTestLocalRequest(request: Request) {
  return isLocalDeveloperRequest(request);
}
function signed(session: Session, secret: string) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return payload + "." + createHmac("sha256", secret).update(payload).digest("base64url");
}
function sessionFor(request: Request, secret: string, now: number): Session | null {
  const cookies =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((item) => item.trim())
      .filter((item) => item.startsWith(COOKIE + "=")) ?? [];
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(COOKIE.length + 1);
  if (token.length > 1024) return null;
  const [payload, signature, extra] = token.split(".");
  if (
    !payload ||
    !signature ||
    extra ||
    !equal(signature, createHmac("sha256", secret).update(payload).digest("base64url"))
  )
    return null;
  try {
    const parsed = SessionSchema.safeParse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return parsed.success && parsed.data.expires > now && parsed.data.expires <= now + 1_800_000
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}
async function bodyFor(request: Request): Promise<{ value: unknown } | { response: Response }> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return { response: error(415, "JSON_REQUIRED") };
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4096))
    return { response: error(413, "INPUT_TOO_LARGE") };
  if (!request.body) return { response: error(400, "INVALID_JSON") };
  try {
    return { value: JSON.parse(await readBoundedUtf8(webBytes(request.body), 4096)) };
  } catch (cause) {
    return {
      response:
        cause instanceof BoundedInputError && cause.code === "TOO_LARGE"
          ? error(413, "INPUT_TOO_LARGE")
          : error(400, "INVALID_JSON"),
    };
  }
}

type Run = {
  owner: string;
  digest: string;
  id: string;
  httpStatus: number;
  value: Record<string, unknown>;
};

/** Mock execution state is local; only Live uses a durable usage reservation ledger. */
export function createApiTestHandler(options: {
  environment: () => Env;
  now?: () => number;
  provider: NarrationProvider;
  catalog: ReturnType<typeof createApiTestCatalog>;
  live?: { budget: FileLiveBudget; transport?: typeof fetch };
}) {
  const now = options.now ?? Date.now,
    gate = new MemoryExperimentConcurrencyGate();
  const runs = new Map<string, Run>(),
    requests = new Map<string, Run>();
  let unlockWindow = 0,
    unlockAttempts = 0;
  return async function handle(request: Request): Promise<Response> {
    const env = options.environment();
    if (!apiTestLocalEnvironment(env) || !apiTestLocalRequest(request))
      return error(404, "NOT_FOUND");
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0) return error(503, "CLOCK_INVALID");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const expectedOrigin = "http://" + host;
    const origin = request.headers.get("origin"),
      site = request.headers.get("sec-fetch-site");
    if (
      ((request.method !== "GET" || origin) && origin !== expectedOrigin) ||
      (site && site !== "same-origin" && site !== "none")
    )
      return error(403, "ORIGIN_REJECTED");
    const secret = env.DEV_TEST_SESSION_SECRET;
    if (!secret || secret.length < 32 || secret.length > 256)
      return error(503, "UNLOCK_NOT_CONFIGURED");
    let limits;
    try {
      limits = apiTestLimits(env);
    } catch {
      limits = null;
    }
    let modelId: string;
    try {
      modelId = readOpenAiModel(env);
    } catch {
      return error(503, "MODEL_CONFIG_INVALID");
    }
    const path = new URL(request.url).pathname.replace(/^\/api\/dev\/api-test\//, "");
    if (path === "unlock" && request.method === "POST") {
      if (time - unlockWindow >= 60000) {
        unlockWindow = time;
        unlockAttempts = 0;
      }
      if (unlockAttempts >= 5) return error(429, "UNLOCK_RATE_LIMIT");
      unlockAttempts++;
      const raw = await bodyFor(request);
      if ("response" in raw) return raw.response;
      const input = z.strictObject({ secret: z.string().max(256) }).safeParse(raw.value);
      if (!input.success || !equal(input.data.secret, secret)) return error(403, "UNLOCK_REJECTED");
      unlockAttempts--;
      const session = {
        id: randomUUID(),
        csrf: randomBytes(32).toString("hex"),
        expires: time + 1_800_000,
      };
      return json({ unlocked: true }, 200, {
        "set-cookie": `${COOKIE}=${signed(session, secret)}; HttpOnly; SameSite=Strict; Path=/api/dev/api-test; Max-Age=1800`,
      });
    }
    const session = sessionFor(request, secret, time);
    if (!session) return error(401, "DEVELOPER_LOCKED");
    const access = { principalId: "local-developer", sessionId: session.id };
    const keyStatus =
      env.OPENAI_API_KEY &&
      env.OPENAI_API_KEY.trim().length >= 20 &&
      !/replace|placeholder|example/i.test(env.OPENAI_API_KEY)
        ? ("ready" as const)
        : ("missing" as const);
    let liveReason = !limits
      ? "LIMITS_INVALID"
      : env.ENABLE_LIVE_API_TESTS !== "true"
        ? "LIVE_FLAG_DISABLED"
        : keyStatus === "missing"
          ? "KEY_MISSING"
          : !options.live
            ? "LIVE_PROVIDER_UNAVAILABLE"
            : "READY";
    let liveUsed: { calls: number; tokens: number } | undefined;
    if (options.live) {
      try {
        liveUsed = options.live.budget.inspect(time);
      } catch {
        liveReason = "STORE_UNAVAILABLE";
      }
    }
    if (path === "config" && request.method === "GET") {
      const config: ApiTestConfig = {
        defaultMode: "mock",
        modelId,
        keyStatus,
        liveAvailable: liveReason === "READY",
        liveStatus: liveReason === "READY" ? "LIVE_NOT_RUN" : "LIVE_BLOCKED",
        liveReason,
        csrfToken: session.csrf,
        limits,
        ...(liveUsed && limits
          ? {
              liveUsed,
              liveRemaining: {
                calls: Math.max(0, limits.calls - liveUsed.calls),
                tokens: Math.max(0, limits.tokens - liveUsed.tokens),
              },
            }
          : {}),
        fixtures: options.catalog.fixtures,
        personas: options.catalog.personas,
        features: options.catalog.features,
      };
      return json(ApiTestConfigSchema.parse(config));
    }
    if (path.startsWith("runs/") && request.method === "GET") {
      const run = runs.get(path.slice(5));
      return run?.owner === session.id
        ? json(ApiTestRunSchema.parse(run.value))
        : error(404, "RUN_NOT_FOUND");
    }
    if (path !== "runs" || request.method !== "POST") return error(404, "NOT_FOUND");
    if (!equal(request.headers.get("x-api-test-csrf") ?? "", session.csrf))
      return error(403, "CSRF_REJECTED");
    const raw = await bodyFor(request);
    if ("response" in raw) return raw.response;
    const parsed = ApiTestRequestSchema.safeParse(raw.value);
    if (!parsed.success) return error(422, "INPUT_REJECTED");
    const input = parsed.data;
    if (
      !options.catalog.fixtures.some((item) => item.id === input.fixtureId) ||
      !options.catalog.personas.some((item) => item.id === input.personaId)
    )
      return error(422, "SELECTION_REJECTED");
    if (
      input.scenario !== "narration" ||
      !options.catalog.features.some((item) => item.id === input.featureId)
    )
      return error(409, "FEATURE_NOT_READY");
    const featureId = input.featureId as (typeof options.catalog.features)[number]["id"];
    if (input.mode === "live" && (!input.acknowledgedCost || liveReason !== "READY"))
      return error(403, !input.acknowledgedCost ? "COST_ACK_REQUIRED" : liveReason, "LIVE_BLOCKED");
    const selection = options.catalog.selection(input.personaId);
    const requestKey = session.id + ":" + input.requestId,
      digest = createHash("sha256").update(canonicalizeJson(input)).digest("hex");
    const previous = requests.get(requestKey);
    if (previous)
      return previous.digest !== digest
        ? error(409, "IDEMPOTENCY_CONFLICT")
        : previous.value.status === "running"
          ? error(409, "RUN_IN_PROGRESS")
          : json(ApiTestRunSchema.parse(previous.value), previous.httpStatus);
    if (runs.size >= 1000) return error(503, "RUN_STORE_FULL");
    const id = randomUUID(),
      run: Run = {
        owner: session.id,
        digest,
        id,
        httpStatus: 200,
        value: {
          testRunId: id,
          mode: input.mode,
          scenario: "narration",
          featureId,
          modelId,
          personaId: input.personaId,
          personaVersion: selection.personaVersion,
          promptVersion: R01_PLAN_CONTRACT_VERSION,
          commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION,
          schemaVersion: "2.0.0",
          status: "running",
          startedAt: new Date(time).toISOString(),
          inputTokens: null,
          outputTokens: null,
        },
      };
    runs.set(id, run);
    requests.set(requestKey, run);
    const observation: LiveObservation = {};
    try {
      const result =
        input.mode === "live"
          ? await runLiveNarration({
              catalog: options.catalog,
              fixtureId: input.fixtureId,
              featureId,
              selection,
              limits: limits!,
              model: modelId,
              key: createHash("sha256").update(requestKey).digest("hex"),
              apiKey: env.OPENAI_API_KEY!,
              budget: options.live!.budget,
              transport: options.live!.transport,
              now,
              signal: request.signal,
              observe: (value) => Object.assign(observation, value),
              allowed: () => {
                try {
                  const current = options.environment();
                  return (
                    apiTestLocalEnvironment(current) &&
                    current.ENABLE_LIVE_API_TESTS === "true" &&
                    current.OPENAI_API_KEY === env.OPENAI_API_KEY &&
                    readOpenAiModel(current) === modelId
                  );
                } catch {
                  return false;
                }
              },
            })
          : await createFeatureNarrationExperiment({
              ...options.catalog,
              model: modelId,
              selection,
              provider: options.provider,
              gate,
              policy: apiTestPolicy(time),
              now,
              environment: () =>
                apiTestLocalEnvironment(options.environment()) ? "development" : undefined,
              resolveAccess: async () => access,
            }).run(options.catalog.source(input.fixtureId, featureId), {
              signal: request.signal,
            });
      // Grounding passed (otherwise narrateFeature threw). Style is a score, never a failure.
      run.value = {
        ...run.value,
        status: "passed",
        evidence: input.mode === "live" ? "LIVE_PASS" : "MOCK_PASS",
        verdict: {
          groundingPassed: true,
          styleScore: result.styleEvaluation.score,
          styleIssueCount: result.styleEvaluation.issues.length,
        },
        expectedRegister: result.meta.register,
        styleIssues: result.styleEvaluation.issues,
        result,
      };
    } catch (cause) {
      const code =
        cause instanceof NarrationRejection
          ? `OUTPUT_REJECTED_${cause.code}`
          : cause instanceof ExperimentError ||
              cause instanceof NarrationError ||
              cause instanceof NarrationPlanError ||
              cause instanceof PersonaError
            ? cause.code
            : "EXECUTION_FAILED";
      if (cause instanceof NarrationRejection)
        run.value = { ...run.value, rejection: { code: cause.code, beatId: cause.beatId } };
      run.httpStatus =
        code === "BUDGET_EXCEEDED" || code === "RATE_LIMITED"
          ? 429
          : code === "CONCURRENCY_LIMIT"
            ? 409
            : code === "STORE_UNAVAILABLE"
              ? 503
              : 502;
      const blocked = input.mode === "live" && cause instanceof ExperimentError;
      run.value = {
        ...run.value,
        status: blocked ? "blocked" : code === "CANCELLED" ? "interrupted" : "failed",
        evidence:
          input.mode === "live" ? (blocked ? "LIVE_BLOCKED" : "LIVE_FAILED") : "MOCK_FAILED",
        errorCode: code,
      };
    }
    if (input.mode === "live")
      run.value = {
        ...run.value,
        inputTokens: observation.inputTokens ?? null,
        outputTokens: observation.outputTokens ?? null,
        ...(["completed", "failed", "incomplete", "cancelled", "queued", "in_progress"].includes(
          observation.providerStatus ?? "",
        )
          ? { providerStatus: observation.providerStatus }
          : {}),
      };
    run.value = {
      ...run.value,
      finishedAt: new Date(now()).toISOString(),
      durationMs: Math.max(0, now() - time),
    };
    return json(ApiTestRunSchema.parse(run.value), run.httpStatus);
  };
}
