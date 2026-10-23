import { createApiTestHandler } from "./api-test";
import { createApiTestCatalog } from "./api-test-catalog";
import { createPersonaMockProvider } from "../infrastructure/llm/persona-mock";

// Route bundles/HMR share one Mock ledger and unlock limiter per Node process.
const shared = globalThis as typeof globalThis & { __sajuApiTestHandler?: ReturnType<typeof createApiTestHandler> };
export function apiTestHandler(request: Request) {
  shared.__sajuApiTestHandler ??= createApiTestHandler({ environment: () => process.env, provider: createPersonaMockProvider(), catalog: createApiTestCatalog() });
  return shared.__sajuApiTestHandler(request);
}
