import { describe, expect, it, vi } from "vitest";
import { createDeveloperAnalysisHandler, isLocalDeveloperHost } from "@/server/developer-analysis";
import { DeveloperAnalysisResponseSchema } from "@/domain/developer-analysis";
import { nodeSha256Adapter } from "@/infrastructure/hashing";
import { verifyCoreFingerprint } from "@/domain/core-fingerprint";
import { fingerprintInput, fingerprintDependencies } from "./helpers/fingerprint-input";
import { POST as analysisRoute } from "@/app/api/analysis/route";

const origin = "http://127.0.0.1:3197";
const remoteProxyHeaders: Record<string, string>[] = [
  { "x-forwarded-for": "203.0.113.1" }, { "x-forwarded-for": "127.0.0.1, 203.0.113.1" },
  { "x-real-ip": "203.0.113.1" }, { "x-forwarded-host": "example.test" }, { forwarded: "for=203.0.113.1;host=localhost" },
];
function request(value: unknown = fingerprintInput, headers: Record<string, string> = {}) {
  return new Request(origin + "/api/analysis", { method: "POST", headers: { origin, "content-type": "application/json", ...headers }, body: JSON.stringify(value) });
}
const handler = createDeveloperAnalysisHandler({ isDevelopment: () => true, dependencies: fingerprintDependencies, hash: nodeSha256Adapter });

