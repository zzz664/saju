import { test, expect, type Page } from "@playwright/test";

async function fillKnown(page: Page) {
  await page.goto("/dev/validation");
  await page.getByLabel("생년월일", { exact: true }).fill("2024-02-10");
  await page.getByLabel("태어난 시각", { exact: true }).fill("05:30");
}
async function calculate(page: Page) {
  const pending = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/analysis") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "계산 검증" }).click();
  const response = await pending;
  expect(response.status()).toBe(200);
  await expect(page.getByRole("status", { name: "계산 상태" })).toBeVisible();
}

test("known input reaches real API and renders core JSON, evidence, hash and prompt", async ({
  page,
}) => {
  await fillKnown(page);
  await calculate(page);
  await expect(page.getByRole("status", { name: "계산 상태" })).toHaveText("계산 완료");
  const result = JSON.parse(await page.getByLabel("분석 JSON", { exact: true }).inputValue());
  expect(result.document.facts.sourcePillars.hour).not.toBeNull();
  expect(result.fingerprint.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(result.document.evaluation.results).toHaveLength(20);
  await expect(page.getByRole("heading", { name: "판단과 근거" })).toBeVisible();
  await expect(page.getByLabel("수동 ChatGPT 프롬프트", { exact: true })).toContainText(
    "verifiedFindings",
  );
  expect(JSON.stringify(result)).not.toContain("2024-02-10");
});

test("unknown time and zi-start keep day/hour unconfirmed", async ({ page }) => {
  await fillKnown(page);
  await page.getByLabel("태어난 시각 미상", { exact: true }).check();
  await expect(page.getByLabel("태어난 시각", { exact: true })).toBeDisabled();
  await page.getByLabel("일자 경계", { exact: true }).selectOption("zi-start");
  await calculate(page);
  await expect(page.getByRole("status", { name: "계산 상태" })).toHaveText("일부 정보 미상");
  const result = JSON.parse(await page.getByLabel("분석 JSON", { exact: true }).inputValue());
  expect(result.document.facts.sourcePillars.hour).toBeNull();
  expect(result.document.facts.dayMaster).toBeNull();
});

test("missing solar longitude stays unavailable", async ({ page }) => {
  await fillKnown(page);
  await page.getByLabel("태양시 정책", { exact: true }).selectOption("true-solar");
  await calculate(page);
  await expect(page.getByRole("status", { name: "계산 상태" })).toHaveText("계산 불가");
  expect(
    JSON.parse(await page.getByLabel("분석 JSON", { exact: true }).inputValue()).document
      .calculation.reasons,
  ).toContain("LONGITUDE_UNKNOWN");
});

for (const [date, leap] of [
  ["2023-02-30", false],
  ["2023-02-01", true],
] as const) {
  test(`lunar input ${date} leap=${leap} reaches the real calendar adapter`, async ({ page }) => {
    await fillKnown(page);
    await page.getByLabel("달력", { exact: true }).selectOption("lunar");
    await page.getByLabel("생년월일", { exact: true }).fill(date);
    await page.getByLabel("음력 윤달", { exact: true }).setChecked(leap);
    await calculate(page);
    await expect(page.getByRole("status", { name: "계산 상태" })).toHaveText("계산 완료");
    const result = JSON.parse(await page.getByLabel("분석 JSON", { exact: true }).inputValue());
    expect(result.document.facts.sourcePillars.day).not.toBeNull();
  });
}

test("invalid timezone is rejected before a POST", async ({ page }) => {
  await fillKnown(page);
  let posts = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/analysis") && request.method() === "POST") posts++;
  });
  await page.getByLabel("시간대", { exact: true }).fill("Invalid/Timezone");
  await page.getByRole("button", { name: "계산 검증" }).click();
  await expect(page.getByRole("alert", { name: "입력 및 요청 오류" })).toContainText("입력값");
  expect(posts).toBe(0);
});

test("editing clears stale output and server errors never retain old results", async ({ page }) => {
  await fillKnown(page);
  await calculate(page);
  await page.getByLabel("생년월일", { exact: true }).fill("2024-02-11");
  await expect(page.getByLabel("분석 JSON", { exact: true })).toHaveCount(0);
  await page.route("**/api/analysis", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":{"message":"private secret"}}',
    }),
  );
  await page.getByRole("button", { name: "계산 검증" }).click();
  await expect(page.getByRole("alert", { name: "입력 및 요청 오류" })).toContainText(
    "처리하지 못했습니다",
  );
  await expect(page.getByRole("alert", { name: "입력 및 요청 오류" })).not.toContainText("secret");
  await expect(page.getByLabel("분석 JSON", { exact: true })).toHaveCount(0);
});

test("copies complete JSON and prompt through browser clipboard", async ({ page }) => {
  await fillKnown(page);
  await calculate(page);
  for (const [button, label] of [
    ["JSON 복사", "분석 JSON"],
    ["프롬프트 복사", "수동 ChatGPT 프롬프트"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // Windows clipboard text uses CRLF; textarea DOM values use LF.
    const expected = await page.getByLabel(label, { exact: true }).inputValue();
    expect(copied.replace(/\r\n/g, "\n") === expected).toBe(true);
  }
});

test("bad server payload is rejected instead of displayed", async ({ page }) => {
  await fillKnown(page);
  await page.route("**/api/analysis", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  await page.getByRole("button", { name: "계산 검증" }).click();
  await expect(page.getByRole("alert", { name: "입력 및 요청 오류" })).toContainText(
    "검증할 수 없는",
  );
  await expect(page.getByLabel("분석 JSON", { exact: true })).toHaveCount(0);
});

for (const width of [320, 390, 768, 1440]) {
  test(`input and long JSON fit ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await fillKnown(page);
    await calculate(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    if (width === 320)
      await page.screenshot({ path: "test-results/developer-320.png", fullPage: true });
  });
}
