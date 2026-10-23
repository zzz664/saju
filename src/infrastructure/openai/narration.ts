import { z } from "zod";
import { MAX_NARRATION_BYTES, NarrationError, type NarrationProvider } from "@/domain/narration";
import { OpenAiModelIdSchema, matchesOpenAiModel } from "@/domain/narration/model";

const Usage = z.object({
  input_tokens: z.number().int().min(0).max(1_000_000_000),
  output_tokens: z.number().int().min(0).max(1_000_000_000),
});
const Envelope = z.object({
  id: z.string().regex(/^resp_[a-zA-Z0-9_-]{1,200}$/),
  model: z.string(),
  status: z.string(),
  usage: Usage.nullish(),
  output: z
    .array(
      z.object({
        type: z.string(),
        status: z.string().optional(),
        role: z.string().optional(),
        content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
      }),
    )
    .max(30)
    .default([]),
});
export type LiveObservation = {
  responseId?: string;
  providerRequestId?: string;
  providerStatus?: string;
  inputTokens?: number;
  outputTokens?: number;
};

/** Server-only REST transport. Fixed endpoint, no retries, redirects, raw errors or logs. */
export function createOpenAiNarrationProvider(options: {
  apiKey: string;
  observe: (value: LiveObservation) => void;
  transport?: typeof fetch;
  timeoutMs?: number;
}): NarrationProvider {
  return {
    kind: "openai",
    async generate(request, { signal } = {}) {
      if (
        !OpenAiModelIdSchema.safeParse(request.model).success ||
        request.store !== false ||
        request.stream !== false ||
        !request.max_output_tokens
      )
        throw new NarrationError("INPUT_REJECTED");
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 60_000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      if (combined.aborted) throw new NarrationError(signal?.aborted ? "CANCELLED" : "TIMEOUT");
      try {
        const response = await (options.transport ?? fetch)("https://api.openai.com/v1/responses", {
          method: "POST",
          redirect: "error",
          signal: combined,
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
        });
        const requestId = response.headers.get("x-request-id");
        const metadata: LiveObservation = {
          ...(requestId && /^[a-zA-Z0-9_-]{1,200}$/.test(requestId)
            ? { providerRequestId: requestId }
            : {}),
        };
        options.observe(metadata);
        if (!response.ok) {
          await response.body?.cancel();
          throw new NarrationError(response.status === 429 ? "RATE_LIMITED" : "PROVIDER_FAILED");
        }
        const reader = response.body?.getReader();
        if (!reader) throw new NarrationError("OUTPUT_REJECTED");
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_NARRATION_BYTES * 2) {
              await reader.cancel();
              throw new NarrationError("OUTPUT_REJECTED");
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
        let raw: unknown;
        try {
          raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
        } catch {
          throw new NarrationError("OUTPUT_REJECTED");
        }
        const parsed = Envelope.safeParse(raw);
        if (!parsed.success) throw new NarrationError("OUTPUT_REJECTED");
        const envelope = parsed.data;
        options.observe({
          ...metadata,
          responseId: envelope.id,
          providerStatus: envelope.status,
          ...(envelope.usage
            ? {
                inputTokens: envelope.usage.input_tokens,
                outputTokens: envelope.usage.output_tokens,
              }
            : {}),
        });
        if (!matchesOpenAiModel(request.model, envelope.model))
          throw new NarrationError("MODEL_MISMATCH");
        if (envelope.status === "incomplete") throw new NarrationError("INCOMPLETE");
        if (envelope.status !== "completed") throw new NarrationError("PROVIDER_FAILED");
        const messages = envelope.output.filter((item) => item.type !== "reasoning");
        const content = messages.flatMap((item) => item.content ?? []);
        if (content.some((item) => item.type === "refusal")) throw new NarrationError("REFUSED");
        if (!envelope.usage) throw new NarrationError("USAGE_MISSING");
        if (
          envelope.usage.output_tokens > request.max_output_tokens ||
          messages.some(
            (item) =>
              item.type !== "message" || item.role !== "assistant" || item.status !== "completed",
          ) ||
          content.some((item) => item.type !== "output_text" || typeof item.text !== "string")
        )
          throw new NarrationError("OUTPUT_REJECTED");
        const outputText = content.map((item) => item.text).join("");
        if (!outputText || Buffer.byteLength(outputText) > MAX_NARRATION_BYTES)
          throw new NarrationError("OUTPUT_REJECTED");
        return { status: "completed", outputText };
      } catch (cause) {
        if (signal?.aborted) throw new NarrationError("CANCELLED");
        if (timeout.aborted) throw new NarrationError("TIMEOUT");
        if (cause instanceof NarrationError) throw cause;
        throw new NarrationError("PROVIDER_FAILED");
      }
    },
  };
}
