import { expect, test } from "@playwright/test";

test("capture submission-ready desktop views", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("try-demo")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/thread-hero.png", fullPage: true, animations: "disabled" });
  await page.getByTestId("try-demo").click();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/thread-workspace.png", fullPage: true, animations: "disabled" });
  await page.goto("/debug/webmcp");
  await expect(page.getByTestId("tool-count")).toHaveText("38");
  await page.screenshot({ path: "docs/screenshots/thread-webmcp-debug.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Plan" }).click();
  await expect(page.getByLabel("Objective and feasibility")).toHaveClass(/sheet-open/);
  await page.screenshot({ path: "docs/screenshots/thread-mobile.png", fullPage: true, animations: "disabled" });
});
