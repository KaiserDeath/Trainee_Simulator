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

test("the bare domain lands on the simulator under /sim", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/sim$/);
  await expect(page.getByRole("heading", { name: "Simulador DOS" })).toBeVisible();
});

test("legacy simulator links keep working under /sim", async ({ page }) => {
  await page.goto("/games/orion-stars/legacy-session-1");
  await expect(page).toHaveURL(/\/sim\/games\/orion-stars\/legacy-session-1$/);

  await page.goto("/games/vblink/legacy-session-2?from=bookmark");
  await expect(page).toHaveURL(/\/sim\/games\/vblink\/legacy-session-2\?from=bookmark$/);
});

test("a legacy /trainer bookmark reaches the trainer dashboard under /sim", async ({ page }) => {
  // Without the token the trainer password prompt auto-dismisses and bounces to /sim.
  await page.addInitScript(() => {
    localStorage.setItem("token", "allow_trainer_access");
  });

  await page.goto("/trainer");
  await expect(page).toHaveURL(/\/sim\/trainer$/);
});

test("the redirect replaces history instead of trapping Back", async ({ page }) => {
  await page.goto("/sim");
  await page.goto("/");
  await expect(page).toHaveURL(/\/sim$/);

  // The rewritten legacy entry must not sit between us and the previous page.
  await page.goBack();
  await expect(page).not.toHaveURL(/\/$/);
});

test("the Hub keeps its own prefix and is not rewritten under /sim", async ({ page }) => {
  await page.goto("/hub");

  await expect(page).toHaveURL(/\/hub$/);
});
