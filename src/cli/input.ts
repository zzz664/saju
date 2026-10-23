import { readBoundedUtf8, BoundedInputError } from "@/infrastructure/io/bounded-utf8";

import { defineCodedError } from "@/domain/utilities";
export const MAX_STDIN_BYTES = 64 * 1024;

const messages = {
  INPUT_TOO_LARGE: "Standard input exceeds 64 KiB.",
  INVALID_UTF8: "Standard input must be valid UTF-8.",
  STDIN_ERROR: "Could not read standard input.",
} as const;

export class CliInputError extends defineCodedError("CliInputError", messages) {}

export async function readUtf8Input(stream: AsyncIterable<Uint8Array>): Promise<string> {
  try {
    return await readBoundedUtf8(stream, MAX_STDIN_BYTES);
  } catch (cause) {
    throw new CliInputError(
      cause instanceof BoundedInputError
        ? cause.code === "TOO_LARGE"
          ? "INPUT_TOO_LARGE"
          : cause.code === "INVALID_UTF8"
            ? "INVALID_UTF8"
            : "STDIN_ERROR"
        : "STDIN_ERROR",
    );
  }
}
