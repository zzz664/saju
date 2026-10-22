export const MAX_STDIN_BYTES = 64 * 1024;

const messages = {
  INPUT_TOO_LARGE: "Standard input exceeds 64 KiB.",
  INVALID_UTF8: "Standard input must be valid UTF-8.",
  STDIN_ERROR: "Could not read standard input.",
} as const;

export class CliInputError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "CliInputError";
  }
}

export async function readUtf8Input(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of stream) {
      size += chunk.byteLength;
      if (size > MAX_STDIN_BYTES) throw new CliInputError("INPUT_TOO_LARGE");
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof CliInputError) throw error;
    throw new CliInputError("STDIN_ERROR");
  }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); }
  catch { throw new CliInputError("INVALID_UTF8"); }
}
