import { ZodError } from "zod";

import { CalendarAdapterError, type CalendarAdapter, type CalendarRequest } from "../../domain/calendar/index";
import { calculateManseryeokSnapshot, ManseryeokAdapterError } from "./adapter";

export const manseryeokCalendarAdapter: CalendarAdapter = Object.freeze({
  calculate(request: CalendarRequest) {
    try {
      return calculateManseryeokSnapshot(request);
    } catch (error) {
      if (error instanceof ZodError || (error instanceof ManseryeokAdapterError && error.code === "LIBRARY_REJECTED_INPUT")) {
        throw new CalendarAdapterError("INPUT_REJECTED");
      }
      if (error instanceof ManseryeokAdapterError && error.code === "LIBRARY_OUTPUT_INVALID") {
        throw new CalendarAdapterError("OUTPUT_INVALID");
      }
      throw new CalendarAdapterError("CALCULATION_FAILED");
    }
  },
});
