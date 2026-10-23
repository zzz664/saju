import { narratePersona } from "@/application/narration/persona";
import { type ApiTestLimits } from "@/application/dev-api-test";
import { estimateNarrationTokens, ExperimentError } from "@/domain/experiment";
import type { NarrationProvider } from "@/domain/narration";
import {
  createOpenAiNarrationProvider,
  type LiveObservation,
} from "@/infrastructure/openai/narration";
import type { FileLiveBudget } from "@/infrastructure/openai/live-budget";
import type { createApiTestCatalog } from "@/server/api-test-catalog";

/** Called only after the HTTP session/Origin/CSRF/consent/fixture gates. */
export async function runLivePersona(options: {
  catalog: ReturnType<typeof createApiTestCatalog>;
  fixtureId: string;
  featureId: "core-base" | "F03";
  selection: { personaId: string; personaVersion: string };
  limits: ApiTestLimits;
  key: string;
  apiKey: string;
  now: () => number;
  allowed: () => boolean;
  budget: FileLiveBudget;
  transport?: typeof fetch;
  observe: (value: LiveObservation) => void;
  signal: AbortSignal;
  model: string;
}) {
  const observation: LiveObservation = {};
  const provider = createOpenAiNarrationProvider({
    apiKey: options.apiKey,
    transport: options.transport,
    observe(value) {
      Object.assign(observation, value);
      options.observe(value);
    },
  });
  const guarded: NarrationProvider = {
    kind: "openai",
    async generate(request, control) {
      if (!options.allowed()) throw new ExperimentError("ACCESS_DENIED");
      if (control?.signal?.aborted) throw new ExperimentError("ACCESS_DENIED");
      const time = options.now();
      const limited = { ...request, maxOutputTokens: options.limits.outputTokens };
      const allocation = estimateNarrationTokens(limited, {
        maxRequestBytes: 131072,
        maxOutputTokens: options.limits.outputTokens,
      });
      const lease = options.budget.reserve({
        now: time,
        key: options.key,
        tokens: allocation.tokens,
        modelId: options.model,
        callsLimit: options.limits.calls,
        tokensLimit: options.limits.tokens,
      });
      try {
        return await provider.generate(limited, control);
      } finally {
        lease.settle(observation);
      }
    },
  };
  return narratePersona(
    options.catalog.source(options.fixtureId, options.featureId),
    guarded,
    {
      ...options.catalog,
      spec: options.catalog.specFor(options.featureId),
      model: options.model,
      selection: options.selection,
    },
    { signal: options.signal },
  );
}
