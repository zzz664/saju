import { createHmac, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

test("production rejects valid developer credentials and Live consent with synthetic key and flags enabled", async ({
  request,
  baseURL,
}) => {
  const secret = process.env.SAJU_QA_SESSION_SECRET!;
  expect(secret).toBeTruthy();
  expect(process.env.SAJU_QA_API_KEY).toBeTruthy();
  const csrf = "a".repeat(64),
    payload = Buffer.from(
      JSON.stringify({ id: randomUUID(), csrf, expires: Date.now() + 1_800_000 }),
    ).toString("base64url");
  const cookie =
    "saju_api_test=" +
    payload +
    "." +
    createHmac("sha256", secret).update(payload).digest("base64url");
  const headers = { cookie, origin: baseURL!, "x-api-test-csrf": csrf };
  for (const url of ["/dev/validation", "/dev/api-test"])
    expect((await request.get(url, { headers })).status()).toBe(404);
  for (const url of [
    "/api/analysis",
    "/api/dev/api-test/config",
    "/api/dev/api-test/unlock",
    "/api/dev/api-test/runs",
    "/api/dev/api-test/runs/" + randomUUID(),
  ]) {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
      const data = url.endsWith("/unlock")
        ? { secret }
        : {
            mode: "live",
            scenario: "narration",
            fixtureId: "synthetic-known",
            featureId: "core-base",
            personaId: "synthetic-style",
            acknowledgedCost: true,
            requestId: randomUUID(),
          };
      const response = await request.fetch(url, {
        method,
        headers,
        ...(method === "POST" ? { data } : {}),
      });
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toContain("no-store");
      const text = await response.text();
      expect(text).not.toContain(secret);
      expect(text).not.toContain(process.env.SAJU_QA_API_KEY!);
    }
  }
});

test("public production HTML and client assets contain neither synthetic server key nor unlock secret", async ({
  request,
}) => {
  const needles = [process.env.SAJU_QA_API_KEY!, process.env.SAJU_QA_SESSION_SECRET!];
  for (const value of needles) expect(value).toBeTruthy();
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  for (const value of needles) expect(await response.text()).not.toContain(value);
  function files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : entry.isFile() && /\.(js|json|css|map)$/.test(entry.name)
          ? [path.join(directory, entry.name)]
          : [],
    );
  }
  const assets = files(path.join(process.env.SAJU_E2E_ROOT!, ".next/static"));
  expect(assets.length).toBeGreaterThan(0);
  for (const file of assets)
    for (const value of needles)
      expect(readFileSync(file, "utf8"), path.basename(file)).not.toContain(value);
});
