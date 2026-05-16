import { expect, test } from "@playwright/test";

test("login screen is mobile-friendly", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /login|zaloguj/i })).toBeVisible();

  const bodyBox = await page.locator("body").boundingBox();
  const viewport = page.viewportSize();
  expect(bodyBox?.width).toBeLessThanOrEqual((viewport?.width ?? 393) + 1);
});