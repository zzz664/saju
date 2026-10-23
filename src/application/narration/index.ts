import { ExperimentError } from "@/domain/experiment";
import {
  NarrationError,
  NarrationProviderResponseSchema,
  type NarrationProvider,
  type NarrationRequest,
} from "@/domain/narration";

async function generate(
  provider: NarrationProvider,
  request: NarrationRequest,
  signal?: AbortSignal,
): Promise<unknown> {
  if (!signal) return provider.generate(request);
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(new NarrationError("CANCELLED"));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
  try {
    return await Promise.race([
      cancelled,
      Promise.resolve().then(() => {
        if (signal.aborted) throw new NarrationError("CANCELLED");
        return provider.generate(request, { signal });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

/** Shared supplier boundary: provider status → text, with cancellation and sanitized failures. */
export async function receiveNarrationText(
  request: NarrationRequest,
  provider: NarrationProvider,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new NarrationError("CANCELLED");
  let raw: unknown;
  try {
    raw = await generate(provider, request, signal);
  } catch (cause) {
    if (cause instanceof NarrationError || cause instanceof ExperimentError) throw cause;
    throw new NarrationError(signal?.aborted ? "CANCELLED" : "PROVIDER_FAILED");
  }
  if (signal?.aborted) throw new NarrationError("CANCELLED");
  const response = NarrationProviderResponseSchema.safeParse(raw);
  if (!response.success) throw new NarrationError("OUTPUT_REJECTED");
  if (response.data.status !== "completed")
    throw new NarrationError(
      response.data.status === "failed"
        ? "PROVIDER_FAILED"
        : response.data.status === "refused"
          ? "REFUSED"
          : "INCOMPLETE",
    );
  return response.data.outputText;
}
