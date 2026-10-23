import { spawnSync } from "node:child_process";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { runCli } from "@/cli/run";
import { MAX_STDIN_BYTES, readUtf8Input } from "@/cli/input";
import { manseryeokCalendarAdapter } from "@/infrastructure/manseryeok";
import input from "./fixtures/core-reference-input.json";

const json = JSON.stringify(input);

describe("pure CLI runner", () => {
  it("validates known or unknown input without a calendar call or input echo", () => {
    const calculate = vi.fn();
    const result = runCli(["validate"], json, { calculate });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe("valid");
    expect(result.stdout).not.toContain(input.birthInput.birthDate);
    expect(result.stderr).toBe("");
    expect(calculate).not.toHaveBeenCalled();
  });

  it("calculates through the real port and prints exactly one JSON result", () => {
    const result = runCli(["calculate"], json, manseryeokCalendarAdapter);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).snapshot.pillars.day).toEqual({
      heavenlyStem: "계",
      earthlyBranch: "유",
    });
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(result.stderr).toBe("");
  });

  it.each(["", "{", "null", "{}", json + json])("reports invalid input safely for %s", (raw) => {
    const result = runCli(["calculate"], raw, manseryeokCalendarAdapter);

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toMatch(/^INVALID_(JSON|INPUT)$/);
    expect(result.stderr).not.toContain(input.birthInput.birthDate);
  });

  it.each([[], ["unknown"], ["calculate", "--unsafe"], ["--help", "calculate"]])(
    "rejects invalid arguments %j without echoing them",
    (...args) => {
      const result = runCli(args, json, manseryeokCalendarAdapter);
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stderr).error.code).toBe("USAGE");
      expect(result.stdout).toBe("");
    },
  );

  it("prints help without requiring input", () => {
    const result = runCli(["--help"], "", manseryeokCalendarAdapter);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("validate|calculate");
  });

  it("keeps unsupported input distinct from validation errors", () => {
    const unknown = {
      ...input,
      birthInput: { ...input.birthInput, birthTime: { status: "unknown" } },
    };
    const result = runCli(["calculate"], JSON.stringify(unknown), manseryeokCalendarAdapter);

    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "unavailable",
      reasons: ["BIRTH_TIME_UNKNOWN"],
    });
    expect(result.stderr).toBe("");
    expect(runCli(["validate"], JSON.stringify(unknown), manseryeokCalendarAdapter).exitCode).toBe(
      0,
    );
  });

  it("hides raw adapter exceptions on stderr", () => {
    const result = runCli(["calculate"], json, {
      calculate: () => {
        throw new Error("private 1992-10-24");
      },
    });
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr).error.code).toBe("CALCULATION_FAILED");
    expect(result.stderr).not.toContain(input.birthInput.birthDate);
  });

  it("accepts a leading UTF-8 BOM from Windows input", () => {
    expect(runCli(["validate"], "\uFEFF" + json, manseryeokCalendarAdapter).exitCode).toBe(0);
  });
});

describe("bounded UTF-8 input", () => {
  it("joins split UTF-8 chunks without replacement characters", async () => {
    const bytes = Buffer.from("한글");
    expect(
      await readUtf8Input(
        Readable.from([bytes.subarray(0, 1), bytes.subarray(1, 4), bytes.subarray(4)]),
      ),
    ).toBe("한글");
  });

  it("accepts exactly the byte limit", async () => {
    expect((await readUtf8Input(Readable.from([Buffer.alloc(MAX_STDIN_BYTES, 0x20)]))).length).toBe(
      MAX_STDIN_BYTES,
    );
  });

  it("rejects one extra byte without returning a partial input", async () => {
    await expect(
      readUtf8Input(Readable.from([Buffer.alloc(MAX_STDIN_BYTES), Buffer.from("x")])),
    ).rejects.toMatchObject({ code: "INPUT_TOO_LARGE" });
  });

  it("rejects invalid UTF-8 and I/O failures without raw error content", async () => {
    await expect(readUtf8Input(Readable.from([Buffer.from([0xc3, 0x28])]))).rejects.toMatchObject({
      code: "INVALID_UTF8",
    });
    const broken = async function* () {
      yield Buffer.from("{");
      throw new Error("private stream failure");
    };
    await expect(readUtf8Input(broken())).rejects.toMatchObject({
      code: "STDIN_ERROR",
      message: "Could not read standard input.",
    });
  });
});

describe("actual npm CLI smoke", () => {
  function command(args: string[], data: string | Buffer) {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error("Run this smoke test through npm test.");
    const result = spawnSync(process.execPath, [npmCli, "run", "--silent", "saju", "--", ...args], {
      input: data,
      encoding: "utf8",
      timeout: 15000,
      windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    return result;
  }

  it("calculates real JSON through npm run --silent saju", () => {
    const result = command(["calculate"], json);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).snapshot.provenance.libraryVersion).toBe("2.0.0");
    expect(result.stderr).toBe("");
  }, 20000);

  it("returns exit 2 and only sanitized stderr for invalid JSON", () => {
    const result = command(["calculate"], "{ private 1992-10-24");
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("INVALID_JSON");
    expect(result.stderr).not.toContain(input.birthInput.birthDate);
  }, 20000);

  it("validates BOM-prefixed input and provides help through the actual command", () => {
    const result = command(
      ["validate"],
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(json)]),
    );
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).status).toBe("valid");
    expect(result.stderr).toBe("");
    const help = command(["--help"], "");
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("validate|calculate");
    expect(help.stderr).toBe("");
  }, 20000);

  it("returns structured unavailable without inventing a time", () => {
    const result = command(
      ["calculate"],
      JSON.stringify({
        ...input,
        birthInput: { ...input.birthInput, birthTime: { status: "unknown" } },
      }),
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout).status).toBe("unavailable");
    expect(result.stdout).not.toContain('"snapshot"');
  }, 20000);

  it("enforces byte and UTF-8 limits in the actual process", () => {
    const oversized = command(["validate"], Buffer.alloc(MAX_STDIN_BYTES + 1));
    const invalidUtf8 = command(["validate"], Buffer.from([0xff]));
    expect(oversized.status).toBe(2);
    expect(oversized.stdout).toBe("");
    expect(JSON.parse(oversized.stderr).error.code).toBe("INPUT_TOO_LARGE");
    expect(invalidUtf8.status).toBe(2);
    expect(invalidUtf8.stdout).toBe("");
    expect(JSON.parse(invalidUtf8.stderr).error.code).toBe("INVALID_UTF8");
  }, 20000);
});
