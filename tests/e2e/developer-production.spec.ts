import { test, expect } from "@playwright/test";

test("production build hides developer page and rejects every analysis method", async ({ page, request }) => {
  expect((await page.goto("/dev/validation"))?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "개발자 계산 검증" })).toHaveCount(0);
  for (const method of ["POST", "GET", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
    const response = await request.fetch("/api/analysis", { method, data: method === "POST" ? {} : undefined });
    expect(response.status()).toBe(404);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
});
