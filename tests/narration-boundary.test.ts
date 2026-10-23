import { expect, it } from "vitest";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { preparePersonaNarration } from "@/domain/persona/narration";
import { createPersonaMockProvider } from "@/infrastructure/llm/persona-mock";
import { toOpenAiResponsesBody } from "@/infrastructure/openai/request";
import { estimateNarrationTokens } from "@/domain/experiment";

it("maps neutral prompts to the exact bounded Responses wire allowlist", () => {
  const catalog = createApiTestCatalog();
  const context = preparePersonaNarration(catalog.core("synthetic-known"), {
    ...catalog,
    selection: catalog.selection("synthetic-style"),
  });
  const prompt = { ...context.request, maxOutputTokens: 1200 };
  const wire = toOpenAiResponsesBody(prompt);
  expect(Object.keys(wire).sort()).toEqual([
    "input",
    "instructions",
    "max_output_tokens",
    "model",
    "store",
    "stream",
    "text",
  ]);
  expect(wire).toMatchObject({
    model: prompt.modelId,
    store: false,
    stream: false,
    max_output_tokens: 1200,
    text: { format: { type: "json_schema", strict: true } },
  });
  expect(wire.input).toBe(prompt.messages);
  expect(wire.text.format.schema).toBe(prompt.output.jsonSchema);
  expect(
    estimateNarrationTokens(prompt, { maxRequestBytes: 131072, maxOutputTokens: 1200 }).tokens,
  ).toBeGreaterThan(new TextEncoder().encode(JSON.stringify(wire)).byteLength + 1200);
});
it("Mock uses structured approved style/data independently of prompt wording", async () => {
  const catalog = createApiTestCatalog();
  const context = preparePersonaNarration(catalog.core("synthetic-known"), {
    ...catalog,
    selection: catalog.selection("synthetic-style"),
  });
  const mock = createPersonaMockProvider();
  expect(await mock.generate({ ...context.request, messages: [] })).toEqual(
    await mock.generate(context.request),
  );
});
