import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedAgencyPlatformPersonnel } from "./platform-personnel-fixture";
import { startAgencySmtpInbox, type AgencySmtpInbox } from "./smtp-inbox";
import {
  SIMULATED_AUTHENTICATOR_DEVICE_LABEL,
  SimulatedTotpAuthenticatorDevice,
  assertNoLeakedSecretsInEvidence,
  buildFourPortalHostedJourneyClassification,
  extractInvitationLink,
  extractPasswordResetTarget,
  redactHostedJourneySecrets,
} from "./totp-authenticator-fixture";

const apiUrl = process.env.DRTS_API_URL || "http://127.0.0.1:3001";
const agencyOrigin =
  process.env.DRTS_E2E_AGENCY_PORTAL_URL || "http://localhost:3212";
const tenantOrigin =
  process.env.DRTS_E2E_TENANT_CONSOLE_URL || "http://localhost:3213";
const enterpriseOrigin =
  process.env.DRTS_E2E_ENTERPRISE_DISPATCH_URL || "http://localhost:3214";
const fleetOrigin =
  process.env.DRTS_E2E_FLEET_PORTAL_URL || "http://localhost:3215";
const smtpPort =
  Number(process.env.DRTS_E2E_AGENCY_SMTP_PORT || "2526") || 2526;
const internalKey =
  process.env.DRTS_INTERNAL_KEY || "ci-e2e-agency-business-internal-key";
const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/drts_bureau_acceptance";
const evidenceDir = path.resolve(".artifacts/agency-portal-business");
const candidateVersion =
  process.env.CANDIDATE_SHA ||
  process.env.DRTS_CANDIDATE_SHA ||
  process.env.GITHUB_SHA ||
  "local-worktree";

interface HostStepEvidence {
  step: string;
  portal:
    | "tenant-console-web"
    | "enterprise-dispatch-web"
    | "agency-portal-web"
    | "fleet-partner-portal-web";
  hostOrigin: string;
  realm: "tenant" | "agency" | "partner";
  path: string;
  status: number | null;
  outcome: string;
  authenticatorDevice?: typeof SIMULATED_AUTHENTICATOR_DEVICE_LABEL;
  totpStep?: number;
}

