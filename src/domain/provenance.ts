/** Package version is pinned in package-lock.json; adapter provenance uses package.json. */
export const PINNED_CALENDAR_LIBRARY = Object.freeze({
  name: "manseryeok",
  version: "2.0.0",
} as const);
export const SUPPORTED_RANGE = Object.freeze({
  pillars: { min: 1800, max: 2300 },
  lunar: { min: 1391, max: 2100 },
});
