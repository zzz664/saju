import { performance } from "node:perf_hooks";
import { calculatePolicySaju } from "../src/application/policy-saju/index";
import { createCoreDependencies } from "../src/server/core-dependencies";

const dependencies = createCoreDependencies();
const input = {
  birthInput: {
    calendarType: "solar",
    birthDate: "2024-02-10",
    isLeapMonth: false,
    birthTime: { status: "unknown" },
    timezoneId: "Asia/Seoul",
    longitudeDeg: 127.5,
    latitudeDeg: null,
    directionBasis: "unspecified",
  },
  calculationPolicy: {
    solarTime: "standard",
    dayBoundary: "midnight",
    dstDisambiguation: "reject",
  },
};
function measure(scoped: boolean) {
  const selected = scoped
    ? dependencies
    : {
        ...dependencies,
        timeZone: { resolve: dependencies.timeZone.resolve },
        pillars: { calculate: dependencies.pillars.calculate },
      };
  const start = performance.now();
  const result = calculatePolicySaju(input, selected);
  return { ms: Math.round(performance.now() - start), result };
}
const baseline = measure(false),
  optimized = measure(true);
if (JSON.stringify(baseline.result) !== JSON.stringify(optimized.result))
  throw new Error("Candidate result mismatch.");
const samples = [optimized.ms, measure(true).ms, measure(true).ms];
console.log(
  JSON.stringify({
    fixture: "synthetic-candidate-day",
    exhaustiveMs: baseline.ms,
    scopedMs: samples,
    actualApiCalls: 0,
  }),
);
