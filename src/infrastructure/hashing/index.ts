import { createHash } from "node:crypto";
import type { Sha256Adapter } from "../../domain/core-fingerprint/index";

/** Local UTF-8 SHA-256; no keys, external services, files, clocks or randomness. */
export const nodeSha256Adapter: Sha256Adapter = Object.freeze({
  digest: (text: string) => createHash("sha256").update(text, "utf8").digest("hex"),
});
