import { expect, test } from "@playwright/test";

const updateScreenshots = process.env.UPDATE_SCREENSHOTS === "1";

test("verify submission-ready desktop views and optionally refresh captures", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await expect(page.getByTestId("try-demo")).toBeVisible();
  if (updateScreenshots) await page.screenshot({ path: "docs/screenshots/thread-hero.png", fullPage: true, animations: "disabled" });
  await page.getByTestId("try-demo").click();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  if (updateScreenshots) await page.screenshot({ path: "docs/screenshots/thread-workspace.png", fullPage: true, animations: "disabled" });
  await page.goto("/debug/webmcp");
  await expect(page.getByTestId("tool-count")).toHaveText("46");
  if (updateScreenshots) await page.screenshot({ path: "docs/screenshots/thread-webmcp-debug.png", fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await expect(page.getByLabel("Objective and feasibility")).toHaveClass(/sheet-open/);
  if (updateScreenshots) await page.screenshot({ path: "docs/screenshots/thread-mobile.png", fullPage: true, animations: "disabled" });
});
