// QA preload only. No production import. Never record URLs, headers or bodies.
const original = globalThis.fetch;
globalThis.fetch = async function (input, options) {
  let allowed = false,
    destination;
  try {
    destination = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    allowed =
      ["http:", "https:"].includes(destination.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(destination.hostname);
  } catch {
    /* Unparseable destinations also fail closed. */
  }
  // Next dev checks npm for version warnings. Supply an offline response only for
  // this exact credential-free GET; it never reaches the network or implies freshness.
  if (
    process.env.SAJU_QA_STUB_NEXT_VERSION_CHECK === "1" &&
    destination?.href === "https://registry.npmjs.org/-/package/next/dist-tags"
  ) {
    const request = typeof input === "object" && !(input instanceof URL) ? input : undefined;
    const method = (options?.method ?? request?.method ?? "GET").toUpperCase();
    const headers = new Headers(options?.headers ?? request?.headers);
    if (method === "GET" && [...headers].length === 0 && !(options?.body ?? request?.body)) {
      const { appendFileSync } = await import("node:fs");
      if (process.env.SAJU_QA_FRAMEWORK_MARKER)
        appendFileSync(process.env.SAJU_QA_FRAMEWORK_MARKER, "offline\n", { mode: 0o600 });
      return new Response(null, { status: 503 });
    }
  }
  if (!allowed) {
    const { appendFileSync } = await import("node:fs");
    const kind = !destination
      ? "invalid"
      : destination.protocol === "data:"
        ? "data"
        : destination.protocol === "file:"
          ? "file"
          : destination.hostname === "api.openai.com"
            ? "openai"
            : destination.hostname === "registry.npmjs.org"
              ? "npm"
              : "other";
    const stack = new Error().stack ?? "";
    const caller = stack.includes("hot-reloader-shared-utils")
      ? "next-version"
      : stack.includes("telemetry")
        ? "next-telemetry"
        : stack.includes("playwright")
          ? "playwright"
          : "other";
    if (process.env.SAJU_QA_FETCH_MARKER)
      appendFileSync(process.env.SAJU_QA_FETCH_MARKER, `${kind}:${caller}\n`, { mode: 0o600 });
    return Promise.reject(new Error("External fetch disabled during isolated QA."));
  }
  return original.call(globalThis, input, options);
};
