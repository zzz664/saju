import { FingerprintError } from "@/domain/core-fingerprint/error";
/** sorted-json-v1: UTF-16 key order, original array order, JSON string/number encoding. */
export function canonicalizeJson(value: unknown): string {
  const ancestors = new Set<object>();
  function encode(item: unknown, depth: number): string {
    const reject = () => {
      throw new FingerprintError("JSON_REJECTED");
    };
    if (depth > 64) return reject();
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return JSON.stringify(item);
    if (typeof item === "number") return Number.isFinite(item) ? JSON.stringify(item) : reject();
    if (
      typeof item !== "object" ||
      ancestors.has(item) ||
      Object.getOwnPropertySymbols(item).length > 0
    )
      return reject();
    const array = Array.isArray(item),
      prototype = Object.getPrototypeOf(item);
    if (
      array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
    )
      return reject();
    const descriptors = Object.getOwnPropertyDescriptors(item);
    ancestors.add(item);
    try {
      const property = (key: string) => {
        const descriptor = descriptors[key];
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return reject();
        return encode(descriptor.value, depth + 1);
      };
      if (array) {
        if (Object.keys(descriptors).length !== item.length + 1) return reject();
        return (
          "[" +
          Array.from({ length: item.length }, (_, index) => property(String(index))).join(",") +
          "]"
        );
      }
      // Build text directly: integer-looking keys would be reordered by JSON.stringify(object).
      return (
        "{" +
        Object.keys(descriptors)
          .sort()
          .map((key) => JSON.stringify(key) + ":" + property(key))
          .join(",") +
        "}"
      );
    } finally {
      ancestors.delete(item);
    }
  }
  return encode(value, 0);
}

export function deepEqualCanonical(a: unknown, b: unknown): boolean {
  return canonicalizeJson(a) === canonicalizeJson(b);
}
