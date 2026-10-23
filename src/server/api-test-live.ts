import { narratePersona } from "../application/narration/persona";
import { apiTestPolicy, type ApiTestLimits } from "../application/dev-api-test/index";
import { quoteExperimentRequest, ExperimentError } from "../domain/experiment/index";
import type { NarrationProvider } from "../domain/narration/index";
import { createOpenAiNarrationProvider, type LiveObservation } from "../infrastructure/openai/narration";
import type { FileLiveBudget } from "../infrastructure/openai/live-budget";
import type { createApiTestCatalog } from "./api-test-catalog";

/** Called only after the HTTP session/Origin/CSRF/consent/fixture gates. */
export async function runLivePersona(options: {
  catalog: ReturnType<typeof createApiTestCatalog>; fixtureId: string; personaId: string; limits: ApiTestLimits;
  key: string; apiKey: string; now: () => number; allowed: () => boolean; budget: FileLiveBudget;
  transport?: typeof fetch; observe: (value: LiveObservation) => void; signal: AbortSignal;
}) {
  const observation: LiveObservation = {};
  const provider = createOpenAiNarrationProvider({ apiKey: options.apiKey, transport: options.transport,
    observe(value) { Object.assign(observation, value); options.observe(value); } });
  const guarded: NarrationProvider = { kind: "openai", async generate(request, control) {
    if (!options.allowed()) throw new ExperimentError("ACCESS_DENIED");
    if (control?.signal?.aborted) throw new ExperimentError("ACCESS_DENIED");
    const time = options.now(), policy = apiTestPolicy(options.limits, time);
    const limited = { ...request, max_output_tokens: options.limits.outputTokens };
    const allocation = quoteExperimentRequest(limited, policy);
    const lease = options.budget.reserve({ now: time, key: options.key, tokens: allocation.tokens,
      callsLimit: options.limits.calls, tokensLimit: options.limits.tokens });
    try { return await provider.generate(limited, control); }
    finally { lease.finish(observation); }
  } };
  return narratePersona(options.catalog.core(options.fixtureId), guarded, { ...options.catalog,
    selection: { personaId: options.personaId, personaVersion: "1.0.0" } }, { signal: options.signal });
}
