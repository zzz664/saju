export function digestText(text: string): string;
export function stripWikitext(source: string): string;
export function extractSection(text: string, locator: string): string | null;
export function htmlToText(html: string): string;
export function listHeadings(text: string): string[];
export type WikisourcePage = { wikitext: string; text: string | null };
export function extractFromPage(page: WikisourcePage, locator: string): string | null;
export type LocateHit = { passage: string; locator: string; via: string };
export function locate(text: string, locator: string): LocateHit | null;
export function locateInPage(page: WikisourcePage, locator: string): LocateHit | null;
export function monthsInPrefix(prefix: string): number[];
export function monthLocator(locator: string): {
  month: number;
  subject: string;
  season: string;
  monthsOf(line: string, scoped?: boolean): number[] | null;
  test(line: string, scoped?: boolean): boolean;
  exact(line: string, scoped?: boolean): boolean;
} | null;
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
export function parseEntailmentReason(text: string | null | undefined): string | null;
