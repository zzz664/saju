import { createApiTestHandler } from "@/server/api-test";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { createPlanMockProvider } from "@/infrastructure/llm/plan-mock";
import { FileLiveBudget } from "@/infrastructure/openai/live-budget";
import path from "node:path";

// Route bundles/HMR share one Mock ledger and unlock limiter per Node process.
const shared = globalThis as typeof globalThis & {
  __sajuApiTestHandler?: ReturnType<typeof createApiTestHandler>;
};
export function apiTestHandler(request: Request) {
  shared.__sajuApiTestHandler ??= createApiTestHandler({
    environment: () => process.env,
    provider: createPlanMockProvider(),
    catalog: createApiTestCatalog(),
    live: { budget: new FileLiveBudget(path.join(process.cwd(), ".local/api-test")) },
  });
  return shared.__sajuApiTestHandler(request);
}
