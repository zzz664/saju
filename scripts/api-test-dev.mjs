import { spawn } from "node:child_process";
import path from "node:path";
const port = process.argv[2] ?? "3000";
if (
  process.argv.length > 3 ||
  !/^\d{1,5}$/.test(port) ||
  Number(port) < 1 ||
  Number(port) > 65535 ||
  process.env.NODE_ENV === "production" ||
  process.env.CI ||
  process.env.VERCEL
) {
  console.error("Dedicated local API test server invocation rejected.");
  process.exit(1);
}
// Credentials are configured by the operator in .env.local. No secret is generated,
// changed, logged or placed on the command line. Next binds loopback explicitly.
const child = spawn(
  process.execPath,
  [
    path.resolve("node_modules/next/dist/bin/next"),
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    env: { ...process.env, API_TEST_LOCAL_ONLY: "true", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: "inherit",
    windowsHide: true,
  },
);
child.once("error", () => {
  console.error("Local API test server failed.");
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