async function apiJson<T>(
  pathname: string,
  init: RequestInit & { token?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: T; runtimeSha: string | null }> {
  const response = await fetch(`${apiUrl}${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : null) as T,
    runtimeSha: response.headers.get("x-drts-runtime-sha"),
  };
}

async function issueStepUpReference(
  platformAdminToken: string,
  targetPath: string,
  reason: string,
): Promise<string> {
  const stepUp = await apiJson<{
    data: { action_id: string; step_up_reference: string };
  }>("/api/identity/step-up-proofs", {
    method: "POST",
    token: platformAdminToken,
    body: JSON.stringify({
      method: "POST",
      path: targetPath,
      reason,
    }),
  });
  expect(stepUp.status).toBe(201);
  expect(stepUp.body.data.step_up_reference).toMatch(/^stepup_/);
  return stepUp.body.data.step_up_reference;
}

async function acceptInvitationWithPasswordInBrowser(
  page: Page,
  acceptUrl: string,
  initialPassword: string,
): Promise<void> {
  await page.goto(acceptUrl, { waitUntil: "networkidle" });
  const passwordInputs = page.locator('input[type="password"]');
  await expect(passwordInputs).toHaveCount(2);
  await passwordInputs.nth(0).fill(initialPassword);
  await passwordInputs.nth(1).fill(initialPassword);
  await page.locator('button[type="submit"]').click();
  await expect(page.locator('[role="status"]')).toBeVisible();
}

async function loginWithPasswordInBrowser(
  page: Page,
  portalOrigin: string,
  email: string,
  password: string,
  totpCode?: string,
): Promise<number> {
  await page.goto(`${portalOrigin}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').first().fill(password);

  if (totpCode) {
    const totpInput = page.locator('input[autocomplete="one-time-code"]');
    if ((await totpInput.count()) === 0) {
      await page
        .locator("button")
        .filter({ hasText: /驗證碼|復原碼|verification|recovery/i })
        .first()
        .click();
    }
    await expect(totpInput).toBeVisible();
    await totpInput.fill(totpCode);
  }

  const loginResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/password-login") &&
      res.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').first().click();
  const loginResponse = await loginResponsePromise;
  return loginResponse.status();
}

async function enrollAndConfirmTotpInBrowser(
  page: Page,
  portalOrigin: string,
  authenticator: SimulatedTotpAuthenticatorDevice,
  forbiddenSecrets: string[],
): Promise<{ totpStep: number; enrollStatus: number; confirmStatus: number }> {
  await page.goto(`${portalOrigin}/account/security/totp`, {
    waitUntil: "networkidle",
  });
  const enrollResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/mfa/totp/enroll") &&
      res.request().method() === "POST",
  );
  await page
    .locator("button")
    .filter({ hasText: /開始設定驗證器|Start|重新產生/i })
    .first()
    .click();
  const enrollResponse = await enrollResponsePromise;
  const enrollStatus = enrollResponse.status();
  expect(enrollStatus).toBe(200);

  const enrollPayload = (await enrollResponse.json()) as {
    data?: { secret?: string; otpauthUri?: string };
  };
  const secret = enrollPayload.data?.secret?.trim() ?? "";
  expect(secret.length).toBeGreaterThanOrEqual(16);
  forbiddenSecrets.push(secret);
  if (enrollPayload.data?.otpauthUri) {
    forbiddenSecrets.push(enrollPayload.data.otpauthUri);
  }

  const generated = await authenticator.nextCode(secret);
  await page
    .locator('input[autocomplete="one-time-code"]')
    .fill(generated.code);

  const confirmResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/mfa/totp/confirm") &&
      res.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').click();
  const confirmResponse = await confirmResponsePromise;
  const confirmStatus = confirmResponse.status();
  expect(confirmStatus).toBe(200);

  const confirmPayload = (await confirmResponse.json()) as {
    data?: { recoveryCodes?: string[] };
  };
  const recoveryCodes = confirmPayload.data?.recoveryCodes ?? [];
  expect(recoveryCodes).toHaveLength(10);
  for (const code of recoveryCodes) {
    forbiddenSecrets.push(code);
  }
  await expect(page.locator('[role="status"]')).toBeVisible();
  return {
    totpStep: generated.step,
    enrollStatus,
    confirmStatus,
  };
}

async function verifyAccountSecurityAndSignOutInBrowser(
  page: Page,
  portalOrigin: string,
): Promise<{ sessionsStatus: number; logoutStatus: number }> {
  const sessionsResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/api/auth/sessions") &&
      res.request().method() === "GET",
  );
  await page.goto(`${portalOrigin}/account/security`, {
    waitUntil: "networkidle",
  });
  const sessionsResponse = await sessionsResponsePromise;
  const sessionsStatus = sessionsResponse.status();
  expect(sessionsStatus).toBe(200);

  const logoutResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/api/auth/logout") &&
      res.request().method() === "POST",
  );
  await page
    .locator("button")
    .filter({ hasText: /登出目前工作階段|Sign out current session/i })
    .first()
    .click();
  const logoutResponse = await logoutResponsePromise;
  const logoutStatus = logoutResponse.status();
  expect(logoutStatus).toBe(200);
  await page.waitForURL((url) => url.pathname.startsWith("/login"));
  return { sessionsStatus, logoutStatus };
}

