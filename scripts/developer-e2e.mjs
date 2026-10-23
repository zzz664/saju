import { cp, mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const source = process.cwd();
const tempBase = await realpath(tmpdir());
const workspace = await mkdtemp(path.join(tempBase, "saju-dev-e2e-"));
async function run(script, args, cwd, env = {}) {
  const child = spawn(process.execPath, [script, ...args], { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env }, stdio: "inherit", windowsHide: true });
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  if (code !== 0) throw new Error(`Verification command failed (${code}).`);
}
const server = createServer();
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const port = server.address().port;
await new Promise((resolve) => server.close(resolve));
try {
  for (const entry of ["src", "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "playwright.config.ts"])
    await cp(path.join(source, entry), path.join(workspace, entry), { recursive: true });
  await cp(path.join(source, "tests/e2e"), path.join(workspace, "tests/e2e"), { recursive: true });
  // A real dependency copy keeps Turbopack inside its isolated project root.
  await cp(path.join(source, "node_modules"), path.join(workspace, "node_modules"), { recursive: true });
  const env = { SAJU_E2E_ROOT: workspace, SAJU_E2E_PORT: String(port) };
  const playwright = path.join(source, "node_modules/@playwright/test/cli.js");
  await run(playwright, ["test"], source, { ...env, SAJU_E2E_PRODUCTION: "0" });
  await run(path.join(workspace, "node_modules/next/dist/bin/next"), ["build"], workspace, { NODE_ENV: "production" });
  await run(path.join(workspace, "node_modules/next/dist/bin/next"), ["typegen"], workspace, { NODE_ENV: "production" });
  await run(path.join(source, "node_modules/typescript/bin/tsc"), ["--noEmit"], workspace);
  await run(playwright, ["test"], source, { ...env, SAJU_E2E_PRODUCTION: "1" });
} finally {
  // Only delete this runner's newly-created, resolved temporary workspace.
  const resolved = await realpath(workspace);
  if (path.dirname(resolved) !== tempBase || !path.basename(resolved).startsWith("saju-dev-e2e-")) throw new Error("Unexpected temporary workspace path.");
  await rm(resolved, { recursive: true, force: false });
}
