import type { NarrationRequest } from "@/domain/narration";
import type { toOpenAiResponsesBody } from "@/infrastructure/openai/request";
import { createSyntheticPersonaCatalog } from "@/infrastructure/persona/synthetic-catalog";

const registry = createSyntheticPersonaCatalog().registry;

/**
 * Fake HTTP tests reconstruct the received request from the wire, never call the provider.
 * The persona is resolved from the style-guide header; the plan is the model-facing projection.
 */
export function promptFromWire(body: ReturnType<typeof toOpenAiResponsesBody>): NarrationRequest {
  const developer = body.input.find((message) => message.role === "developer")!.content;
  const header = developer.match(/^\[캐릭터 스타일 안내\] (\S+) (\S+)$/m);
  if (!header || body.store !== false || body.stream !== false)
    throw new Error("Unexpected fake HTTP contract");
  const persona = registry.load({ personaId: header[1], personaVersion: header[2] });
  const plan = JSON.parse(body.input.find((message) => message.role === "user")!.content);
  return {
    modelId: body.model,
    instructions: body.instructions,
    messages: body.input,
    output: { name: body.text.format.name, jsonSchema: body.text.format.schema },
    maxOutputTokens: body.max_output_tokens,
    plan,
    persona,
  };
}
