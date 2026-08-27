import { expect, test } from "@playwright/test";
import { createDemoWorkspace } from "../../src/domain/seed";

test("judge flow: seed, edit, graph, persistence, simulation, scenarios, reset, and debugger", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Turn chaos into a plan/i })).toBeVisible();
  await page.getByTestId("try-demo").click();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();

  await page.getByTestId("add-task").click();
  await page.getByRole("textbox", { name: "Task title" }).fill("Judge smoke task");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Judge smoke task", { exact: true })).toBeVisible();

  await page.getByText("Judge smoke task", { exact: true }).click();
  const title = page.getByRole("textbox", { name: "Task title" }).last();
  await title.fill("Judge edited task");
  await page.getByTestId("task-estimate").fill("1.5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Judge edited task", { exact: true })).toBeVisible();

  const node = page.locator(".react-flow__node").filter({ hasText: "Judge edited task" });
  const box = await node.boundingBox();
  expect(box).not.toBeNull();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
  }

  const source = page.locator(".react-flow__node").filter({ hasText: "Architecture" }).locator(".react-flow__handle.source");
  const target = node.locator(".react-flow__handle.target");
  await source.dragTo(target);
  await expect(page.locator(".react-flow__edge")).toHaveCount(22);

  await page.reload();
  await expect(page.getByText("Judge edited task", { exact: true })).toBeVisible();
  await page.getByTestId("run-simulation").click();
  await expect(page.getByRole("dialog", { name: /chance of finishing/i })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /What If/i }).click();
  await expect(page.getByTestId("scenario-grid")).toBeVisible();
  await expect(page.getByText("Cut animations", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close scenarios" }).click();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(page.getByText("Judge edited task", { exact: true })).toHaveCount(0);

  await page.goto("/debug/webmcp");
  await expect(page.getByTestId("tool-count")).toHaveText("46");
  await page.getByTestId("debug-full-test").click();
  await expect(page.getByText("malformed input rejected", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".test-fail")).toHaveCount(0);
});

test("local fallback remains editable and persistent when the API is offline", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
  await page.goto("/");
  await page.getByTestId("try-demo").click();

  await expect(page.getByText("Local safe", { exact: true })).toBeVisible();
  await page.getByTestId("add-task").click();
  await page.getByRole("textbox", { name: "Task title" }).fill("Offline-resilient task");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Offline-resilient task", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Offline-resilient task", { exact: true })).toBeVisible();
  await expect(page.getByText("Local safe", { exact: true })).toBeVisible();
});

test("production API persists an isolated D1 workspace round trip", async ({ request }) => {
  test.skip(!process.env.PLAYWRIGHT_BASE_URL, "Runs only against an explicitly selected deployment.");
  const workspace = createDemoWorkspace(crypto.randomUUID());
  workspace.workspace.name = "Production persistence smoke test";

  const workspaceId = workspace.workspace.id;
  const put = await request.put(`/api/workspaces/${workspaceId}`, { data: workspace });
  const putBody = await put.text();
  expect(put.ok(), `${put.status()} ${putBody}`).toBeTruthy();
  expect(JSON.parse(putBody).ok).toBe(true);

  const get = await request.get(`/api/workspaces/${workspaceId}`);
  expect(get.ok()).toBeTruthy();
  const saved = await get.json();
  expect(saved.workspace.name).toBe(workspace.workspace.name);
  expect(saved.storageMode).toBe("remote");

  const remove = await request.delete(`/api/workspaces/${workspaceId}`);
  expect(remove.ok()).toBeTruthy();
  expect((await request.get(`/api/workspaces/${workspaceId}`)).status()).toBe(404);
});
