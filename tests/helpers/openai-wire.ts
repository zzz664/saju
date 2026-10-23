import { ManualPromptDataSchema } from "@/domain/core-export";
import { FeaturePersonaDataSchema } from "@/domain/persona/data";
import { FeatureNarrationSpecSchema, PersonaProfileSchema } from "@/domain/persona";
import type { NarrationRequest } from "@/domain/narration";
import type { toOpenAiResponsesBody } from "@/infrastructure/openai/request";

/** Fake HTTP tests reconstruct the received data, never call the actual provider. */
export function promptFromWire(body: ReturnType<typeof toOpenAiResponsesBody>): NarrationRequest {
  const style = JSON.parse(
    body.input
      .find((message) => message.role === "developer")!
      .content.split("\n")
      .at(-1)!,
  );
  const payload = JSON.parse(body.input.find((message) => message.role === "user")!.content);
  const { featureId, ...data } = payload;
  if (
    (featureId !== "core-base" && featureId !== "F03") ||
    body.store !== false ||
    body.stream !== false
  )
    throw new Error("Unexpected fake HTTP contract");
  return {
    modelId: body.model,
    instructions: body.instructions,
    messages: body.input,
    output: { name: body.text.format.name, jsonSchema: body.text.format.schema },
    maxOutputTokens: body.max_output_tokens,
    data:
      featureId === "F03"
        ? FeaturePersonaDataSchema.parse(payload)
        : ManualPromptDataSchema.parse(data),
    style: {
      persona: PersonaProfileSchema.parse(style.persona),
      spec: FeatureNarrationSpecSchema.parse(style.spec),
    },
  };
}