async function requestAndConfirmPasswordResetInBrowser(
  page: Page,
  portalOrigin: string,
  email: string,
  newPassword: string,
  smtpInbox: AgencySmtpInbox,
  forbiddenSecrets: string[],
): Promise<{
  requestStatus: number;
  confirmStatus: number;
  redactedResetUrl: string;
}> {
  const priorResetMessages = smtpInbox.messagesTo(email).length;
  await page.goto(`${portalOrigin}/forgot-password`, {
    waitUntil: "networkidle",
  });
  await page.locator('input[type="email"]').fill(email);

  const requestResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/password-reset/request") &&
      res.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').click();
  const requestResponse = await requestResponsePromise;
  const requestStatus = requestResponse.status();
  expect(requestStatus).toBe(200);
  await expect(page.locator('[role="status"]')).toBeVisible();

  await expect
    .poll(() => smtpInbox.messagesTo(email).length, { timeout: 15_000 })
    .toBeGreaterThan(priorResetMessages);
  const latestMail = smtpInbox.messagesTo(email).at(-1)!;
  const resetTarget = extractPasswordResetTarget(latestMail.text, portalOrigin);
  forbiddenSecrets.push(resetTarget.rawTokenForNavigationOnly);

  await page.goto(resetTarget.resetUrl, { waitUntil: "networkidle" });
  const passwordInputs = page.locator('input[type="password"]');
  await expect(passwordInputs).toHaveCount(2);
  await passwordInputs.nth(0).fill(newPassword);
  await passwordInputs.nth(1).fill(newPassword);

  const confirmResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/password-reset/confirm") &&
      res.request().method() === "POST",
  );
  await page.locator('button[type="submit"]').click();
  const confirmResponse = await confirmResponsePromise;
  const confirmStatus = confirmResponse.status();
  expect(confirmStatus).toBe(200);
  await expect(page.locator('[role="status"]')).toBeVisible();

  return {
    requestStatus,
    confirmStatus,
    redactedResetUrl: resetTarget.redactedResetUrl,
  };
}

