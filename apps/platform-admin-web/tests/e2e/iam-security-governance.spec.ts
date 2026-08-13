import { expect, test } from "@playwright/test";

test.describe("Platform Admin IAM & Break-Glass Security Surfaces", () => {
  test.beforeEach(async ({ page }) => {
    // Mock control plane endpoints
    await page.route("**/identity/users", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              userId: "user_pa_super_01",
              email: "yc.lin@drts.io",
              displayName: "林宜君",
              roleCode: "superadmin",
              status: "active",
              createdAt: "2026-05-01T00:00:00Z",
              updatedAt: "2026-05-08T00:00:00Z",
            },
            {
              userId: "user_pa_ops_02",
              email: "fang.wang@drts.io",
              displayName: "王芳",
              roleCode: "admin",
              status: "active",
              createdAt: "2026-05-02T00:00:00Z",
              updatedAt: "2026-05-08T00:00:00Z",
            },
          ],
          meta: { requestId: "req_users_test" },
        }),
      });
    });

    await page.route("**/identity/sessions*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              sessionId: "sess_pa_001",
              principalId: "user_pa_super_01",
              realm: "platform",
              status: "active",
              authTime: "2026-08-13T00:00:00Z",
              authMethods: ["pwd", "mfa"],
              tokenVersion: 1,
              idleExpiresAt: "2026-08-13T01:00:00Z",
              absoluteExpiresAt: "2026-08-13T08:00:00Z",
              revokedAt: null,
              revokedByPrincipalId: null,
              revokeReason: null,
              deviceSummary: {},
              riskSummary: {},
              createdAt: "2026-08-13T00:00:00Z",
              updatedAt: "2026-08-13T00:00:00Z",
            },
          ],
          meta: { requestId: "req_sessions_test" },
        }),
      });
    });

    await page.route("**/identity/privileged-role-requests*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            items: [
              {
                requestId: "req_elev_01",
                targetUserId: "user_pa_ops_02",
                requestedRoleCode: "superadmin",
                previousRoleCode: "admin",
                requesterPrincipalId: "user_pa_ops_02",
                reason: "INC-9921 fix required",
                status: "pending",
                sodViolationDetected: true,
                version: 1,
                createdAt: "2026-08-13T02:00:00Z",
                updatedAt: "2026-08-13T02:00:00Z",
              },
            ],
          },
          meta: { requestId: "req_role_test" },
        }),
      });
    });

    await page.route("**/platform-admin/access-reviews*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            campaigns: [
              {
                campaignId: "cmp_q3_01",
                title: "Q3 Platform Admin Certification",
                realm: "platform",
                reviewerPrincipalId: "user_pa_super_01",
                status: "active",
                deadlineAt: "2026-08-20T00:00:00Z",
                overduePolicy: "auto_revoke",
                createdAt: "2026-08-13T00:00:00Z",
                updatedAt: "2026-08-13T00:00:00Z",
              },
            ],
            evidence: [],
          },
          meta: { requestId: "req_ar_test" },
        }),
      });
    });
  });

  test("renders Users & Memberships table and tab navigation", async ({ page }) => {
    await page.goto("/users");
    await expect(page.locator("h1, header")).toContainText(/Platform staff|平台人員/);

    // Verify workforce users table
    await expect(page.locator("text=林宜君")).toBeVisible();
    await expect(page.locator("text=yc.lin@drts.io")).toBeVisible();
    await expect(page.locator("text=superadmin")).toBeVisible();

    // Verify tabs
    await expect(page.locator("button:has-text('Role Approvals') , button:has-text('特權角色核准')")).toBeVisible();
    await expect(page.locator("button:has-text('Access Reviews') , button:has-text('存取權審查')")).toBeVisible();
    await expect(page.locator("button:has-text('Break-Glass') , button:has-text('Break-Glass')")).toBeVisible();
  });

  test("opens User Detail & Session Inventory drawer", async ({ page }) => {
    await page.goto("/users");
    await page.locator("button:has-text('Detail') , button:has-text('詳細')").first().click();

    await expect(page.locator("text=Account & Membership Authority")).toBeVisible();
    await expect(page.locator("text=Active & Historical Sessions")).toBeVisible();
    await expect(page.locator("text=sess_pa_001")).toBeVisible();
  });

  test("switches tabs to Role Approvals, Access Reviews, and Break-Glass", async ({ page }) => {
    await page.goto("/users");

    // Role Approvals
    await page.locator("button:has-text('Role Approvals') , button:has-text('特權角色核准')").click();
    await expect(page.locator("text=Privileged Role Approvals & SoD Governance")).toBeVisible();
    await expect(page.locator("text=req_elev_01")).toBeVisible();

    // Access Reviews
    await page.locator("button:has-text('Access Reviews') , button:has-text('存取權審查')").click();
    await expect(page.locator("text=Periodic Access Review Campaigns")).toBeVisible();
    await expect(page.locator("text=cmp_q3_01")).toBeVisible();

    // Break-Glass
    await page.locator("button:has-text('Break-Glass') , button:has-text('Break-Glass')").click();
    await expect(page.locator("text=Break-Glass Emergency Access Surface")).toBeVisible();
  });
});
