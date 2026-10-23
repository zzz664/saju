import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isLocalDeveloperHost } from "./developer-analysis";
import { apiTestLimits, apiTestPolicy, ApiTestRequestSchema, ApiTestConfigSchema, ApiTestRunSchema, type ApiTestConfig } from "../application/dev-api-test/index";
import { createPersonaExperiment } from "../application/narration/persona";
import { canonicalizeJson } from "../domain/core-fingerprint/index";
import { ExperimentError } from "../domain/experiment/index";
import { NarrationError, type NarrationProvider } from "../domain/narration/index";
import { MemoryExperimentBudgetStore } from "../infrastructure/llm/experiment-budget";
import { PERSONA_PROMPT_VERSION, COMMON_SYSTEM_PROMPT_VERSION } from "../domain/persona/prompt";
import type { createApiTestCatalog } from "./api-test-catalog";

const COOKIE = "saju_api_test";
const SessionSchema = z.strictObject({ id: z.uuid(), csrf: z.string().regex(/^[a-f0-9]{64}$/), expires: z.number().int().positive() });
type Session = z.infer<typeof SessionSchema>;
type Env = Record<string, string | undefined>;
const responseHeaders = { "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex, nofollow", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const json = (value: unknown, status = 200, extra = {}) => Response.json(value, { status, headers: { ...responseHeaders, ...extra } });
const error = (status: number, code: string, evidence?: string) => json({ error: { code }, ...(evidence ? { evidence } : {}) }, status);
const equal = (left: string, right: string) => timingSafeEqual(createHash("sha256").update(left).digest(), createHash("sha256").update(right).digest());
export function apiTestLocalEnvironment(env: Env) {
  return env.NODE_ENV === "development" && env.API_TEST_LOCAL_ONLY === "true" && !env.CI && !env.VERCEL && !env.VERCEL_ENV;
}
export function apiTestLocalRequest(request: Request) {
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (!isLocalDeveloperHost(host)) return false;
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded && !forwarded.split(",").every(peer => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer.trim()))) return false;
  const realPeer = request.headers.get("x-real-ip");
  if (realPeer && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(realPeer)) return false;
  const forwardedHost = request.headers.get("x-forwarded-host");
  return !request.headers.has("forwarded") && (!forwardedHost || forwardedHost === host);
}
function signed(session: Session, secret: string) {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  return payload + "." + createHmac("sha256", secret).update(payload).digest("base64url");
}
function sessionFor(request: Request, secret: string, now: number): Session | null {
  const cookies = request.headers.get("cookie")?.split(";").map(item => item.trim()).filter(item => item.startsWith(COOKIE + "=")) ?? [];
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(COOKIE.length + 1); if (token.length > 1024) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !equal(signature, createHmac("sha256", secret).update(payload).digest("base64url"))) return null;
  try { const parsed = SessionSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return parsed.success && parsed.data.expires > now && parsed.data.expires <= now + 1_800_000 ? parsed.data : null;
  } catch { return null; }
}
async function bodyFor(request: Request): Promise<{ value: unknown } | { response: Response }> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return { response: error(415, "JSON_REQUIRED") };
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > 4096)) return { response: error(413, "INPUT_TOO_LARGE") };
  const reader = request.body?.getReader(); if (!reader) return { response: error(400, "INVALID_JSON") };
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 4096) { await reader.cancel(); return { response: error(413, "INPUT_TOO_LARGE") }; } chunks.push(value); }
    const data = Buffer.concat(chunks); return { value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) };
  } catch { return { response: error(400, "INVALID_JSON") }; } finally { reader.releaseLock(); }
}
type Run = { owner: string; digest: string; id: string; httpStatus: number; value: Record<string, unknown> };

