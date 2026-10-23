import type { NarrationRequest } from "@/domain/narration";

/** Wire-only policy: never store prompts, never enable streaming for R01. */
export function toOpenAiResponsesBody(prompt: NarrationRequest) {
  return {
    model: prompt.modelId,
    store: false as const,
    stream: false as const,
    instructions: prompt.instructions,
    input: prompt.messages,
    text: {
      format: {
        type: "json_schema" as const,
        name: prompt.output.name,
        strict: true as const,
        schema: prompt.output.jsonSchema,
      },
    },
    ...(prompt.maxOutputTokens === undefined ? {} : { max_output_tokens: prompt.maxOutputTokens }),
  };
}
