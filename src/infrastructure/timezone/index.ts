import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import { versions } from "node:process";
import { dirname, resolve } from "node:path";
import { Temporal } from "@js-temporal/polyfill";
import { candidateTimeZoneScope } from "@/infrastructure/timezone/candidate-scope";

import {
  LocalTimeRequestSchema,
  TimeZoneAdapterError,
  TimeZoneResultSchema,
  type LocalTimeRequest,
  type TimeZoneAdapter,
} from "@/domain/timezone";

// The pinned package exposes no package.json subpath. Read beside its public dist entry.
// Invoke the native function indirectly so Webpack does not replace require.resolve with a module ID.
const nativeRequire = (Reflect.get(nodeModule, "createRequire") as typeof nodeModule.createRequire)(
  import.meta.url,
);
const entry = nativeRequire.resolve("@js-temporal/polyfill");
// A path expression avoids Next/Webpack treating new URL("../package.json", ...) as a build asset.
const manifest: { name: string; version: string } = JSON.parse(
  readFileSync(resolve(dirname(entry), "..", "package.json"), "utf8"),
);
const provenance = {
  engineName: manifest.name,
  engineVersion: manifest.version,
  icuVersion: versions.icu,
  tzdbVersion: versions.tz,
  ruleId: "time.local-to-instant",
  ruleVersion: "1.0.0",
};

export const temporalTimeZoneAdapter: TimeZoneAdapter = Object.freeze({
  scopeForCandidates() {
    // A wrapper that overrides resolve must opt in itself; never bypass it.
    return this.resolve === temporalTimeZoneAdapter.resolve
      ? candidateTimeZoneScope(this)
      : { resolve: this.resolve };
  },
  resolve(value: LocalTimeRequest) {
    const parsed = LocalTimeRequestSchema.safeParse(value);
    if (!parsed.success) throw new TimeZoneAdapterError("INPUT_REJECTED");
    const request = parsed.data;
    let raw: unknown;
    try {
      const plain = Temporal.PlainDateTime.from(request.localDateTime, { overflow: "reject" });
      const earlier = plain.toZonedDateTime(request.timezoneId, { disambiguation: "earlier" });
      const later = plain.toZonedDateTime(request.timezoneId, { disambiguation: "later" });
      const kind =
        earlier.epochNanoseconds === later.epochNanoseconds
          ? "unique"
          : earlier.toPlainDateTime().equals(plain) && later.toPlainDateTime().equals(plain)
            ? "fold"
            : "gap";
      if (kind !== "unique" && request.disambiguation === "reject") {
        raw = {
          status: "rejected",
          kind,
          request,
          provenance,
          reason: kind === "fold" ? "AMBIGUOUS_LOCAL_TIME" : "NONEXISTENT_LOCAL_TIME",
        };
      } else {
        const selected = request.disambiguation === "later" ? later : earlier;
        raw = {
          status: "resolved",
          kind,
          request,
          provenance,
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
