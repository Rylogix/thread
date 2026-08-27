import { expect, test } from "@playwright/test";

const updateScreenshots = process.env.UPDATE_SCREENSHOTS === "1";

test("guided Decision Room keeps agent proposals staged until human approval and supports undo", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByTestId("try-negotiation").click();
  const room = page.getByRole("dialog", { name: "Decision Room" });
  await expect(room).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Decision Room" })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(room).toBeHidden();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();

  const trigger = page.getByTestId("open-decision-room");
  await trigger.click();
  await page.getByRole("button", { name: "Prepare demo contract" }).click();
  await page.getByRole("button", { name: /Ask agent for/ }).click();

  await expect(page.getByRole("button", { name: /Safest plan/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Fastest plan/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Highest-impact plan/ })).toBeVisible();
  await expect(page.getByText("Agent needs your judgment")).toBeVisible();

  await page.reload();
  await expect(room).toBeVisible();
  await expect(page.getByRole("button", { name: /Safest plan/ })).toBeVisible();
  await expect(page.getByText("Agent needs your judgment")).toBeVisible();

  await page.getByRole("heading", { name: "Compare executable plans" }).scrollIntoViewIfNeeded();
  if (updateScreenshots) await page.screenshot({ path: "docs/screenshots/thread-decision-room.png", fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("dialog", { name: "Decision Room" })).toBeVisible();
  await page.getByRole("heading", { name: "Compare executable plans" }).scrollIntoViewIfNeeded();
  if (updateScreenshots) await page.screenshot({ path: "docs/screenshots/thread-decision-room-mobile.png", fullPage: false });
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Record my decision" }).click();
  await expect(page.getByText(/answer changed the agent proposal/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Revision 2/)).toBeVisible({ timeout: 30_000 });

  let approved = false;
  for (const name of ["Safest plan", "Fastest plan", "Highest-impact plan"]) {
    await room.locator(".decision-proposal-card").filter({ hasText: name }).click();
    const approve = page.getByRole("button", { name: "Approve & apply" });
    if (await approve.isEnabled()) {
      await approve.click();
      await page.getByRole("button", { name: "Confirm approval" }).click();
      approved = true;
      break;
    }
  }
  expect(approved, "at least one deterministic proposal should preserve every locked requirement").toBe(true);
  await expect(page.getByText(/entered shared reality/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Undo .* plan/ })).toBeVisible();

  await page.getByRole("button", { name: /Undo .* plan/ }).click();
  await expect(page.getByText(/previous plan is live again/)).toBeVisible();
});
