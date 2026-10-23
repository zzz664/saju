import { cp, mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { configureOfflineNext } from "./security-next-config.mjs";

const source = process.cwd();
const mode = process.argv[2] ?? "core";
if (process.argv.length > 3 || !["core", "api-test", "all", "security"].includes(mode))
  throw new Error("Unknown E2E verification mode.");
const security = mode === "security";
const tempBase = await realpath(tmpdir());
const workspace = await mkdtemp(path.join(tempBase, "saju-dev-e2e-"));
const marker = path.join(workspace, "external-fetch-blocked");
const frameworkMarker = path.join(workspace, "framework-version-stubbed");
const controls = security
  ? {
      OPENAI_API_KEY: "synthetic-production-qa-api-key-no-real-value",
      ENABLE_LIVE_API_TESTS: "true",
      DEV_TEST_SESSION_SECRET: "synthetic-unlock-secret-for-e2e-only-0001",
      SAJU_QA_API_KEY: "synthetic-production-qa-api-key-no-real-value",
      SAJU_QA_SESSION_SECRET: "synthetic-unlock-secret-for-e2e-only-0001",
      SAJU_QA_FETCH_MARKER: marker,
      SAJU_QA_STUB_NEXT_VERSION_CHECK: "1",
      SAJU_QA_FRAMEWORK_MARKER: frameworkMarker,
      NODE_OPTIONS:
        `${process.env.NODE_OPTIONS ?? ""} --require "${path.join(source, "scripts/deny-external-fetch.cjs").replaceAll("\\", "/")}"`.trim(),
    }
  : { OPENAI_API_KEY: "", ENABLE_LIVE_API_TESTS: "false" };
async function run(script, args, cwd, env = {}) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env, ...controls },
    stdio: "inherit",
    windowsHide: true,
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) throw new Error(`Verification command failed (${code}).`);
  if (security && existsSync(marker))
    throw new Error(
      "Unexpected fetch attempt blocked by QA: " + readFileSync(marker, "utf8").trim(),
    );
}
const server = createServer();
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
try {
  for (const entry of [
    "src",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "playwright.config.ts",
  ])
    await cp(path.join(source, entry), path.join(workspace, entry), { recursive: true });
  if (security) await configureOfflineNext(workspace);
  await cp(path.join(source, "tests/e2e"), path.join(workspace, "tests/e2e"), { recursive: true });
  // A real dependency copy keeps Turbopack inside its isolated project root.
  await cp(path.join(source, "node_modules"), path.join(workspace, "node_modules"), {
    recursive: true,
  });
  const env = {
    SAJU_E2E_ROOT: workspace,
    SAJU_E2E_PORT: String(port),
    SAJU_E2E_API_TEST: mode !== "core" ? "1" : "0",
    SAJU_E2E_ALL: mode === "all" || security ? "1" : "0",
    SAJU_E2E_SECURITY: security ? "1" : "0",
  };
  const playwright = path.join(source, "node_modules/@playwright/test/cli.js");
  await run(playwright, ["test"], source, { ...env, SAJU_E2E_PRODUCTION: "0" });
  await run(path.join(workspace, "node_modules/next/dist/bin/next"), ["build"], workspace, {
    NODE_ENV: "production",
  });
  await run(path.join(workspace, "node_modules/next/dist/bin/next"), ["typegen"], workspace, {
    NODE_ENV: "production",
  });
  await run(path.join(source, "node_modules/typescript/bin/tsc"), ["--noEmit"], workspace);
  await run(playwright, ["test"], source, { ...env, SAJU_E2E_PRODUCTION: "1" });
  if (security)
    console.log(
      JSON.stringify({
        securityQa: {
          unexpectedExternalFetchAttempts: 0,
          offlineNextVersionChecks: existsSync(frameworkMarker)
            ? readFileSync(frameworkMarker, "utf8").trim().split("\n").length
            : 0,
        },
      }),
    );
} finally {
  // Only delete this runner's newly-created, resolved temporary workspace.
  const resolved = await realpath(workspace);
  if (path.dirname(resolved) !== tempBase || !path.basename(resolved).startsWith("saju-dev-e2e-"))
    throw new Error("Unexpected temporary workspace path.");
  await rm(resolved, { recursive: true, force: false });
}
