import { createCoreDependencies } from "@/server/core-dependencies";
import { createDeveloperAnalysisHandler } from "@/server/developer-analysis";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { isLocalDevelopmentEnvironment } from "@/server/developer-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createDeveloperAnalysisHandler({
  isDevelopment: () => isLocalDevelopmentEnvironment(process.env),
  dependencies: createCoreDependencies(),
  hash: nodeSha256Adapter,
});
export const GET = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
