import { describe, expect, it } from "vitest";
import { createApprovedPersonaCatalog } from "@/domain/persona/catalog";
import { createApiTestCatalog } from "@/server/api-test-catalog";
import { preparePersonaNarration } from "@/domain/persona/narration";

const base = () => {
  const catalog = createApiTestCatalog();
  return catalog.registry.load(catalog.selection("synthetic-style"));
};
const registration = (profile: ReturnType<typeof base>) => ({
  status: "approved",
  personaId: profile.personaId,
  personaVersion: profile.personaVersion,
  json: JSON.stringify(profile),
});

describe("approved persona catalog independent of character count", () => {
  it("keeps an empty default and does not implicitly approve a profile", () => {
    const catalog = createApprovedPersonaCatalog();
    expect(catalog.personas).toEqual([]);
    expect(() => catalog.selection("synthetic-style")).toThrow();
    expect(() =>
      createApprovedPersonaCatalog([{ ...registration(base()), status: "pending" }], []),
    ).toThrow();
  });

  it("adds a third persona through data and active selections without changing prompt or execution code", () => {
    const source = createApiTestCatalog();
    const profiles = source.personas.map((item) => source.registry.load(source.selection(item.id)));
    const third = { ...base(), personaId: "synthetic-third", displayName: "가상 추가 프로필" };
    const all = [...profiles, third];
    const catalog = createApprovedPersonaCatalog(
      all.map(registration),
      all.map(({ personaId, personaVersion }) => ({ personaId, personaVersion })),
    );
    expect(catalog.personas).toHaveLength(3);
    const core = source.core("synthetic-known");
    const request = preparePersonaNarration(core, {
      ...source,
      ...catalog,
      selection: catalog.selection(third.personaId),
    });
    const supplied = JSON.parse(request.request.input[0].content.split("\n").at(-1)!).persona;
    expect(supplied).toEqual(third);
    expect(request.cache.analysisKey).toBe(
      preparePersonaNarration(core, { ...source, selection: source.selection("synthetic-style") })
        .cache.analysisKey,
    );
  });

  it("pins an explicit active version while retaining exact historical registry versions", () => {
    const previous = base(),
      current = { ...previous, personaVersion: "1.0.1" };
    const selection = { personaId: current.personaId, personaVersion: current.personaVersion };
    const catalog = createApprovedPersonaCatalog(
      [registration(previous), registration(current)],
      [selection],
    );
    expect(catalog.selection(current.personaId)).toEqual(selection);
    expect(catalog.registry.load({ ...selection, personaVersion: "1.0.0" })).toEqual(previous);
    expect(() => catalog.registry.load({ ...selection, personaVersion: "9.0.0" })).toThrow();
    expect(catalog.personas).toHaveLength(1);
  });

  it("rejects absent, duplicate and malformed active selections instead of choosing a fallback", () => {
    const profile = base(),
      manifest = [registration(profile)];
    const selection = { personaId: profile.personaId, personaVersion: profile.personaVersion };
    for (const active of [
      [{ ...selection, personaId: "missing" }],
      [{ ...selection, personaVersion: "9.0.0" }],
      [selection, selection],
      [{ ...selection, path: "../private.json" }],
    ]) {
      expect(() => createApprovedPersonaCatalog(manifest, active)).toThrow();
    }
  });
});
