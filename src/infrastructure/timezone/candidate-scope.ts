import { Temporal } from "@js-temporal/polyfill";
import {
  LocalTimeRequestSchema,
  TimeZoneResultSchema,
  type LocalTimeRequest,
  type TimeZoneAdapter,
  type TimeZoneResult,
} from "@/domain/timezone";

/** Reuse only affine ranges certified by Temporal's transition table, never samples. */
export function candidateTimeZoneScope(base: TimeZoneAdapter): TimeZoneAdapter {
  let key = "";
  let boundaries: number[] = [];
  const anchors = new Map<number, TimeZoneResult>();
  return {
    resolve(value: LocalTimeRequest) {
      const request = LocalTimeRequestSchema.parse(value);
      const date = request.localDateTime.slice(0, 10);
      const nextKey = `${date}/${request.timezoneId}/${request.disambiguation}`;
      const localMs = Date.parse(request.localDateTime + ":00Z");
      if (nextKey !== key) {
        // Offsets are bounded by one day by our port. Both sides of even a skipped
        // date are covered; second-resolution historical transitions round upward
        // to the first affected input minute.
        const midnight = Date.parse(date + "T00:00:00Z");
        const cuts = new Set([0, 1440]);
        let cursor = Temporal.Instant.fromEpochMilliseconds(
          midnight - 2 * 86400000,
        ).toZonedDateTimeISO(request.timezoneId);
        while (true) {
          const next = cursor.getTimeZoneTransition("next");
          if (!next || next.epochMilliseconds > midnight + 2 * 86400000) break;
          const before = Temporal.Instant.fromEpochMilliseconds(
            next.epochMilliseconds - 1,
          ).toZonedDateTimeISO(request.timezoneId);
          for (const offset of [before.offsetNanoseconds, next.offsetNanoseconds]) {
            const minute = Math.ceil(
              (next.epochMilliseconds + offset / 1_000_000 - midnight) / 60000,
            );
            if (minute > 0 && minute < 1440) cuts.add(minute);
          }
          cursor = next;
        }
        boundaries = [...cuts].sort((a, b) => a - b);
        anchors.clear();
        key = nextKey;
      }
      const minute =
        Number(request.localDateTime.slice(11, 13)) * 60 +
        Number(request.localDateTime.slice(14, 16));
      const start = boundaries.findLast((cut) => cut <= minute)!;
      const anchor = anchors.get(start);
      if (!anchor) {
        const result = base.resolve(request);
        anchors.set(start, result);
        return result;
      }
      if (anchor.status === "rejected") return TimeZoneResultSchema.parse({ ...anchor, request });
      const elapsed = localMs - Date.parse(anchor.request.localDateTime + ":00Z");
      return TimeZoneResultSchema.parse({
        ...anchor,
        request,
        resolved: {
          ...anchor.resolved,
          instant: new Date(Date.parse(anchor.resolved.instant) + elapsed)
            .toISOString()
            .replace(".000Z", "Z"),
          localDateTime: new Date(Date.parse(anchor.resolved.localDateTime + "Z") + elapsed)
            .toISOString()
            .slice(0, 19),
        },
      });
    },
  };
}
