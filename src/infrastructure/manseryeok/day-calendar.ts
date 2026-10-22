import { DaySnapshotSchema, CalendarAdapterError, type CalendarRequest, type DayCalendarAdapter } from "@/domain/calendar";
import { manseryeokCalendarAdapter } from "./port";

export const manseryeokDayCalendarAdapter: DayCalendarAdapter = Object.freeze({
  calculateDay(request: CalendarRequest) {
    // The pinned adapter validates the request, calls the real SDK and sanitizes failures.
    // Do not introduce a second day-pillar formula or guess a missing clock here.
    const snapshot = manseryeokCalendarAdapter.calculate(request);
    const result = DaySnapshotSchema.safeParse({
      pillars: { day: snapshot.pillars.day },
      provenance: { ...snapshot.provenance, ruleId: "calendar.day-pillar", ruleVersion: "1.0.0" },
    });
    if (!result.success) throw new CalendarAdapterError("OUTPUT_INVALID");
    return result.data;
  },
});
