import { ManualPromptDataSchema } from "../../domain/core-export/index";
import { ExperimentError } from "../../domain/experiment/index";
import { createNarrationRequest, NarrationError, NARRATION_META, NarrationProviderResponseSchema, validateNarrationOutput, type NarrationProvider, type NarrationRequest } from "../../domain/narration/index";

async function generate(provider: NarrationProvider, request: NarrationRequest, signal?: AbortSignal): Promise<unknown> {
  if (!signal) return provider.generate(request);
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(new NarrationError("CANCELLED"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([cancelled, Promise.resolve().then(() => {
      if (signal.aborted) throw new NarrationError("CANCELLED");
      return provider.generate(request, { signal });
    })]);
  } finally { signal.removeEventListener("abort", onAbort); }
}

/** Shared supplier boundary, independent of the selected developer JSON output contract. */
export async function receiveNarrationText(request: NarrationRequest, provider: NarrationProvider, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) throw new NarrationError("CANCELLED");
  let raw: unknown;
  try { raw = await generate(provider, request, signal); }
  catch (cause) { if (cause instanceof NarrationError || cause instanceof ExperimentError) throw cause; throw new NarrationError(signal?.aborted ? "CANCELLED" : "PROVIDER_FAILED"); }
  if (signal?.aborted) throw new NarrationError("CANCELLED");
  const response = NarrationProviderResponseSchema.safeParse(raw);
  if (!response.success) throw new NarrationError("OUTPUT_REJECTED");
  if (response.data.status !== "completed") throw new NarrationError(response.data.status === "failed" ? "PROVIDER_FAILED" : response.data.status === "refused" ? "REFUSED" : "INCOMPLETE");
  return response.data.outputText;
}

/** Internal evaluation only. No UI, persistence, retries, budget gate or live adapter. */
export async function narrateCore(value: unknown, provider: NarrationProvider, options: { readonly signal?: AbortSignal } = {}) {
  const { signal } = options;
  if (signal?.aborted) throw new NarrationError("CANCELLED");
  if (provider.kind !== "mock") throw new NarrationError("LIVE_DISABLED");
  const request = createNarrationRequest(value);
  const data = ManualPromptDataSchema.parse(JSON.parse(request.input[0].content));
  const draft = validateNarrationOutput(await receiveNarrationText(request, provider, signal), data);
  return Object.freeze({ mode: "developer-json" as const, sourceStatus: data.status, sections: draft.sections,
    limitations: data.limitations, meta: Object.freeze({ ...NARRATION_META, providerKind: "mock" as const }) });
}
