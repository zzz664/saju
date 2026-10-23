import { calculateFourPillars, type BirthInfo } from "manseryeok";
import packageInfo from "manseryeok/package.json";

import {
  ManseryeokRequestSchema,
  ManseryeokSnapshotSchema,
  SdkPillarsProjectionSchema,
  type ManseryeokSnapshot,
} from "@/infrastructure/manseryeok/schemas";

type AdapterErrorCode =
  "LIBRARY_REJECTED_INPUT" | "LIBRARY_CALCULATION_FAILED" | "LIBRARY_OUTPUT_INVALID";

const errorMessages: Record<AdapterErrorCode, string> = {
  LIBRARY_REJECTED_INPUT: "The pinned calendar library rejected the request.",
  LIBRARY_CALCULATION_FAILED: "The pinned calendar library could not calculate the result.",
  LIBRARY_OUTPUT_INVALID: "The pinned calendar library returned an unsupported result or version.",
};

export class ManseryeokAdapterError extends Error {
  readonly code: AdapterErrorCode;

  constructor(code: AdapterErrorCode) {
    super(errorMessages[code]);
    this.name = "ManseryeokAdapterError";
    this.code = code;
  }
}

/** Actual package call, not a complete BirthInput-to-NatalCore application port. */
export function calculateManseryeokSnapshot(value: unknown): ManseryeokSnapshot {
  const request = ManseryeokRequestSchema.parse(value);
  const birthInfo: BirthInfo = {
    year: request.year,
    month: request.month,
    day: request.day,
    hour: request.hour,
    minute: request.minute,
    isLunar: request.calendarType === "lunar",
    isLeapMonth: request.isLeapMonth,
    dayBoundary: request.dayBoundary,
    // No trueSolarTime object: upstream then uses fixed UTC+09:00, with
    // no historical DST or longitude correction. No gender/luck calculation.
  };

  let raw: unknown;
  try {
    raw = calculateFourPillars(birthInfo);
  } catch (error) {
    // Upstream messages can contain dates. Do not expose them or keep a raw cause.
    throw new ManseryeokAdapterError(
      error instanceof RangeError ? "LIBRARY_REJECTED_INPUT" : "LIBRARY_CALCULATION_FAILED",
    );
  }

  const pillars = SdkPillarsProjectionSchema.safeParse(raw);
  if (!pillars.success) throw new ManseryeokAdapterError("LIBRARY_OUTPUT_INVALID");

  const result = ManseryeokSnapshotSchema.safeParse({
    pillars: pillars.data,
    provenance: {
      libraryName: packageInfo.name,
      libraryVersion: packageInfo.version,
      timeReference: request.timeReference,
      dayBoundary: request.dayBoundary,
    },
  });
  if (!result.success) throw new ManseryeokAdapterError("LIBRARY_OUTPUT_INVALID");
  return result.data;
}