describe("local developer analysis API", () => {
  it.each([{ CI: "true" }, { VERCEL: "1" }, { VERCEL_ENV: "preview" }, { NODE_ENV: "production" }])("blocks the real route in restricted environment %j before reading input", async extra => {
    try {
      for (const [key, value] of Object.entries({ NODE_ENV: "development", CI: "", VERCEL: "", VERCEL_ENV: "", ...extra })) vi.stubEnv(key, value);
      const req = request();
      expect((await analysisRoute(req)).status).toBe(404);
      expect(req.bodyUsed).toBe(false);
    } finally { vi.unstubAllEnvs(); }
  });

  it.each(remoteProxyHeaders)("rejects remote proxy metadata %j before input or calculation", async headers => {
    const calculate = vi.fn(fingerprintDependencies.pillars.calculate);
    const handle = createDeveloperAnalysisHandler({ isDevelopment: () => true, dependencies: { ...fingerprintDependencies, pillars: { calculate } }, hash: nodeSha256Adapter });
    const req = request(fingerprintInput, headers);
    expect((await handle(req)).status).toBe(404);
    expect(req.bodyUsed).toBe(false); expect(calculate).not.toHaveBeenCalled();
  });

  it("returns validated core/hash/manual data with no raw birth input or caching", async () => {
    const calculate = vi.fn(fingerprintDependencies.pillars.calculate);
    const run = createDeveloperAnalysisHandler({ isDevelopment: () => true, dependencies: { ...fingerprintDependencies, pillars: { calculate } }, hash: nodeSha256Adapter });
    const response = await run(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    const text = await response.text();
    const data = DeveloperAnalysisResponseSchema.parse(JSON.parse(text));
    expect(data.analysis.status).toBe("complete");
    expect(verifyCoreFingerprint(data.analysis, nodeSha256Adapter)).toBe(true);
    expect(data.manualPrompt).toContain("<analysis_data>");
    expect(text).not.toMatch(/2024-02-10|05:30|birthDate/);
    expect(calculate).toHaveBeenCalledTimes(1);
  });

  it.each(["midnight", "zi-start"])("keeps %s unknown time partial with no confirmed hour", async (dayBoundary) => {
    const response = await handler(request({ ...fingerprintInput, birthInput: { ...fingerprintInput.birthInput, birthTime: { status: "unknown" } }, calculationPolicy: { ...fingerprintInput.calculationPolicy, dayBoundary } }));
    expect(response.status).toBe(200);
    const data = DeveloperAnalysisResponseSchema.parse(await response.json());
    expect(data.analysis.status).toBe("partial");
    expect(data.analysis.document.facts?.sourcePillars.hour).toBeNull();
    if (dayBoundary === "zi-start") expect(data.analysis.document.facts?.dayMaster).toBeNull();
  }, 15000);

  it("returns explicit unavailable information for unsupported input", async () => {
    const response = await handler(request({ ...fingerprintInput, calculationPolicy: { ...fingerprintInput.calculationPolicy, solarTime: "true-solar" } }));
    const data = DeveloperAnalysisResponseSchema.parse(await response.json());
    expect(response.status).toBe(200);
    expect(data.analysis).toMatchObject({ status: "unavailable", document: { facts: null } });
    expect(data.analysis.document.calculation.reasons).toContain("LONGITUDE_UNKNOWN");
  });

  it("blocks non-development and remote hosts before reading input or invoking calculation", async () => {
    const calculate = vi.fn(fingerprintDependencies.pillars.calculate);
    for (const enabled of [false, true]) {
      const run = createDeveloperAnalysisHandler({ isDevelopment: () => enabled, dependencies: { ...fingerprintDependencies, pillars: { calculate } }, hash: nodeSha256Adapter });
      const req = enabled ? new Request("https://example.com/api/analysis", { method: "POST", body: "private" }) : request();
      expect((await run(req)).status).toBe(404);
      expect(req.bodyUsed).toBe(false);
    }
    expect(calculate).not.toHaveBeenCalled();
  });

  it("accepts only local host syntax and rejects lookalikes, credentials and forwarded URLs", () => {
    for (const host of ["localhost", "localhost:3197", "127.0.0.1:3197", "[::1]:3197"]) expect(isLocalDeveloperHost(host)).toBe(true);
    for (const host of [null, "localhost.example.com", "example.com", "user@localhost", "localhost/path", "localhost:abc", "127.1", "https://localhost", "localhost\\evil", "127.0.0.1:3197#x"]) expect(isLocalDeveloperHost(host)).toBe(false);
  });

  it("rejects missing/cross-site origins and wrong content type before calculation", async () => {
    expect((await handler(request(fingerprintInput, { origin: "https://example.com" }))).status).toBe(403);
    expect((await handler(new Request(origin + "/api/analysis", { method: "POST", body: "private" }))).status).toBe(403);
    expect((await handler(request(fingerprintInput, { "content-type": "text/plain" }))).status).toBe(415);
    const wrongMethod = await handler(new Request(origin + "/api/analysis"));
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
  });

  it("uses the validated Host for Next-normalized URLs without accepting a different origin or port", async () => {
    const req = new Request("http://localhost:3197/api/analysis", { method: "POST",
      headers: { host: "127.0.0.1:3197", origin, "content-type": "application/json" }, body: JSON.stringify(fingerprintInput) });
    expect((await handler(req)).status).toBe(200);
    expect((await handler(request(fingerprintInput, { origin: "http://127.0.0.1:3198" }))).status).toBe(403);
    expect((await handler(request(fingerprintInput, { host: "example.com" }))).status).toBe(404);
  });

  it("rejects malformed/schema-invalid/oversized and invalid UTF-8 input without reflecting it", async () => {
    for (const [body, contentLength, status] of [
      ["{ private 2024-02-10", undefined, 400], ["{}", undefined, 422],
      [" ".repeat(65537), undefined, 413], ["{}", "65537", 413],
    ] as const) {
      const response = await handler(new Request(origin + "/api/analysis", { method: "POST", headers: { origin, "content-type": "application/json", ...(contentLength ? { "content-length": contentLength } : {}) }, body }));
      expect(response.status).toBe(status);
      expect(await response.text()).not.toMatch(/private|2024/);
    }
    const invalid = await handler(new Request(origin + "/api/analysis", { method: "POST", headers: { origin, "content-type": "application/json" }, body: new Uint8Array([255]) }));
    expect(invalid.status).toBe(400);
  });

  it("sanitizes calculation exceptions and never logs raw input or secrets", async () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const run = createDeveloperAnalysisHandler({ isDevelopment: () => true, dependencies: fingerprintDependencies, hash: { digest: () => { throw new Error("private 2024-02-10 secret"); } } });
    const response = await run(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/private|2024|secret/);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
