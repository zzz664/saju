export function digestText(text: string): string;
export function stripWikitext(source: string): string;
export function extractSection(text: string, locator: string): string | null;
export function htmlToText(html: string): string;
export function listHeadings(text: string): string[];
export type WikisourcePage = { wikitext: string; text: string | null };
export function extractFromPage(page: WikisourcePage, locator: string): string | null;
export function monthsInPrefix(prefix: string): number[];
export function monthLocator(
  locator: string,
): { month: number; subject: string; test(line: string): boolean } | null;
export function candidateLines(text: string, locator: string, limit?: number): string[];
export function pageTextOf(page: WikisourcePage): string;
export function boundPassage(text: string, maxCharacters?: number): string;
export function wikisourceApiUrl(title: string): string;
export function titleFromUrl(url: string): string;
export class WikisourcePageError extends Error {
  code: string;
  title: string;
  constructor(code: string, title: string);
}
export function createWikitextLoader(options?: {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  delayMs?: number;
  maxRetries?: number;
}): { load(title: string): Promise<WikisourcePage>; readonly requests: number };
export const SUMMARY_PROMPT_VERSION: string;
export const SUMMARY_INSTRUCTIONS: string;
export const ENTAILMENT_INSTRUCTIONS: string;
export function summaryRequestBody(
  model: string,
  passage: string,
  locator: string,
): {
  model: string;
  store: false;
  stream: false;
  instructions: string;
  input: { role: "user"; content: string }[];
  max_output_tokens: number;
};
export function entailmentRequestBody(
  model: string,
  passage: string,
  summary: string,
): ReturnType<typeof summaryRequestBody>;
export function outputTextOf(envelope: unknown): string | null;
export function parseEntailmentVerdict(text: string | null | undefined): "passed" | "failed" | null;
