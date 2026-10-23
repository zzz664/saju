import { readBoundedUtf8, webBytes, BoundedInputError } from "@/infrastructure/io/bounded-utf8";

import { AnalysisInputSchema } from "@/domain/input";
import { calculateDeveloperAnalysis } from "@/application/developer-analysis";
import type { NatalFactsDependencies } from "@/application/natal-facts";
import type { Sha256Adapter } from "@/domain/core-fingerprint";
import { isLocalDeveloperRequest } from "@/server/developer-access";
export { isLocalDeveloperHost } from "@/server/developer-access";

const headers = { "cache-control": "no-store, max-age=0", "x-robots-tag": "noindex, nofollow" };
function error(status: number, code: string, message: string, extra = {}) {
  return Response.json({ error: { code, message } }, { status, headers: { ...headers, ...extra } });
}
class BodyError extends Error {
  constructor(readonly status: 400 | 413) {
    super("Request body was rejected.");
  }
}
async function readJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared !== null && !/^\d+$/.test(declared)) throw new BodyError(400);
  if (declared !== null && Number(declared) > 65536) throw new BodyError(413);
  if (!request.body) throw new BodyError(400);
  try {
    const text = await readBoundedUtf8(webBytes(request.body), 65536);
    if (request.signal.aborted) throw new BodyError(400);
    return JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch (cause) {
    throw new BodyError(
      cause instanceof BoundedInputError && cause.code === "TOO_LARGE" ? 413 : 400,
    );
  }
}

export function createDeveloperAnalysisHandler(options: {
  readonly isDevelopment: () => boolean;
  readonly dependencies: NatalFactsDependencies;
  readonly hash: Sha256Adapter;
}) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Next may normalize a loopback URL to localhost; Host retains the browser's origin.
    const host = request.headers.get("host") ?? url.host;
    if (!options.isDevelopment() || !isLocalDeveloperRequest(request))
      return error(404, "NOT_FOUND", "Not found.");
    if (request.method !== "POST")
      return error(405, "METHOD_NOT_ALLOWED", "Use POST.", { allow: "POST" });
    if (request.headers.get("origin") !== new URL(url.protocol + "//" + host).origin)
      return error(403, "ORIGIN_REJECTED", "Same-origin request required.");
    if (
      request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return error(415, "CONTENT_TYPE_REJECTED", "Use application/json.");
    let raw: unknown;
    try {
      raw = await readJson(request);
    } catch (cause) {
      return cause instanceof BodyError && cause.status === 413
        ? error(413, "INPUT_TOO_LARGE", "Request body exceeds 64 KiB.")
        : error(400, "INVALID_JSON", "Provide valid UTF-8 JSON.");
    }
    const parsed = AnalysisInputSchema.safeParse(raw);
    if (!parsed.success)
      return error(422, "INVALID_INPUT", "Input does not satisfy AnalysisInput.");
    try {
      return Response.json(
        calculateDeveloperAnalysis(parsed.data, options.dependencies, options.hash),
        { headers },
      );
    } catch {
      return error(500, "CALCULATION_FAILED", "Analysis calculation failed.");
    }
  };
}
