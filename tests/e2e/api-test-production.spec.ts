import { test, expect } from "@playwright/test";

test("production hides the page and every developer API even with the local marker configured", async ({ request }) => {
  expect((await request.get("/dev/api-test")).status()).toBe(404);
  for (const path of ["config", "unlock", "runs", "runs/00000000-0000-4000-8000-000000000000"]) {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
      expect((await request.fetch("/api/dev/api-test/" + path, { method })).status()).toBe(404);
  }
});
