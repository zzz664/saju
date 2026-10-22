import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { versions } from "node:process";
import { pathToFileURL } from "node:url";
import { Temporal } from "@js-temporal/polyfill";

import { LocalTimeRequestSchema, TimeZoneAdapterError, TimeZoneResultSchema, type LocalTimeRequest, type TimeZoneAdapter } from "@/domain/timezone";

// The pinned package exposes no package.json subpath. Read beside its public dist entry.
const entry = createRequire(import.meta.url).resolve("@js-temporal/polyfill");
const manifest: { name: string; version: string } = JSON.parse(readFileSync(new URL("../package.json", pathToFileURL(entry)), "utf8"));
const provenance = {
  engineName: manifest.name, engineVersion: manifest.version,
  icuVersion: versions.icu, tzdbVersion: versions.tz,
  ruleId: "time.local-to-instant", ruleVersion: "1.0.0",
};

export const temporalTimeZoneAdapter: TimeZoneAdapter = Object.freeze({
  resolve(value: LocalTimeRequest) {
    const parsed = LocalTimeRequestSchema.safeParse(value);
    if (!parsed.success) throw new TimeZoneAdapterError("INPUT_REJECTED");
    const request = parsed.data;
    let raw: unknown;
    try {
      const plain = Temporal.PlainDateTime.from(request.localDateTime, { overflow: "reject" });
      const earlier = plain.toZonedDateTime(request.timezoneId, { disambiguation: "earlier" });
      const later = plain.toZonedDateTime(request.timezoneId, { disambiguation: "later" });
      const kind = earlier.epochNanoseconds === later.epochNanoseconds ? "unique"
        : earlier.toPlainDateTime().equals(plain) && later.toPlainDateTime().equals(plain) ? "fold" : "gap";
      if (kind !== "unique" && request.disambiguation === "reject") {
        raw = { status: "rejected", kind, request, provenance, reason: kind === "fold" ? "AMBIGUOUS_LOCAL_TIME" : "NONEXISTENT_LOCAL_TIME" };
      } else {
        const selected = request.disambiguation === "later" ? later : earlier;
        raw = {
          status: "resolved", kind, request, provenance,
          resolved: {
            instant: selected.toInstant().toString({ smallestUnit: "second" }),
            localDateTime: selected.toPlainDateTime().toString({ smallestUnit: "second" }),
            offsetSeconds: selected.offsetNanoseconds / 1_000_000_000,
          },
        };
      }
    } catch {
      // Never preserve provider messages that may contain original birth values.
      throw new TimeZoneAdapterError("RESOLUTION_FAILED");
    }
    const result = TimeZoneResultSchema.safeParse(raw);
    if (!result.success) throw new TimeZoneAdapterError("OUTPUT_INVALID");
    return result.data;
  },
});
