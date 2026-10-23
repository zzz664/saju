import { z } from "zod";

import { CalendarPillarsSchema } from "@/domain/calendar";

// Retain the WBS-01 API while keeping the shared contract outside infrastructure.
export {
  CalendarRequestSchema as ManseryeokRequestSchema,
  CalendarSnapshotSchema as ManseryeokSnapshotSchema,
  type CalendarRequest as ManseryeokRequest,
  type CalendarSnapshot as ManseryeokSnapshot,
} from "@/domain/calendar";

// Project only pillar data from the richer SDK object; never expose its methods.
export const SdkPillarsProjectionSchema = z.object(CalendarPillarsSchema.shape).readonly();
