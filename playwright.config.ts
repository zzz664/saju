import { defineConfig } from "@playwright/test";
import path from "node:path";

const workspace = process.env.SAJU_E2E_ROOT;
if (!workspace) throw new Error("Run npm run test:e2e to isolate Next.js artifacts.");
const production = process.env.SAJU_E2E_PRODUCTION === "1";
const port = Number(process.env.SAJU_E2E_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Missing isolated E2E port.");
const next = path.join(workspace, "node_modules/next/dist/bin/next");
export default defineConfig({
  testDir: "./tests/e2e", testMatch: production ? "developer-production.spec.ts" : "developer-analysis.spec.ts",
  fullyParallel: false, workers: 1, retries: 0, maxFailures: 1, timeout: 45000, expect: { timeout: 15000 }, reporter: "list",
  outputDir: `test-results/${production ? "production" : "development"}`,
  use: { baseURL: `http://127.0.0.1:${port}`, channel: process.env.SAJU_E2E_CHANNEL || "chrome",
    permissions: ["clipboard-read", "clipboard-write"], screenshot: "only-on-failure", trace: "off" },
  webServer: { command: `"${process.execPath}" "${next}" ${production ? "start" : "dev"} --hostname 127.0.0.1 --port ${port}`,
    cwd: workspace, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 90000, stdout: "pipe",
    env: { NODE_ENV: production ? "production" : "development", NEXT_TELEMETRY_DISABLED: "1" } },
});
