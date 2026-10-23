import { test, expect, type Page } from "@playwright/test";

async function unlock(page: Page) {
  await page.goto("/dev/api-test");
  await page.getByLabel("잠금해제 비밀").fill("synthetic-unlock-secret-for-e2e-only-0001");
  await page.getByRole("button", { name: "잠금해제", exact: true }).click();
  await expect(page.getByRole("button", { name: "테스트 실행" })).toBeEnabled();
}
test("locked developer APIs require a session and no mode interaction automatically runs", async ({
  page,
  request,
}) => {
  expect((await request.get("/api/dev/api-test/config")).status()).toBe(401);
  let runs = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/runs")) runs++;
  });
  await unlock(page);
  expect(runs).toBe(0);
  await page.getByRole("radio", { name: "Live", exact: true }).check();
  await expect(page.getByText(/LIVE_BLOCKED/)).toBeVisible();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "테스트 실행" })).toBeDisabled();
  expect(runs).toBe(0);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Mock", exact: true })).toBeChecked();
  expect(runs).toBe(0);
  const cookie = (await page.context().cookies()).find((item) => item.name === "saju_api_test")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
});

test("Mock button reuses R01, shows prose and exports only evidence metadata", async ({ page }) => {
  await unlock(page);
  const response = page.waitForResponse(
    (response) => response.url().endsWith("/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "테스트 실행" }).click();
  const run = await (await response).json();
  expect(run.evidence).toBe("MOCK_PASS");
  expect(run.result.meta.providerKind).toBe("mock");
  expect(run.modelId).toBe("gpt-4.1-mini");
  expect(run.result.meta.modelId).toBe("gpt-4.1-mini");
  await expect(page.getByText("gpt-4.1-mini", { exact: true })).toBeVisible();
  const fetched = await page.request.get("/api/dev/api-test/runs/" + run.testRunId);
  expect(fetched.status()).toBe(200);
  expect((await fetched.json()).testRunId).toBe(run.testRunId);
  await expect(page.getByRole("heading", { name: "MOCK_PASS" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Mock 실행 결과" })).toContainText("확인된 관찰");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "비식별 증빙 내보내기" }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("mock-test-evidence.json");
  const stream = await exported.createReadStream();
  let content = "";
  for await (const chunk of stream!) content += chunk.toString();
  expect(JSON.parse(content)).not.toHaveProperty("result");
  expect(content).not.toMatch(/birthDate|synthetic-unlock-secret|csrfToken/);
  expect(JSON.parse(content)).toMatchObject({
    personaVersion: "1.0.0",
    promptVersion: "1.0.1",
    commonPromptVersion: "1.0.0",
    schemaVersion: "1.0.0",
  });
  expect(await page.locator("body").innerText()).not.toContain("synthetic-unlock-secret");
});

test("unknown-time fixture preserves partial status and formal persona", async ({ page }) => {
  await unlock(page);
  await page.getByLabel("가상 사례", { exact: true }).selectOption("synthetic-unknown");
  await page.getByLabel("합성 문체").selectOption("synthetic-formal");
  const response = page.waitForResponse(
    (response) => response.url().endsWith("/runs") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "테스트 실행" }).click();
  const run = await (await response).json();
  expect(run.result.sourceStatus).toBe("partial");
  expect(run.result.meta.personaId).toBe("synthetic-formal");
  expect(run.personaVersion).toBe("1.0.1");
  expect(run.result.meta.personaVersion).toBe("1.0.1");
  await expect(page.getByRole("heading", { name: "MOCK_PASS" })).toBeVisible();
});

test("simulated Live UI requires consent and an explicit click, locks controls and exports usage", async ({
  page,
}) => {
  // Browser transport simulation only. Server remains keyless with Live disabled.
  await page.route("**/api/dev/api-test/config", async (route) => {
    const response = await route.fetch();
    if (!response.ok()) {
      await route.fulfill({ response });
      return;
    }
    const config = await response.json();
    await route.fulfill({
      response,
      json: {
        ...config,
        keyStatus: "ready",
        liveAvailable: true,
        liveStatus: "LIVE_NOT_RUN",
        liveReason: "READY",
      },
    });
  });
  let calls = 0,
    release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/dev/api-test/runs", async (route) => {
    calls++;
    expect(route.request().postDataJSON()).toMatchObject({ mode: "live", acknowledgedCost: true });
    await gate;
    await route.fulfill({
      json: {
        testRunId: "00000000-0000-4000-8000-000000000001",
        mode: "live",
        scenario: "narration",
        featureId: "core-base",
        modelId: "gpt-4o-mini",
        personaId: "synthetic-style",
        status: "passed",
        personaVersion: "1.0.0",
        promptVersion: "1.0.0",
        commonPromptVersion: "1.0.0",
        schemaVersion: "1.0.0",
        startedAt: "2026-10-23T00:00:00Z",
        finishedAt: "2026-10-23T00:00:01Z",
        durationMs: 1000,
        inputTokens: 100,
        outputTokens: 60,
        providerStatus: "completed",
        evidence: "LIVE_PASS",
        verdict: { evidenceIdsValid: true, styleHeuristicPassed: true },
      },
    });
  });
  await unlock(page);
  await page.getByRole("radio", { name: "Live", exact: true }).check();
  await expect(page.getByRole("button", { name: "테스트 실행" })).toBeDisabled();
  expect(calls).toBe(0);
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: "테스트 실행" })).toBeEnabled();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "테스트 실행" }).click();
  await expect.poll(() => calls).toBe(1);
  await expect(page.getByRole("radio", { name: "Mock", exact: true })).toBeDisabled();
  await expect(page.getByLabel("가상 사례", { exact: true })).toBeDisabled();
  release();
  await expect(page.getByRole("heading", { name: "LIVE_PASS" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Live 실행 결과" })).toContainText("100");
  await expect(page.getByRole("region", { name: "Live 실행 결과" })).toContainText("60");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "비식별 증빙 내보내기" }).click();
  expect((await download).suggestedFilename()).toBe("live-test-evidence.json");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Mock", exact: true })).toBeChecked();
  expect(calls).toBe(1);
});

