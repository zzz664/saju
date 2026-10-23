import { expect, it } from "vitest";
import { readBoundedUtf8, webBytes } from "@/infrastructure/io/bounded-utf8";

async function* chunks(...values: Uint8Array[]) {
  yield* values;
}
it("decodes split Korean UTF-8 at the byte boundary and accepts the exact limit", async () => {
  const bytes = new TextEncoder().encode("한글");
  expect(await readBoundedUtf8(chunks(bytes.slice(0, 1), bytes.slice(1)), 6)).toBe("한글");
  await expect(readBoundedUtf8(chunks(bytes), 5)).rejects.toMatchObject({ code: "TOO_LARGE" });
});
it("rejects truncated/invalid UTF-8 and sanitizes source errors", async () => {
  for (const bytes of [new Uint8Array([255]), new Uint8Array([0xea])])
    await expect(readBoundedUtf8(chunks(bytes), 10)).rejects.toMatchObject({
      code: "INVALID_UTF8",
    });
  async function* broken() {
    yield new Uint8Array([97]);
    throw new Error("synthetic-private");
  }
  await expect(readBoundedUtf8(broken(), 10)).rejects.toMatchObject({
    code: "READ_FAILED",
    message: "Input stream was rejected.",
  });
});
it("cancels and releases a web reader when the limit is exceeded", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(11));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(readBoundedUtf8(webBytes(stream), 10)).rejects.toMatchObject({ code: "TOO_LARGE" });
  expect(cancelled).toBe(true);
  expect(stream.locked).toBe(false);
});
