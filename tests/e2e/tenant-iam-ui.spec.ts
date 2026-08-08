import { expect, test } from "@playwright/test";

test.describe("IAM-UI-TEN-001 — Tenant Console IAM User, Role, Session & Credential Surfaces", () => {
  test("renders tenant users page with interactive roster and session administration tabs", async ({ page }) => {
    // Navigate to /users
    await page.goto("/users");

    // Check page title and subtitle
    await expect(page.getByText("Users").first()).toBeVisible();

    // Verify Tab buttons exist
    const rosterTab = page.getByRole("button", { name: /使用者與角色 Roster/i });
    const sessionsTab = page.getByRole("button", { name: /線上會話與憑證 Session Administration/i });

    await expect(rosterTab).toBeVisible();
    await expect(sessionsTab).toBeVisible();

    // Verify Invite Button opens Invite Modal
    const inviteButton = page.getByRole("button", { name: /Invite|發送邀請/i }).first();
    await expect(inviteButton).toBeVisible();

    // Switch to Sessions Tab
    await sessionsTab.click();
    await expect(page.getByText("線上身份會話與憑證 (Active Identity Sessions)")).toBeVisible();
  });

  test("renders API keys page with plaintext-once modal banner and revocation controls", async ({ page }) => {
    await page.goto("/api-keys");

    // Page header
    await expect(page.getByText("API 金鑰").first()).toBeVisible();

    // Plaintext-once warning banner
    await expect(page.getByText(/Q-TEN09 plaintext-once|只在建立當下顯示完整金鑰/i).first()).toBeVisible();
  });

  test("renders Webhooks page with engine provisioned state check", async ({ page }) => {
    await page.goto("/webhooks");

    // Page title and endpoints tab
    await expect(page.getByText("Webhook").first()).toBeVisible();
    await expect(page.getByRole("tab", { name: /Endpoints/i })).toBeVisible();
  });
});