test.describe("Four-portal hosted invitation, password setup, TOTP MFA, logout, forgot/reset password and re-login rehearsal", () => {
  let smtpInbox: AgencySmtpInbox;
  let platformAdminToken = "";
  let apiRuntimeSha: string | null = null;

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
    const personnel = await seedAgencyPlatformPersonnel(databaseUrl);
    smtpInbox = await startAgencySmtpInbox(smtpPort);

    const tokenRes = await apiJson<{
      token: string;
      expiresIn: string;
    }>("/api/auth/token", {
      method: "POST",
      headers: {
        "x-internal-key": internalKey,
        "x-actor-type": "platform_admin",
        "x-actor-id": personnel.principalId,
        "x-realm": "platform",
      },
      body: JSON.stringify({}),
    });
    expect(tokenRes.status).toBe(201);
    platformAdminToken = tokenRes.body.token;
    apiRuntimeSha = tokenRes.runtimeSha;
  });

  test.afterAll(async () => {
    await smtpInbox?.close();
  });

  test("executes disposable password invitation, TOTP enrollment/login, logout, password reset and re-login across tenant, enterprise, agency and fleet portals", async ({
    browser,
  }) => {
    const runTag = randomUUID().slice(0, 8);
    const authenticator = new SimulatedTotpAuthenticatorDevice();
    const forbiddenSecrets: string[] = [platformAdminToken];
    const stepEvidence: HostStepEvidence[] = [];

    // -------------------------------------------------------------------------
    // 1. Tenant Console (`tenant-console-web`, `tenant` realm)
    // -------------------------------------------------------------------------
    const tenantEmail = `tenant.pwd.${runTag}@tenant-hosted.example`;
    const tenantInitialPassword = `TenantInit!${runTag}#2026Valid`;
    const tenantResetPassword = `TenantReset!${runTag}#2026Next`;
    forbiddenSecrets.push(tenantInitialPassword, tenantResetPassword);

    const tenantStepUpRef = await issueStepUpReference(
      platformAdminToken,
      "/api/tenant/users",
      "Four-portal hosted rehearsal disposable tenant member invitation",
    );
    const tenantInviteRes = await apiJson<{
      data: {
        user?: { userId: string; email: string; status: string };
        invitation?: { invitationId: string; deliveryStatus?: string };
      };
    }>("/api/tenant/users", {
      method: "POST",
      token: platformAdminToken,
      headers: {
        "x-tenant-id": "tenant-demo-001",
        "x-drts-step-up-reference": tenantStepUpRef,
      },
      body: JSON.stringify({
        email: tenantEmail,
        displayName: `Hosted Tenant Admin ${runTag}`,
        roleCode: "tenant_admin",
      }),
    });
    expect(tenantInviteRes.status).toBe(201);

    const tenantInviteMail = await smtpInbox.waitForRecipient(tenantEmail);
    const tenantInviteTarget = extractInvitationLink(
      tenantInviteMail.text,
      `${tenantOrigin}/invite`,
    );
    forbiddenSecrets.push(tenantInviteTarget.rawTokenForNavigationOnly);

    const tenantContext = await browser.newContext();
    const tenantPage = await tenantContext.newPage();

    await acceptInvitationWithPasswordInBrowser(
      tenantPage,
      tenantInviteTarget.acceptUrl,
      tenantInitialPassword,
    );
    stepEvidence.push({
      step: "1a_tenant_accept_invitation_with_password",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/invite?token=[REDACTED_TOKEN]",
      status: 200,
      outcome: "invitation_accepted_and_password_persisted",
    });

    const tenantFirstLoginStatus = await loginWithPasswordInBrowser(
      tenantPage,
      tenantOrigin,
      tenantEmail,
      tenantInitialPassword,
    );
    expect(tenantFirstLoginStatus).toBe(200);
    await tenantPage.waitForURL(
      (url) =>
        url.origin === new URL(tenantOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "1b_tenant_initial_password_login",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/login",
      status: tenantFirstLoginStatus,
      outcome: "authenticated_session_cookie_established",
    });

    const tenantTotpEnrollment = await enrollAndConfirmTotpInBrowser(
      tenantPage,
      tenantOrigin,
      authenticator,
      forbiddenSecrets,
    );
    const tenantSecret = forbiddenSecrets.at(-11)!;
    stepEvidence.push({
      step: "1c_tenant_totp_enroll_and_confirm",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/account/security/totp",
      status: tenantTotpEnrollment.confirmStatus,
      outcome: "totp_enrolled_confirmed_and_recovery_codes_issued",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: tenantTotpEnrollment.totpStep,
    });

    const tenantSignOut1 = await verifyAccountSecurityAndSignOutInBrowser(
      tenantPage,
      tenantOrigin,
    );
    stepEvidence.push({
      step: "1d_tenant_account_security_and_logout",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/account/security",
      status: tenantSignOut1.logoutStatus,
      outcome: "session_inventory_verified_and_signed_out",
    });

    const tenantMfaLoginCode = await authenticator.nextCode(tenantSecret);
    const tenantMfaLoginStatus = await loginWithPasswordInBrowser(
      tenantPage,
      tenantOrigin,
      tenantEmail,
      tenantInitialPassword,
      tenantMfaLoginCode.code,
    );
    expect(tenantMfaLoginStatus).toBe(200);
    await tenantPage.waitForURL(
      (url) =>
        url.origin === new URL(tenantOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "1e_tenant_password_plus_totp_login",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/login",
      status: tenantMfaLoginStatus,
      outcome: "password_and_totp_verified_session_established",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: tenantMfaLoginCode.step,
    });

    await verifyAccountSecurityAndSignOutInBrowser(tenantPage, tenantOrigin);

    const tenantReset = await requestAndConfirmPasswordResetInBrowser(
      tenantPage,
      tenantOrigin,
      tenantEmail,
      tenantResetPassword,
      smtpInbox,
      forbiddenSecrets,
    );
    stepEvidence.push({
      step: "1f_tenant_forgot_and_reset_password",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/reset-password?token=[REDACTED_TOKEN]",
      status: tenantReset.confirmStatus,
      outcome: "password_reset_confirmed_and_prior_sessions_revoked",
    });

    const tenantPostResetCode = await authenticator.nextCode(tenantSecret);
    const tenantPostResetLoginStatus = await loginWithPasswordInBrowser(
      tenantPage,
      tenantOrigin,
      tenantEmail,
      tenantResetPassword,
      tenantPostResetCode.code,
    );
    expect(tenantPostResetLoginStatus).toBe(200);
    await tenantPage.waitForURL(
      (url) =>
        url.origin === new URL(tenantOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "1g_tenant_relogin_with_new_password_and_totp",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/login",
      status: tenantPostResetLoginStatus,
      outcome: "reauthenticated_with_new_password_and_totp",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: tenantPostResetCode.step,
    });
    await tenantContext.close();

    // -------------------------------------------------------------------------
    // 2. Enterprise Dispatch (`enterprise-dispatch-web`, shared `tenant` member)
    // -------------------------------------------------------------------------
    const enterpriseResetPassword = `EnterpriseReset!${runTag}#2026Next`;
    forbiddenSecrets.push(enterpriseResetPassword);

    const enterpriseContext = await browser.newContext();
    const enterprisePage = await enterpriseContext.newPage();

    await enterprisePage.goto(`${enterpriseOrigin}/`, {
      waitUntil: "networkidle",
    });
    await expect(
      enterprisePage.getByTestId("enterprise-gate-auth-required"),
    ).toBeVisible();
    await enterprisePage.locator('a[href="/login"]').first().click();
    await enterprisePage.waitForURL((url) => url.pathname.startsWith("/login"));
    stepEvidence.push({
      step: "2a_enterprise_unauthenticated_gate_to_login",
      portal: "enterprise-dispatch-web",
      hostOrigin: enterpriseOrigin,
      realm: "tenant",
      path: "/ -> /login",
      status: 200,
      outcome:
        "existing_enterprise_auth_required_gate_navigated_to_login_without_separate_invite_uri",
    });

    const enterpriseLoginCode1 = await authenticator.nextCode(tenantSecret);
    const enterpriseLoginStatus1 = await loginWithPasswordInBrowser(
      enterprisePage,
      enterpriseOrigin,
      tenantEmail,
      tenantResetPassword,
      enterpriseLoginCode1.code,
    );
    expect(enterpriseLoginStatus1).toBe(200);
    await enterprisePage.waitForURL(
      (url) =>
        url.origin === new URL(enterpriseOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    await expect(enterprisePage.locator("h1").first()).toBeVisible();
    stepEvidence.push({
      step: "2b_enterprise_shared_tenant_member_password_and_totp_login",
      portal: "enterprise-dispatch-web",
      hostOrigin: enterpriseOrigin,
      realm: "tenant",
      path: "/login",
      status: enterpriseLoginStatus1,
      outcome: "shared_tenant_member_logged_into_enterprise_dispatch",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: enterpriseLoginCode1.step,
    });

    const enterpriseSignOut = await verifyAccountSecurityAndSignOutInBrowser(
      enterprisePage,
      enterpriseOrigin,
    );
    stepEvidence.push({
      step: "2c_enterprise_account_security_and_logout",
      portal: "enterprise-dispatch-web",
      hostOrigin: enterpriseOrigin,
      realm: "tenant",
      path: "/account/security",
      status: enterpriseSignOut.logoutStatus,
      outcome: "enterprise_session_inventory_verified_and_signed_out",
    });

    const enterpriseReset = await requestAndConfirmPasswordResetInBrowser(
      enterprisePage,
      enterpriseOrigin,
      tenantEmail,
      enterpriseResetPassword,
      smtpInbox,
      forbiddenSecrets,
    );
    stepEvidence.push({
      step: "2d_enterprise_forgot_and_reset_password",
      portal: "enterprise-dispatch-web",
      hostOrigin: enterpriseOrigin,
      realm: "tenant",
      path: "/reset-password?token=[REDACTED_TOKEN]",
      status: enterpriseReset.confirmStatus,
      outcome: "enterprise_password_reset_confirmed",
    });

    const enterpriseLoginCode2 = await authenticator.nextCode(tenantSecret);
    const enterpriseLoginStatus2 = await loginWithPasswordInBrowser(
      enterprisePage,
      enterpriseOrigin,
      tenantEmail,
      enterpriseResetPassword,
      enterpriseLoginCode2.code,
    );
    expect(enterpriseLoginStatus2).toBe(200);
    await enterprisePage.waitForURL(
      (url) =>
        url.origin === new URL(enterpriseOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "2e_enterprise_relogin_with_new_password_and_totp",
      portal: "enterprise-dispatch-web",
      hostOrigin: enterpriseOrigin,
      realm: "tenant",
      path: "/login",
      status: enterpriseLoginStatus2,
      outcome: "enterprise_reauthenticated_with_new_password_and_totp",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: enterpriseLoginCode2.step,
    });
    await enterpriseContext.close();

    // -------------------------------------------------------------------------
    // 3. Agency Portal (`agency-portal-web`, `agency` realm)
    // -------------------------------------------------------------------------
    const agencyEmail = `agency.pwd.${runTag}@bureau-hosted.example`;
    const agencyInitialPassword = `AgencyInit!${runTag}#2026Valid`;
    const agencyResetPassword = `AgencyReset!${runTag}#2026Next`;
    forbiddenSecrets.push(agencyInitialPassword, agencyResetPassword);

    const createAgencyRes = await apiJson<{
      data: { agency: { agencyId: string; agencyCode: string } };
    }>("/api/platform-admin/agencies", {
      method: "POST",
      token: platformAdminToken,
      body: JSON.stringify({
        agencyCode: `TPE-PWD-${runTag.toUpperCase()}`,
        displayName: `臺北市密碼實演機關 ${runTag}`,
      }),
    });
    expect(createAgencyRes.status).toBe(201);
    const agencyId = createAgencyRes.body.data.agency.agencyId;

    const agencyInvitePath = `/api/platform-admin/agencies/${agencyId}/invitations`;
    const agencyStepUpRef = await issueStepUpReference(
      platformAdminToken,
      agencyInvitePath,
      "Four-portal hosted rehearsal disposable agency member invitation",
    );
    const agencyInviteRes = await apiJson<{
      data: {
        invitation: { invitationId: string; deliveryStatus: string };
      };
    }>(agencyInvitePath, {
      method: "POST",
      token: platformAdminToken,
      headers: {
        "x-drts-step-up-reference": agencyStepUpRef,
      },
      body: JSON.stringify({
        email: agencyEmail,
        roleCode: "agency_exporter",
        accessValidTo: new Date(
          Date.now() + 30 * 24 * 3600 * 1000,
        ).toISOString(),
      }),
    });
    expect(agencyInviteRes.status).toBe(201);
    expect(agencyInviteRes.body.data.invitation.deliveryStatus).toBe(
      "delivered",
    );

    const agencyInviteMail = await smtpInbox.waitForRecipient(agencyEmail);
    const agencyInviteTarget = extractInvitationLink(
      agencyInviteMail.text,
      `${agencyOrigin}/invite`,
    );
    forbiddenSecrets.push(agencyInviteTarget.rawTokenForNavigationOnly);

    const agencyContext = await browser.newContext();
    const agencyPage = await agencyContext.newPage();

    await acceptInvitationWithPasswordInBrowser(
      agencyPage,
      agencyInviteTarget.acceptUrl,
      agencyInitialPassword,
    );
    stepEvidence.push({
      step: "3a_agency_accept_invitation_with_password",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/invite?token=[REDACTED_TOKEN]",
      status: 200,
      outcome: "agency_invitation_accepted_and_password_persisted",
    });

    const agencyFirstLoginStatus = await loginWithPasswordInBrowser(
      agencyPage,
      agencyOrigin,
      agencyEmail,
      agencyInitialPassword,
    );
    expect(agencyFirstLoginStatus).toBe(200);
    await agencyPage.waitForURL(
      (url) =>
        url.origin === new URL(agencyOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "3b_agency_initial_password_login",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/login",
      status: agencyFirstLoginStatus,
      outcome: "agency_session_cookie_established",
    });

    const agencyTotpEnrollment = await enrollAndConfirmTotpInBrowser(
      agencyPage,
      agencyOrigin,
      authenticator,
      forbiddenSecrets,
    );
    const agencySecret = forbiddenSecrets.at(-11)!;
    stepEvidence.push({
      step: "3c_agency_totp_enroll_and_confirm",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/account/security/totp",
      status: agencyTotpEnrollment.confirmStatus,
      outcome: "agency_totp_enrolled_and_confirmed",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: agencyTotpEnrollment.totpStep,
    });

    const agencySignOut = await verifyAccountSecurityAndSignOutInBrowser(
      agencyPage,
      agencyOrigin,
    );
    stepEvidence.push({
      step: "3d_agency_account_security_and_logout",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/account/security",
      status: agencySignOut.logoutStatus,
      outcome: "agency_session_inventory_verified_and_signed_out",
    });

    const agencyMfaCode1 = await authenticator.nextCode(agencySecret);
    const agencyMfaLoginStatus = await loginWithPasswordInBrowser(
      agencyPage,
      agencyOrigin,
      agencyEmail,
      agencyInitialPassword,
      agencyMfaCode1.code,
    );
    expect(agencyMfaLoginStatus).toBe(200);
    await agencyPage.waitForURL(
      (url) =>
        url.origin === new URL(agencyOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "3e_agency_password_plus_totp_login",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/login",
      status: agencyMfaLoginStatus,
      outcome: "agency_password_and_totp_verified",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: agencyMfaCode1.step,
    });

    await verifyAccountSecurityAndSignOutInBrowser(agencyPage, agencyOrigin);

    const agencyReset = await requestAndConfirmPasswordResetInBrowser(
      agencyPage,
      agencyOrigin,
      agencyEmail,
      agencyResetPassword,
      smtpInbox,
      forbiddenSecrets,
    );
    stepEvidence.push({
      step: "3f_agency_forgot_and_reset_password",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/reset-password?token=[REDACTED_TOKEN]",
      status: agencyReset.confirmStatus,
      outcome: "agency_password_reset_confirmed",
    });

    const agencyMfaCode2 = await authenticator.nextCode(agencySecret);
    const agencyPostResetLoginStatus = await loginWithPasswordInBrowser(
      agencyPage,
      agencyOrigin,
      agencyEmail,
      agencyResetPassword,
      agencyMfaCode2.code,
    );
    expect(agencyPostResetLoginStatus).toBe(200);
    await agencyPage.waitForURL(
      (url) =>
        url.origin === new URL(agencyOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "3g_agency_relogin_with_new_password_and_totp",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/login",
      status: agencyPostResetLoginStatus,
      outcome: "agency_reauthenticated_with_new_password_and_totp",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: agencyMfaCode2.step,
    });
    await agencyContext.close();

    // -------------------------------------------------------------------------
    // 4. Fleet Partner Portal (`fleet-partner-portal-web`, `partner` realm)
    // -------------------------------------------------------------------------
    const fleetEmail = `fleet.pwd.${runTag}@fleet-hosted.example`;
    const fleetInitialPassword = `FleetInit!${runTag}#2026Valid`;
    const fleetResetPassword = `FleetReset!${runTag}#2026Next`;
    forbiddenSecrets.push(fleetInitialPassword, fleetResetPassword);

    const fleetInvitePath =
      "/api/admin/fleet-partners/fleet-demo-001/invitations";
    const fleetStepUpRef = await issueStepUpReference(
      platformAdminToken,
      fleetInvitePath,
      "Four-portal hosted rehearsal disposable fleet staff invitation",
    );
    const fleetInviteRes = await apiJson<{
      data: {
        invitation: { invitationId: string; deliveryStatus: string };
      };
    }>(fleetInvitePath, {
      method: "POST",
      token: platformAdminToken,
      headers: {
        "x-drts-step-up-reference": fleetStepUpRef,
      },
      body: JSON.stringify({
        entrySlug: "fleet-demo-001",
        email: fleetEmail,
        roleCode: "fleet_partner_ops",
      }),
    });
    expect(fleetInviteRes.status).toBe(201);
    expect(fleetInviteRes.body.data.invitation.deliveryStatus).toBe(
      "delivered",
    );

    const fleetInviteMail = await smtpInbox.waitForRecipient(fleetEmail);
    const fleetInviteTarget = extractInvitationLink(
      fleetInviteMail.text,
      `${fleetOrigin}/invite`,
    );
    forbiddenSecrets.push(fleetInviteTarget.rawTokenForNavigationOnly);

    const fleetContext = await browser.newContext();
    const fleetPage = await fleetContext.newPage();

    await acceptInvitationWithPasswordInBrowser(
      fleetPage,
      fleetInviteTarget.acceptUrl,
      fleetInitialPassword,
    );
    stepEvidence.push({
      step: "4a_fleet_accept_invitation_with_password",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/invite?token=[REDACTED_TOKEN]",
      status: 200,
      outcome: "fleet_invitation_accepted_and_password_persisted",
    });

    const fleetFirstLoginStatus = await loginWithPasswordInBrowser(
      fleetPage,
      fleetOrigin,
      fleetEmail,
      fleetInitialPassword,
    );
    expect(fleetFirstLoginStatus).toBe(200);
    await fleetPage.waitForURL(
      (url) =>
        url.origin === new URL(fleetOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "4b_fleet_initial_password_login",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/login",
      status: fleetFirstLoginStatus,
      outcome: "fleet_session_cookie_established",
    });

    const fleetTotpEnrollment = await enrollAndConfirmTotpInBrowser(
      fleetPage,
      fleetOrigin,
      authenticator,
      forbiddenSecrets,
    );
    const fleetSecret = forbiddenSecrets.at(-11)!;
    stepEvidence.push({
      step: "4c_fleet_totp_enroll_and_confirm",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/account/security/totp",
      status: fleetTotpEnrollment.confirmStatus,
      outcome: "fleet_totp_enrolled_and_confirmed",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: fleetTotpEnrollment.totpStep,
    });

    const fleetSignOut = await verifyAccountSecurityAndSignOutInBrowser(
      fleetPage,
      fleetOrigin,
    );
    stepEvidence.push({
      step: "4d_fleet_account_security_and_logout",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/account/security",
      status: fleetSignOut.logoutStatus,
      outcome: "fleet_session_inventory_verified_and_signed_out",
    });

    const fleetMfaCode1 = await authenticator.nextCode(fleetSecret);
    const fleetMfaLoginStatus = await loginWithPasswordInBrowser(
      fleetPage,
      fleetOrigin,
      fleetEmail,
      fleetInitialPassword,
      fleetMfaCode1.code,
    );
    expect(fleetMfaLoginStatus).toBe(200);
    await fleetPage.waitForURL(
      (url) =>
        url.origin === new URL(fleetOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "4e_fleet_password_plus_totp_login",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/login",
      status: fleetMfaLoginStatus,
      outcome: "fleet_password_and_totp_verified",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: fleetMfaCode1.step,
    });

    await verifyAccountSecurityAndSignOutInBrowser(fleetPage, fleetOrigin);

    const fleetReset = await requestAndConfirmPasswordResetInBrowser(
      fleetPage,
      fleetOrigin,
      fleetEmail,
      fleetResetPassword,
      smtpInbox,
      forbiddenSecrets,
    );
    stepEvidence.push({
      step: "4f_fleet_forgot_and_reset_password",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/reset-password?token=[REDACTED_TOKEN]",
      status: fleetReset.confirmStatus,
      outcome: "fleet_password_reset_confirmed",
    });

    const fleetMfaCode2 = await authenticator.nextCode(fleetSecret);
    const fleetPostResetLoginStatus = await loginWithPasswordInBrowser(
      fleetPage,
      fleetOrigin,
      fleetEmail,
      fleetResetPassword,
      fleetMfaCode2.code,
    );
    expect(fleetPostResetLoginStatus).toBe(200);
    await fleetPage.waitForURL(
      (url) =>
        url.origin === new URL(fleetOrigin).origin &&
        !url.pathname.startsWith("/login"),
    );
    stepEvidence.push({
      step: "4g_fleet_relogin_with_new_password_and_totp",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/login",
      status: fleetPostResetLoginStatus,
      outcome: "fleet_reauthenticated_with_new_password_and_totp",
      authenticatorDevice: authenticator.deviceLabel,
      totpStep: fleetMfaCode2.step,
    });
    await fleetContext.close();

    // -------------------------------------------------------------------------
    // 5. Write Redacted Hosted Evidence & Real-Surface Classification
    // -------------------------------------------------------------------------
    const rawEvidence = {
      generatedAt: new Date().toISOString(),
      candidateVersion,
      apiRuntimeSha,
      hosts: {
        api: apiUrl,
        tenantConsoleWeb: tenantOrigin,
        enterpriseDispatchWeb: enterpriseOrigin,
        agencyPortalWeb: agencyOrigin,
        fleetPartnerPortalWeb: fleetOrigin,
      },
      classification: buildFourPortalHostedJourneyClassification(),
      steps: stepEvidence,
    };

    const redactedEvidence = redactHostedJourneySecrets(
      rawEvidence,
      forbiddenSecrets,
    );
    const serialized = JSON.stringify(redactedEvidence, null, 2);
    assertNoLeakedSecretsInEvidence(serialized, forbiddenSecrets);

    await writeFile(
      path.join(
        evidenceDir,
        "four-portal-password-hosted-journey-evidence.json",
      ),
      `${serialized}\n`,
      "utf8",
    );
  });
});