test("completed Live response shows quality failure reasons separately from API completion", async ({
  page,
}) => {
  await page.route("**/api/dev/api-test/config", async (route) => {
    const response = await route.fetch();
    if (!response.ok()) {
      await route.fulfill({ response });
      return;
    }
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        keyStatus: "ready",
        liveAvailable: true,
        liveStatus: "LIVE_NOT_RUN",
        liveReason: "READY",
      },
    });
  });
  let calls = 0;
  await page.route("**/api/dev/api-test/runs", async (route) => {
    calls++;
    await route.fulfill({
      json: {
        testRunId: "00000000-0000-4000-8000-000000000002",
        mode: "live",
        scenario: "narration",
        featureId: "core-base",
        modelId: "gpt-4o-mini",
        personaId: "synthetic-style",
        status: "failed",
        personaVersion: "1.0.0",
        promptVersion: "1.0.1",
        commonPromptVersion: "1.0.0",
        schemaVersion: "1.0.0",
        startedAt: "2026-10-23T00:00:00Z",
        inputTokens: 100,
        outputTokens: 60,
        providerStatus: "completed",
        evidence: "LIVE_FAILED",
        expectedRegister: "haeyo",
        styleIssues: [{ code: "REGISTER", sectionId: "overview" }],
        verdict: { evidenceIdsValid: true, styleHeuristicPassed: false },
        result: {
          sections: [{ paragraphs: ["확인된 범위만 설명합니다."] }],
          styleEvaluation: { passed: false },
          meta: { providerKind: "openai", modelId: "gpt-4o-mini" },
        },
      },
    });
  });
  await unlock(page);
  await page.getByRole("radio", { name: "Live", exact: true }).check();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "테스트 실행" }).click();
  await expect(
    page.getByRole("heading", { name: "API 호출 완료 · 문체 검사 미통과" }),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "문체 검사 상세" })).toContainText("REGISTER");
  await expect(page.getByRole("list", { name: "문체 검사 상세" })).toContainText("해요체");
  const region = page.getByRole("region", { name: "Live 실행 결과" });
  await expect(region).toContainText("종합 검증 결과: LIVE_FAILED");
  await expect(region).toContainText("응답 상태: completed");
  await expect(region).toContainText("자동 재호출하지 않습니다");
  expect(calls).toBe(1);
});

for (const width of [320, 390, 768, 1440])
  test(`settings layout fits ${width}px and keyboard can reach controls`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await unlock(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByLabel("가상 사례", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("합성 문체")).toBeFocused();
    if (width === 390)
      await page.screenshot({ path: testInfo.outputPath("settings-390.png"), fullPage: true });
  });
