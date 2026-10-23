export const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function isGregorianDate({
  year,
  month,
  day,
}: {
  year: number;
  month: number;
  day: number;
}): boolean {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (
    day >= 1 &&
    day <= ([31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0)
  );
}
export function escapeJsonForPrompt(value: unknown, space?: number): string {
  return JSON.stringify(value, null, space).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
/** Keep each public error class and code union, with no raw cause/message attachment. */
export function defineCodedError<const T extends Record<string, string>>(
  name: string,
  messages: T,
) {
  return class extends Error {
    constructor(readonly code: keyof T) {
      super(messages[code]);
      this.name = name;
    }
  };
}
