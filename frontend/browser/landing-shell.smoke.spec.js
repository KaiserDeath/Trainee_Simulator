import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/trainer/settings", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.routeWebSocket("**/socket.io/**", (webSocket) => {
    webSocket.close();
  });
});

test("renders the current operator-training landing shell without a backend", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Simulador DOS" })).toBeVisible();
  await expect(page.getByText("Backoffice Operator Training")).toBeVisible();
  await expect(page.getByLabel("First Name")).toBeVisible();
  await expect(page.getByLabel("Last Name")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue →" })).toBeVisible();
});

test("validates and confirms an operator name entirely in the browser", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Continue →" }).click();
  await expect(page.getByText("Please enter your first and last name.")).toBeVisible();

  await page.getByLabel("First Name").fill("Sample");
  await page.getByLabel("Last Name").fill("Operator");
  await page.getByRole("button", { name: "Continue →" }).click();

  await expect(page.getByText("Sample Operator")).toBeVisible();
  await expect(
    page.getByText("Performance is reviewed using approved evaluation criteria")
  ).toBeVisible();
  await expect(page.getByText(/85%/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Start Simulation/ })).toBeVisible();
});
