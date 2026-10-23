import { createDeveloperAnalysisHandler } from "../../../server/developer-analysis";
import { manseryeokCalendarConversionAdapter, manseryeokEquationOfTimeAdapter, manseryeokPolicyCalendarAdapter, manseryeokSymbolCatalogAdapter } from "../../../infrastructure/manseryeok/index";
import { temporalTimeZoneAdapter } from "../../../infrastructure/timezone/index";
import { nodeSha256Adapter } from "../../../infrastructure/hashing/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createDeveloperAnalysisHandler({ isDevelopment: () => process.env.NODE_ENV === "development",
  dependencies: { timeZone: temporalTimeZoneAdapter, calendar: manseryeokCalendarConversionAdapter,
    equationOfTime: manseryeokEquationOfTimeAdapter, pillars: manseryeokPolicyCalendarAdapter, symbols: manseryeokSymbolCatalogAdapter },
  hash: nodeSha256Adapter,
});
export const GET = POST;
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
export const OPTIONS = POST;
export const HEAD = POST;
