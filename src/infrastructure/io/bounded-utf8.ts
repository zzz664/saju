export class BoundedInputError extends Error {
  constructor(readonly code: "TOO_LARGE" | "INVALID_UTF8" | "READ_FAILED") {
    super("Input stream was rejected.");
  }
}

export async function* webBytes(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  let done = false;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        done = true;
        return;
      }
      yield next.value;
    }
  } finally {
    try {
      if (!done) await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
}

/** Strict streaming UTF-8 with a byte limit, independent of CLI/HTTP error policy. */
export async function readBoundedUtf8(
  stream: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<string> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const parts: string[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.byteLength;
      if (size > maxBytes) throw new BoundedInputError("TOO_LARGE");
      try {
        parts.push(decoder.decode(chunk, { stream: true }));
      } catch {
        throw new BoundedInputError("INVALID_UTF8");
      }
    }
  } catch (cause) {
    throw cause instanceof BoundedInputError ? cause : new BoundedInputError("READ_FAILED");
  }
  try {
    parts.push(decoder.decode());
  } catch {
    throw new BoundedInputError("INVALID_UTF8");
  }
  return parts.join("");
}
