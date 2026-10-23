import { describe, expect, it } from "vitest";
import { PolicyPillarsRequestSchema } from "@/domain/policy-calendar";
import { manseryeokPolicyCalendarAdapter } from "@/infrastructure/manseryeok";
import golden from "./fixtures/hour-policy-golden.json";

function request(
  clock: string,
  dayBoundary: "midnight" | "zi-start" = "midnight",
  instant = "2024-02-10T03:00:00Z",
) {
  return { instant, policyClock: clock, dayBoundary };
}

describe("explicit day/hour policy using the pinned SDK", () => {
  it.each([
    ["midnight", "22:59", "갑진", "을해"],
    ["midnight", "23:00", "갑진", "갑자"],
    ["midnight", "23:59", "갑진", "갑자"],
    ["zi-start", "22:59", "갑진", "을해"],
    ["zi-start", "23:00", "을사", "병자"],
    ["zi-start", "23:59", "을사", "병자"],
  ] as const)(
    "maps %s at %s to independently derived day %s and hour %s",
    (dayBoundary, clock, day, hour) => {
      const result = manseryeokPolicyCalendarAdapter.calculate(
        request(`2024-02-10T${clock}:00.000`, dayBoundary),
      );
      expect(result.pillars.day.heavenlyStem + result.pillars.day.earthlyBranch).toBe(day);
      expect(result.pillars.hour.heavenlyStem + result.pillars.hour.earthlyBranch).toBe(hour);
      expect(result.request).toEqual(request(`2024-02-10T${clock}:00.000`, dayBoundary));
    },
  );

  it.each(["midnight", "zi-start"] as const)(
    "uses the same new civil day at midnight for %s",
    (dayBoundary) => {
      const result = manseryeokPolicyCalendarAdapter.calculate(
        request("2024-02-11T00:00:00.000", dayBoundary),
      );
      expect(result.pillars.day).toEqual({ heavenlyStem: "을", earthlyBranch: "사" });
      expect(result.pillars.hour).toEqual({ heavenlyStem: "병", earthlyBranch: "자" });
    },
  );

  it.each(golden.gapGiHours)("uses independent HKO hour correspondence at $clock", (fixture) => {
    const { hour } = manseryeokPolicyCalendarAdapter.calculate(
      request(`${golden.dayAnchor.solarDate}T${fixture.clock}:00.000`),
    ).pillars;
    expect(hour.heavenlyStem + hour.earthlyBranch).toBe(fixture.hour);
  });

  it("keeps year/month at the absolute lichun instant, independently of the day/hour clock", () => {
    const before = manseryeokPolicyCalendarAdapter.calculate(
      request("2024-02-04T18:00:00.000", "zi-start", "2024-02-04T08:26:59Z"),
    );
    const after = manseryeokPolicyCalendarAdapter.calculate(
      request("2024-02-04T16:00:00.000", "midnight", "2024-02-04T08:27:00Z"),
    );
    expect(before.pillars).toMatchObject({
      year: { heavenlyStem: "계", earthlyBranch: "묘" },
      month: { heavenlyStem: "을", earthlyBranch: "축" },
    });
    expect(after.pillars).toMatchObject({
      year: { heavenlyStem: "갑", earthlyBranch: "진" },
      month: { heavenlyStem: "병", earthlyBranch: "인" },
    });
  });

  it("floors the policy minute without rounding across an hour boundary", () => {
    expect(
      manseryeokPolicyCalendarAdapter.calculate(request("2024-02-10T00:59:59.999")).pillars.hour
        .earthlyBranch,
    ).toBe("자");
    expect(
      manseryeokPolicyCalendarAdapter.calculate(request("2024-02-10T01:00:00.000")).pillars.hour
        .earthlyBranch,
    ).toBe("축");
  });

  it.each([
    ["2024-02-29T23:00:00.000", "갑자"],
    ["2024-12-31T23:00:00.000", "경오"],
  ])("handles date-cycle rollover %s", (clock, expected) => {
    const { day } = manseryeokPolicyCalendarAdapter.calculate(request(clock, "zi-start")).pillars;
    expect(day.heavenlyStem + day.earthlyBranch).toBe(expected);
  });

  it.each([
    {},
    request("bad"),
    request("2024-02-30T12:00:00.000"),
    { ...request("2024-02-10T12:00:00.000"), dayBoundary: "splitJasi" },
    request("1799-12-31T23:59:00.000"),
    request("2024-01-01T12:00:00.000", "midnight", "2300-12-31T23:59:00Z"),
  ])("rejects invalid or unsupported requests %j", (value) => {
    expect(PolicyPillarsRequestSchema.safeParse(value).success).toBe(false);
    expect(() => manseryeokPolicyCalendarAdapter.calculate(value as never)).toThrow(
      expect.objectContaining({ code: "INPUT_REJECTED" }),
    );
  });
});
