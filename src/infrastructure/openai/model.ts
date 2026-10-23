import { ModelIdSchema } from "@/domain/narration/model";
export function matchesOpenAiModel(requested: string, reported: string): boolean {
  if (!ModelIdSchema.safeParse(requested).success || !ModelIdSchema.safeParse(reported).success)
    return false;
  if (requested === reported) return true;
  if (/\d{4}-\d{2}-\d{2}$/.test(requested)) return false;
  return (
    reported.startsWith(requested + "-") &&
    /^\d{4}-\d{2}-\d{2}$/.test(reported.slice(requested.length + 1))
  );
}