/** Single-process Mock state only. No live executor or distributed/durable budget claim. */
export function createApiTestHandler(options: { environment: () => Env; now?: () => number; provider: NarrationProvider; catalog: ReturnType<typeof createApiTestCatalog> }) {
  const now = options.now ?? Date.now, store = new MemoryExperimentBudgetStore();
  const runs = new Map<string, Run>(), requests = new Map<string, Run>();
  let unlockWindow = 0, unlockAttempts = 0;
  return async function handle(request: Request): Promise<Response> {
    const env = options.environment();
    if (!apiTestLocalEnvironment(env) || !apiTestLocalRequest(request)) return error(404, "NOT_FOUND");
    const time = now(); if (!Number.isSafeInteger(time) || time < 0) return error(503, "CLOCK_INVALID");
    const host = request.headers.get("host") ?? new URL(request.url).host;
    const expectedOrigin = "http://" + host;
    const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    if ((request.method !== "GET" || origin) && origin !== expectedOrigin || site && site !== "same-origin" && site !== "none") return error(403, "ORIGIN_REJECTED");
    const secret = env.DEV_TEST_SESSION_SECRET;
    if (!secret || secret.length < 32 || secret.length > 256) return error(503, "UNLOCK_NOT_CONFIGURED");
    let limits; try { limits = apiTestLimits(env); } catch { return error(503, "LIMITS_INVALID"); }
    const path = new URL(request.url).pathname.replace(/^\/api\/dev\/api-test\//, "");
    if (path === "unlock" && request.method === "POST") {
      if (time - unlockWindow >= 60000) { unlockWindow = time; unlockAttempts = 0; }
      if (unlockAttempts >= 5) return error(429, "UNLOCK_RATE_LIMIT"); unlockAttempts++;
      const raw = await bodyFor(request); if ("response" in raw) return raw.response;
      const input = z.strictObject({ secret: z.string().max(256) }).safeParse(raw.value);
      if (!input.success || !equal(input.data.secret, secret)) return error(403, "UNLOCK_REJECTED");
      unlockAttempts--;
      const session = { id: randomUUID(), csrf: randomBytes(32).toString("hex"), expires: time + 1_800_000 };
      return json({ unlocked: true }, 200, { "set-cookie": `${COOKIE}=${signed(session, secret)}; HttpOnly; SameSite=Strict; Path=/api/dev/api-test; Max-Age=1800` });
    }
    const session = sessionFor(request, secret, time); if (!session) return error(401, "DEVELOPER_LOCKED");
    const access = { principalId: "local-developer", sessionId: session.id };
    const keyStatus = env.OPENAI_API_KEY && env.OPENAI_API_KEY.trim().length >= 20 && !/replace|placeholder|example/i.test(env.OPENAI_API_KEY) ? "ready" as const : "missing" as const;
    const liveReason = env.OPENAI_MODEL && env.OPENAI_MODEL !== "gpt-4o-mini" ? "MODEL_NOT_ALLOWED" : env.ENABLE_LIVE_API_TESTS !== "true" ? "LIVE_FLAG_DISABLED" : keyStatus === "missing" ? "KEY_MISSING" : "WBS_66_REQUIRED";
    if (path === "config" && request.method === "GET") {
      const used = store.inspect(time, access).daily;
      const config: ApiTestConfig = { defaultMode: "mock", modelId: "gpt-4o-mini", keyStatus, liveAvailable: false, liveStatus: "LIVE_BLOCKED", liveReason, csrfToken: session.csrf, limits,
        used: { calls: used.calls, tokens: used.tokens }, remaining: { calls: Math.max(0, limits.calls - used.calls), tokens: Math.max(0, limits.tokens - used.tokens) },
        fixtures: options.catalog.fixtures, personas: options.catalog.personas };
      return json(ApiTestConfigSchema.parse(config));
    }
    if (path.startsWith("runs/") && request.method === "GET") {
      const run = runs.get(path.slice(5)); return run?.owner === session.id ? json(ApiTestRunSchema.parse(run.value)) : error(404, "RUN_NOT_FOUND");
    }
    if (path !== "runs" || request.method !== "POST") return error(404, "NOT_FOUND");
    if (!equal(request.headers.get("x-api-test-csrf") ?? "", session.csrf)) return error(403, "CSRF_REJECTED");
    const raw = await bodyFor(request); if ("response" in raw) return raw.response;
    const parsed = ApiTestRequestSchema.safeParse(raw.value); if (!parsed.success) return error(422, "INPUT_REJECTED");
    const input = parsed.data;
    if (!options.catalog.fixtures.some(item => item.id === input.fixtureId) || !options.catalog.personas.some(item => item.id === input.personaId)) return error(422, "SELECTION_REJECTED");
    if (input.scenario !== "narration" || input.featureId !== "core-base") return error(409, "FEATURE_NOT_READY");
    if (input.mode === "live") return error(403, !input.acknowledgedCost ? "COST_ACK_REQUIRED" : liveReason, "LIVE_BLOCKED");
    const requestKey = session.id + ":" + input.requestId, digest = createHash("sha256").update(canonicalizeJson(input)).digest("hex");
    const previous = requests.get(requestKey);
    if (previous) return previous.digest !== digest ? error(409, "IDEMPOTENCY_CONFLICT") : previous.value.status === "running" ? error(409, "RUN_IN_PROGRESS") : json(ApiTestRunSchema.parse(previous.value), previous.httpStatus);
    if (runs.size >= 1000) return error(503, "RUN_STORE_FULL");
    const id = randomUUID(), run: Run = { owner: session.id, digest, id, httpStatus: 200,
      value: { testRunId: id, mode: "mock", scenario: "narration", featureId: "core-base", modelId: "gpt-4o-mini", personaId: input.personaId,
        personaVersion: "1.0.0", promptVersion: PERSONA_PROMPT_VERSION, commonPromptVersion: COMMON_SYSTEM_PROMPT_VERSION, schemaVersion: "1.0.0",
        status: "running", startedAt: new Date(time).toISOString(), inputTokens: null, outputTokens: null } };
    runs.set(id, run); requests.set(requestKey, run);
    try {
      const result = await createPersonaExperiment({ ...options.catalog, selection: { personaId: input.personaId, personaVersion: "1.0.0" }, provider: options.provider,
        store, policy: apiTestPolicy(limits, time), now, environment: () => apiTestLocalEnvironment(options.environment()) ? "development" : undefined,
        resolveAccess: async () => access }).run(options.catalog.core(input.fixtureId), { signal: request.signal });
      run.value = { ...run.value, status: result.styleEvaluation.passed ? "passed" : "failed", evidence: result.styleEvaluation.passed ? "MOCK_PASS" : "MOCK_FAILED", result };
    } catch (cause) {
      const code = cause instanceof ExperimentError || cause instanceof NarrationError ? cause.code : "MOCK_EXECUTION_FAILED";
      run.httpStatus = code === "BUDGET_EXCEEDED" ? 429 : code === "CONCURRENCY_LIMIT" ? 409 : 502;
      run.value = { ...run.value, status: code === "CANCELLED" ? "interrupted" : "failed", evidence: "MOCK_FAILED", errorCode: code };
    }
    run.value = { ...run.value, finishedAt: new Date(now()).toISOString(), durationMs: Math.max(0, now() - time) };
    return json(ApiTestRunSchema.parse(run.value), run.httpStatus);
  };
}
