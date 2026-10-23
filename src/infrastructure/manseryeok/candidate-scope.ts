import { getSolarTermsOfYear } from "manseryeok";
import { CalendarAdapterError } from "@/domain/calendar";
import {
  PolicyPillarsRequestSchema,
  type PolicyCalendarAdapter,
  type PolicyPillarsSnapshot,
} from "@/domain/policy-calendar";

/** Cache full SDK projections only within one absolute jeol and policy day/hour. */
export function candidatePolicyCalendarScope(base: PolicyCalendarAdapter): PolicyCalendarAdapter {
  const years = new Map<number, readonly number[]>();
  const projections = new Map<string, PolicyPillarsSnapshot>();
  return {
    calculate(value) {
      const parsed = PolicyPillarsRequestSchema.safeParse(value);
      if (!parsed.success) throw new CalendarAdapterError("INPUT_REJECTED");
      const request = parsed.data;
      const utc = Math.floor(Date.parse(request.instant) / 60000) * 60000;
      const year = new Date(utc + 9 * 3600000).getUTCFullYear();
      let terms = years.get(year);
      if (!terms) {
        try {
          // Public pinned SDK tables, same precision as calculateFourPillars.
          terms = getSolarTermsOfYear(year)
            .filter((term) => term.index % 2 === 0)
            .map((term) => term.date.getTime());
          if (terms.length !== 12 || terms.some((term) => !Number.isFinite(term)))
            throw new Error();
        } catch {
          throw new CalendarAdapterError("CALCULATION_FAILED");
        }
        years.set(year, terms);
      }
      const jeol = terms.filter((term) => term <= utc).length;
      const hour = Number(request.policyClock.slice(11, 13));
      const key = `${year}/${jeol}/${request.policyClock.slice(0, 10)}/${Math.floor((hour + 1) / 2)}/${request.dayBoundary}`;
      const previous = projections.get(key);
      if (previous) return Object.freeze({ ...previous, request });
      const snapshot = base.calculate(request);
      projections.set(key, snapshot);
      return snapshot;
    },
  };
}
