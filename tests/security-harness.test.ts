import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

it("QA preload allows loopback and blocks external or malformed fetch before network without logging raw destinations", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "saju-fetch-qa-")),
    marker = path.join(directory, "blocked"),
    frameworkMarker = path.join(directory, "framework");
  try {
    const preload = path.join(directory, "qa preload.cjs");
    copyFileSync(path.resolve("scripts/deny-external-fetch.cjs"), preload);
    copyFileSync(path.resolve("next.config.ts"), path.join(directory, "next.config.ts"));
    const source = `
      const assert = require('node:assert/strict');
      const http = require('node:http');
      (async () => {
        for (const target of ['https://api.openai.com/v1/responses?private=CANARY', 'http://localhost.example.invalid/', 'invalid CANARY']) {
          await assert.rejects(fetch(target), error => error.message === 'External fetch disabled during isolated QA.');
        }
        const registry = 'https://registry.npmjs.org/-/package/next/dist-tags';
        await assert.rejects(fetch(registry));
        process.env.SAJU_QA_STUB_NEXT_VERSION_CHECK = '1';
        assert.equal((await fetch(registry)).status, 503);
        await assert.rejects(fetch(registry + '?private=CANARY'));
        await assert.rejects(fetch(registry, { headers: { authorization: 'Bearer CANARY' } }));
        const { configureOfflineNext } = await import(require('node:url').pathToFileURL(require('node:path').resolve('scripts/security-next-config.mjs')).href);
        await configureOfflineNext(process.env.SAJU_QA_CONFIG_DIR);
        const config = await require('next/dist/server/config').default(require('next/constants').PHASE_PRODUCTION_BUILD, process.env.SAJU_QA_CONFIG_DIR);
        assert.equal(config.experimental.agentUpgrade, false);
        assert.deepEqual(config.serverExternalPackages, ['@js-temporal/polyfill', 'manseryeok']);
        const server = http.createServer((req, res) => res.end('local'));
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        try { assert.equal(await (await fetch('http://127.0.0.1:' + server.address().port)).text(), 'local'); }
        finally { await new Promise(resolve => server.close(resolve)); }
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    execFileSync(process.execPath, ["-e", source], {
      env: {
        ...process.env,
        NODE_OPTIONS:
          `${process.env.NODE_OPTIONS ?? ""} --require "${preload.replaceAll("\\", "/")}"`.trim(),
        SAJU_QA_FETCH_MARKER: marker,
        SAJU_QA_FRAMEWORK_MARKER: frameworkMarker,
        SAJU_QA_STUB_NEXT_VERSION_CHECK: "0",
        SAJU_QA_CONFIG_DIR: directory,
        OPENAI_API_KEY: "",
        ENABLE_LIVE_API_TESTS: "false",
      },
      timeout: 20000,
      windowsHide: true,
    });
    const blocked = readFileSync(marker, "utf8");
    expect(blocked.trim().split("\n")).toEqual([
      "openai:other",
      "other:other",
      "invalid:other",
      "npm:other",
      "npm:other",
      "npm:other",
    ]);
    expect(blocked).not.toMatch(/CANARY|https|registry|Bearer/);
    expect(readFileSync(frameworkMarker, "utf8")).toBe("offline\n");
  } finally {
    const resolved = path.resolve(directory);
    if (
      path.dirname(resolved) !== path.resolve(tmpdir()) ||
      !path.basename(resolved).startsWith("saju-fetch-qa-")
    )
      throw new Error("Unexpected QA directory");
    rmSync(resolved, { recursive: true });
  }
}, 25000);
