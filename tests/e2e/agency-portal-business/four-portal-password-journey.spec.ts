import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { seedAgencyPlatformPersonnel } from "./platform-personnel-fixture";
import { startAgencySmtpInbox } from "./smtp-inbox";
import {
  SIMULATED_AUTHENTICATOR_DEVICE_LABEL,
  SimulatedTotpAuthenticatorDevice,
  assertNoLeakedSecretsInEvidence,
  buildFourPortalHostedJourneyClassification,
  extractInvitationLink,
  extractPasswordResetTarget,
  redactHostedJourneySecrets,
} from "./totp-authenticator-fixture";

const apiUrl = "http://127.0.0.1:3141";
const agencyOrigin = "http://localhost:3212";
const tenantOrigin = "http://localhost:3213";
const enterpriseOrigin = "http://localhost:3214";
const fleetOrigin = "http://localhost:3215";
const smtpPort = 2526;
type AgencySmtpInbox = Awaited<ReturnType<typeof startAgencySmtpInbox>>;
const evidenceDir = path.resolve(".artifacts/agency-portal-business");
const evidencePath = path.join(
  evidenceDir,
  "four-portal-password-hosted-journey-evidence.json",
);
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
    runtimeSha: response.headers.get("x-drts-candidate-sha"),
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
  email: string,
  password: string,
) {
  await page.goto(acceptUrl, { waitUntil: "networkidle" });
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[type="email"]') });
  await form.locator('input[type="email"]').fill(email);
  const fields = form.locator('input[type="password"]');
  await fields.nth(0).fill(password);
  await fields.nth(1).fill(password);
  const [accepted, login] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/accept-with-password") &&
        response.request().method() === "POST",
    ),
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/password-login") &&
        response.request().method() === "POST",
    ),
    form.locator('button[type="submit"]').click(),
  ]);
  expect(accepted.ok()).toBe(true);
  expect(login.ok()).toBe(true);
  return { acceptedStatus: accepted.status(), loginStatus: login.status() };
}

async function loginWithPasswordInBrowser(
  page: Page,
  portalOrigin: string,
  email: string,
  password: string,
  totpCode?: string,
): Promise<number> {
  await page.goto(`${portalOrigin}/login`, { waitUntil: "networkidle" });
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[autocomplete="current-password"]') });
  await form.locator('input[type="email"]').fill(email);
  await form.locator('input[type="password"]').fill(password);

  if (totpCode) {
    const totpInput = form.locator('input[autocomplete="one-time-code"]');
    if ((await totpInput.count()) === 0) {
      await form.locator('button[aria-expanded="false"]').click();
    }
    await expect(totpInput).toBeVisible();
    await totpInput.fill(totpCode);
  }

  const loginResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/password-login") &&
      res.request().method() === "POST",
  );
  await form.locator('button[type="submit"]').click();
  const loginResponse = await loginResponsePromise;
  return loginResponse.status();
}

async function enrollAndConfirmTotpInBrowser(
  page: Page,
  portalOrigin: string,
  authenticator: SimulatedTotpAuthenticatorDevice,
  forbiddenSecrets: string[],
): Promise<{
  secret: string;
  totpStep: number;
  enrollStatus: number;
  confirmStatus: number;
}> {
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
    .filter({ hasText: /^(開始設定|Start setup)$/i })
    .first()
    .click();
  const enrollResponse = await enrollResponsePromise;
  const enrollStatus = enrollResponse.status();
  expect(enrollResponse.ok()).toBe(true);

  const form = page
    .locator("form")
    .filter({ has: page.locator('input[autocomplete="one-time-code"]') });
  const manualFields = form.locator("input[readonly]");
  const secret = await manualFields.nth(0).inputValue();
  forbiddenSecrets.push(secret, await manualFields.nth(1).inputValue());

  const generated = await authenticator.nextCode(secret);
  await page
    .locator('input[autocomplete="one-time-code"]')
    .fill(generated.code);

  const confirmResponsePromise = page.waitForResponse(
    (res) =>
      res.url().includes("/mfa/totp/confirm") &&
      res.request().method() === "POST",
  );
  await form.locator('button[type="submit"]').click();
  const confirmResponse = await confirmResponsePromise;
  const confirmStatus = confirmResponse.status();
  expect(confirmResponse.ok()).toBe(true);

  const heading = page.getByRole("heading", {
    name: /請保存您的復原碼|Save your recovery codes/i,
  });
  await expect(heading).toBeVisible();
  const recoveryCodes = heading.locator("..").getByRole("listitem");
  await expect.poll(() => recoveryCodes.count()).toBe(10);
  forbiddenSecrets.push(...(await recoveryCodes.allTextContents()));
  return {
    secret,
    totpStep: generated.step,
    enrollStatus,
    confirmStatus,
  };
}

/** Reads the server's own record of how the signed-in session authenticated. */
async function currentSessionAuthMethods(
  page: Page,
  portalOrigin: string,
): Promise<string[]> {
  const response = await page.request.get(`${portalOrigin}/api/auth/sessions`);
  expect(response.status()).toBe(200);
  const sessions: unknown = (await response.json())?.data;
  const current = (Array.isArray(sessions) ? sessions : []).find(
    (row) => row?.is_current === true,
  );
  return current?.auth_methods ?? [];
}

async function verifyAccountSecurityAndSignOutInBrowser(
  page: Page,
  portalOrigin: string,
  secondFactor: "used" | "not_used",
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
  const payload = await sessionsResponse.json();
  const sessions: unknown = payload?.data;
  const current = (Array.isArray(sessions) ? sessions : []).find(
    (row) => row?.is_current === true,
  );
  expect(Boolean(current)).toBe(true);
  // The server's own record of how this session signed in.
  expect(current.auth_methods.includes("otp")).toBe(secondFactor === "used");
  // Other sessions carry a "sign out this device" button; match the badge only.
  await expect(
    page.getByRole("listitem").filter({ hasText: /·\s*(此裝置|This device)/ }),
  ).toHaveCount(1);

  // Keep the signed-in cookies elsewhere: after sign-out the page's own cookies
  // are cleared, which says nothing about the session on the server.
  const replay = await page
    .context()
    .browser()!
    .newContext({ storageState: await page.context().storageState() });
  const replayedSessions = () =>
    replay.request.get(`${portalOrigin}/api/auth/sessions`);
  expect((await replayedSessions()).status()).toBe(200);

  const logoutResponsePromise = page.waitForResponse(
    (res) =>
      new URL(res.url()).pathname === "/api/auth/logout-all" &&
      res.request().method() === "POST",
  );
  await page
    .locator("button")
    .filter({ hasText: /^(登出所有裝置|Sign out of all devices)$/i })
    .first()
    .click();
  const logoutResponse = await logoutResponsePromise;
  const logoutStatus = logoutResponse.status();
  expect(logoutStatus).toBe(200);
  const afterLogout = await page.request.get(
    `${portalOrigin}/api/auth/sessions`,
  );
  expect(afterLogout.status()).toBe(401);
  expect((await replayedSessions()).status()).toBe(401);
  await replay.close();
  return { sessionsStatus, logoutStatus };
}

async function readMailFor(inbox: AgencySmtpInbox, email: string, after = 0) {
  const received = () =>
    inbox.messages
      .slice(after)
      .find((message) => message.recipients.includes(email.toLowerCase()));
  await expect.poll(() => Boolean(received()), { timeout: 15_000 }).toBe(true);
  return received()!;
}

async function requestAndConfirmPasswordResetInBrowser(
  page: Page,
  portalOrigin: string,
  email: string,
  newPassword: string,
  smtpInbox: AgencySmtpInbox,
  forbiddenSecrets: string[],
  resetOrigin = portalOrigin,
): Promise<{
  requestStatus: number;
  confirmStatus: number;
  redactedResetUrl: string;
}> {
  const previousMessages = smtpInbox.messages.length;
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
  expect(requestResponse.ok()).toBe(true);
  await expect(page.locator('[role="status"]')).toBeVisible();

  const latestMail = await readMailFor(smtpInbox, email, previousMessages);
  const resetTarget = extractPasswordResetTarget(latestMail.body, resetOrigin);
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
  expect(confirmResponse.ok()).toBe(true);
  await expect(page.locator('[role="status"]')).toBeVisible();

  return {
    requestStatus,
    confirmStatus,
    redactedResetUrl: resetTarget.redactedResetUrl,
  };
}

const WARM_PAGES = [
  "/login",
  "/invite",
  "/forgot-password",
  "/reset-password",
  "/account/security",
  "/account/security/totp",
  "/",
];

async function warmPortalPages() {
  for (const origin of [
    tenantOrigin,
    enterpriseOrigin,
    agencyOrigin,
    fleetOrigin,
  ]) {
    // The dev servers listen on 127.0.0.1; skip localhost's IPv6 attempt.
    const base = origin.replace("//localhost:", "//127.0.0.1:");
    for (const page of WARM_PAGES) {
      // Status does not matter (an unauthenticated page may redirect or
      // 404); the request only has to make the server compile the route.
      await fetch(`${base}${page}`, {
        redirect: "manual",
        signal: AbortSignal.timeout(120_000),
      }).catch(() => undefined);
    }
  }
}

test.use({ trace: "off", screenshot: "off", video: "off" });

test.describe("Four-portal hosted invitation, password setup, TOTP MFA, logout, forgot/reset password and re-login rehearsal", () => {
  let smtpInbox: AgencySmtpInbox;
  let platformAdminToken = "";
  let apiRuntimeSha: string | null = null;

  test.beforeAll(async () => {
    await mkdir(evidenceDir, { recursive: true });
    await writeFile(
      evidencePath,
      JSON.stringify({
        phase: "preparing_fixture",
        candidateVersion,
        steps: [],
      }) + "\n",
      "utf8",
    );
    // `next dev` compiles a page on its first request. Compile the pages this
    // journey opens now, so a slow compile on a loaded runner is not charged
    // to a step's own wait halfway through the agency portal.
    test.setTimeout(10 * 60_000);
    await warmPortalPages();

    const personnel = await seedAgencyPlatformPersonnel();
    smtpInbox = await startAgencySmtpInbox(smtpPort);

    const tokenRes = await apiJson<{
      token: string;
      expiresIn: string;
    }>("/api/auth/token", {
      method: "POST",
      headers: {
        "x-actor-type": "platform_admin",
        "x-actor-id": personnel.actorId,
        "x-realm": "platform",
      },
      body: JSON.stringify({}),
    });
    expect([200, 201]).toContain(tokenRes.status);
    expect(typeof tokenRes.body.token).toBe("string");
    platformAdminToken = tokenRes.body.token;
    apiRuntimeSha = tokenRes.runtimeSha;
    expect(apiRuntimeSha).toBe(candidateVersion);
  });

  test.afterAll(async () => {
    await smtpInbox?.close();
  });

  test("executes disposable password invitation, TOTP enrollment/login, logout, password reset and re-login across tenant, enterprise, agency and fleet portals", async ({
    browser,
  }) => {
    test.setTimeout(9 * 60_000);
    const runTag = randomUUID().slice(0, 8);
    const authenticator = new SimulatedTotpAuthenticatorDevice();
    const forbiddenSecrets: string[] = [platformAdminToken];
    const stepEvidence: HostStepEvidence[] = [];

    async function saveEvidence(phase: "running" | "completed") {
      const fact = {
        phase,
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
      const serialized = JSON.stringify(
        redactHostedJourneySecrets(fact, forbiddenSecrets),
        null,
        2,
      );
      assertNoLeakedSecretsInEvidence(serialized, forbiddenSecrets);
      await writeFile(evidencePath, serialized + "\n", "utf8");
    }

    async function recordStep(step: HostStepEvidence) {
      stepEvidence.push(step);
      await saveEvidence("running");
    }

    await saveEvidence("running");

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

    const tenantInviteMail = await readMailFor(smtpInbox, tenantEmail);
    const tenantInviteTarget = extractInvitationLink(
      tenantInviteMail.body,
      `${tenantOrigin}/invite`,
    );
    forbiddenSecrets.push(tenantInviteTarget.rawTokenForNavigationOnly);

    const tenantContext = await browser.newContext();
    const tenantPage = await tenantContext.newPage();

    const {
      acceptedStatus: tenantAcceptStatus,
      loginStatus: tenantFirstLoginStatus,
    } = await acceptInvitationWithPasswordInBrowser(
      tenantPage,
      tenantInviteTarget.acceptUrl,
      tenantEmail,
      tenantInitialPassword,
    );
    await recordStep({
      step: "1a_tenant_accept_invitation_with_password",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/invite?token=[REDACTED_TOKEN]",
      status: tenantAcceptStatus,
      outcome: "invitation_accepted_and_password_persisted",
    });

    expect(tenantFirstLoginStatus).toBe(200);
    await tenantPage.waitForURL(
      (url) =>
        url.origin === new URL(tenantOrigin).origin && url.pathname === "/",
    );
    await recordStep({
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
    const tenantSecret = tenantTotpEnrollment.secret;
    await recordStep({
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
      "not_used",
    );
    await recordStep({
      step: "1d_tenant_account_security_and_logout",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/account/security",
      status: tenantSignOut1.logoutStatus,
      outcome: "session_inventory_verified_and_signed_out",
    });

    const tenantWithoutCode = await loginWithPasswordInBrowser(
      tenantPage,
      tenantOrigin,
      tenantEmail,
      tenantInitialPassword,
    );
    expect(tenantWithoutCode).toBe(401);
    await recordStep({
      step: "1d2_tenant_password_without_code_denied",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/login",
      status: tenantWithoutCode,
      outcome: "enrolled_second_factor_is_required",
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
    await recordStep({
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

    await verifyAccountSecurityAndSignOutInBrowser(
      tenantPage,
      tenantOrigin,
      "used",
    );

    const tenantReset = await requestAndConfirmPasswordResetInBrowser(
      tenantPage,
      tenantOrigin,
      tenantEmail,
      tenantResetPassword,
      smtpInbox,
      forbiddenSecrets,
    );
    await recordStep({
      step: "1f_tenant_forgot_and_reset_password",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/reset-password?token=[REDACTED_TOKEN]",
      status: tenantReset.confirmStatus,
      outcome: "password_reset_confirmed",
    });

    const tenantPostResetCode = await authenticator.nextCode(tenantSecret);
    // The same code signs in with the new password below, so only the replaced
    // password can be the reason for this denial.
    const tenantOldPassword = await loginWithPasswordInBrowser(
      tenantPage,
      tenantOrigin,
      tenantEmail,
      tenantInitialPassword,
      tenantPostResetCode.code,
    );
    expect(tenantOldPassword).toBe(401);
    await recordStep({
      step: "1f2_tenant_replaced_password_denied",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/login",
      status: tenantOldPassword,
      outcome: "replaced_password_rejected_with_a_valid_code",
    });
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
    // A reset that dropped the second factor would also return 200 here.
    expect(
      (await currentSessionAuthMethods(tenantPage, tenantOrigin)).includes(
        "otp",
      ),
    ).toBe(true);
    await recordStep({
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

    const enterpriseGate = await enterprisePage.goto(`${enterpriseOrigin}/`, {
      waitUntil: "networkidle",
    });
    const loginLink = enterprisePage.locator('a[href="/login"]').first();
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await enterprisePage.waitForURL((url) => url.pathname.startsWith("/login"));
    await recordStep({
      step: "2a_enterprise_unauthenticated_gate_to_login",
      portal: "enterprise-dispatch-web",
      hostOrigin: enterpriseOrigin,
      realm: "tenant",
      path: "/ -> /login",
      status: enterpriseGate?.status() ?? null,
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
    await recordStep({
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
      "used",
    );
    await recordStep({
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
      tenantOrigin,
    );
    await recordStep({
      step: "2d_enterprise_forgot_and_reset_password",
      portal: "tenant-console-web",
      hostOrigin: tenantOrigin,
      realm: "tenant",
      path: "/reset-password?token=[REDACTED_TOKEN]",
      status: enterpriseReset.confirmStatus,
      outcome: "shared_tenant_password_reset_confirmed_on_tenant_portal",
    });

    const enterpriseLoginCode2 = await authenticator.nextCode(tenantSecret);
    // The same code signs in with the new password below, so only the replaced
    // password can be the reason for this denial.
    const enterpriseOldPassword = await loginWithPasswordInBrowser(
      enterprisePage,
      enterpriseOrigin,
      tenantEmail,
      tenantResetPassword,
      enterpriseLoginCode2.code,
    );
    expect(enterpriseOldPassword).toBe(401);
    await recordStep({
      step: "2d2_enterprise_replaced_password_denied",
      portal: "enterprise-dispatch-web",
      hostOrigin: enterpriseOrigin,
      realm: "tenant",
      path: "/login",
      status: enterpriseOldPassword,
      outcome: "replaced_password_rejected_with_a_valid_code",
    });
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
    // A reset that dropped the second factor would also return 200 here.
    expect(
      (
        await currentSessionAuthMethods(enterprisePage, enterpriseOrigin)
      ).includes("otp"),
    ).toBe(true);
    await recordStep({
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
      data: { agency_id: string };
    }>("/api/platform-admin/agencies", {
      method: "POST",
      token: platformAdminToken,
      body: JSON.stringify({
        agencyCode: `TPE-PWD-${runTag.toUpperCase()}`,
        displayName: `臺北市密碼實演機關 ${runTag}`,
      }),
    });
    expect(createAgencyRes.status).toBe(201);
    const agencyId = createAgencyRes.body.data.agency_id;

    const agencyInvitePath = `/api/platform-admin/agencies/${agencyId}/invitations`;
    const agencyStepUpRef = await issueStepUpReference(
      platformAdminToken,
      agencyInvitePath,
      "Four-portal hosted rehearsal disposable agency member invitation",
    );
    const agencyInviteRes = await apiJson<{
      data: {
        invitation: { delivery_status: string };
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
    expect(agencyInviteRes.body.data.invitation.delivery_status).toBe(
      "delivered",
    );

    const agencyInviteMail = await readMailFor(smtpInbox, agencyEmail);
    const agencyInviteTarget = extractInvitationLink(
      agencyInviteMail.body,
      `${agencyOrigin}/invite`,
    );
    forbiddenSecrets.push(agencyInviteTarget.rawTokenForNavigationOnly);

    const agencyContext = await browser.newContext();
    const agencyPage = await agencyContext.newPage();

    const {
      acceptedStatus: agencyAcceptStatus,
      loginStatus: agencyFirstLoginStatus,
    } = await acceptInvitationWithPasswordInBrowser(
      agencyPage,
      agencyInviteTarget.acceptUrl,
      agencyEmail,
      agencyInitialPassword,
    );
    await recordStep({
      step: "3a_agency_accept_invitation_with_password",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/invite?token=[REDACTED_TOKEN]",
      status: agencyAcceptStatus,
      outcome: "agency_invitation_accepted_and_password_persisted",
    });

    expect(agencyFirstLoginStatus).toBe(200);
    await agencyPage.waitForURL(
      (url) =>
        url.origin === new URL(agencyOrigin).origin && url.pathname === "/",
    );
    await recordStep({
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
    const agencySecret = agencyTotpEnrollment.secret;
    await recordStep({
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
      "not_used",
    );
    await recordStep({
      step: "3d_agency_account_security_and_logout",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/account/security",
      status: agencySignOut.logoutStatus,
      outcome: "agency_session_inventory_verified_and_signed_out",
    });

    const agencyWithoutCode = await loginWithPasswordInBrowser(
      agencyPage,
      agencyOrigin,
      agencyEmail,
      agencyInitialPassword,
    );
    expect(agencyWithoutCode).toBe(401);
    await recordStep({
      step: "3d2_agency_password_without_code_denied",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/login",
      status: agencyWithoutCode,
      outcome: "enrolled_second_factor_is_required",
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
    await recordStep({
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

    await verifyAccountSecurityAndSignOutInBrowser(
      agencyPage,
      agencyOrigin,
      "used",
    );

    const agencyReset = await requestAndConfirmPasswordResetInBrowser(
      agencyPage,
      agencyOrigin,
      agencyEmail,
      agencyResetPassword,
      smtpInbox,
      forbiddenSecrets,
    );
    await recordStep({
      step: "3f_agency_forgot_and_reset_password",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/reset-password?token=[REDACTED_TOKEN]",
      status: agencyReset.confirmStatus,
      outcome: "agency_password_reset_confirmed",
    });

    const agencyMfaCode2 = await authenticator.nextCode(agencySecret);
    // The same code signs in with the new password below, so only the replaced
    // password can be the reason for this denial.
    const agencyOldPassword = await loginWithPasswordInBrowser(
      agencyPage,
      agencyOrigin,
      agencyEmail,
      agencyInitialPassword,
      agencyMfaCode2.code,
    );
    expect(agencyOldPassword).toBe(401);
    await recordStep({
      step: "3f2_agency_replaced_password_denied",
      portal: "agency-portal-web",
      hostOrigin: agencyOrigin,
      realm: "agency",
      path: "/login",
      status: agencyOldPassword,
      outcome: "replaced_password_rejected_with_a_valid_code",
    });
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
    // A reset that dropped the second factor would also return 200 here.
    expect(
      (await currentSessionAuthMethods(agencyPage, agencyOrigin)).includes(
        "otp",
      ),
    ).toBe(true);
    await recordStep({
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
        invitation: { delivery_status: string };
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
    expect(fleetInviteRes.body.data.invitation.delivery_status).toBe(
      "delivered",
    );

    const fleetInviteMail = await readMailFor(smtpInbox, fleetEmail);
    const fleetInviteTarget = extractInvitationLink(
      fleetInviteMail.body,
      `${fleetOrigin}/invite`,
    );
    forbiddenSecrets.push(fleetInviteTarget.rawTokenForNavigationOnly);

    const fleetContext = await browser.newContext();
    const fleetPage = await fleetContext.newPage();

    const {
      acceptedStatus: fleetAcceptStatus,
      loginStatus: fleetFirstLoginStatus,
    } = await acceptInvitationWithPasswordInBrowser(
      fleetPage,
      fleetInviteTarget.acceptUrl,
      fleetEmail,
      fleetInitialPassword,
    );
    await recordStep({
      step: "4a_fleet_accept_invitation_with_password",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/invite?token=[REDACTED_TOKEN]",
      status: fleetAcceptStatus,
      outcome: "fleet_invitation_accepted_and_password_persisted",
    });

    expect(fleetFirstLoginStatus).toBe(200);
    await fleetPage.waitForURL(
      (url) =>
        url.origin === new URL(fleetOrigin).origin &&
        !["/login", "/invite"].includes(url.pathname),
    );
    await recordStep({
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
    const fleetSecret = fleetTotpEnrollment.secret;
    await recordStep({
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
      "not_used",
    );
    await recordStep({
      step: "4d_fleet_account_security_and_logout",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/account/security",
      status: fleetSignOut.logoutStatus,
      outcome: "fleet_session_inventory_verified_and_signed_out",
    });

    const fleetWithoutCode = await loginWithPasswordInBrowser(
      fleetPage,
      fleetOrigin,
      fleetEmail,
      fleetInitialPassword,
    );
    expect(fleetWithoutCode).toBe(401);
    await recordStep({
      step: "4d2_fleet_password_without_code_denied",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/login",
      status: fleetWithoutCode,
      outcome: "enrolled_second_factor_is_required",
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
    await recordStep({
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

    await verifyAccountSecurityAndSignOutInBrowser(
      fleetPage,
      fleetOrigin,
      "used",
    );

    const fleetReset = await requestAndConfirmPasswordResetInBrowser(
      fleetPage,
      fleetOrigin,
      fleetEmail,
      fleetResetPassword,
      smtpInbox,
      forbiddenSecrets,
    );
    await recordStep({
      step: "4f_fleet_forgot_and_reset_password",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/reset-password?token=[REDACTED_TOKEN]",
      status: fleetReset.confirmStatus,
      outcome: "fleet_password_reset_confirmed",
    });

    const fleetMfaCode2 = await authenticator.nextCode(fleetSecret);
    // The same code signs in with the new password below, so only the replaced
    // password can be the reason for this denial.
    const fleetOldPassword = await loginWithPasswordInBrowser(
      fleetPage,
      fleetOrigin,
      fleetEmail,
      fleetInitialPassword,
      fleetMfaCode2.code,
    );
    expect(fleetOldPassword).toBe(401);
    await recordStep({
      step: "4f2_fleet_replaced_password_denied",
      portal: "fleet-partner-portal-web",
      hostOrigin: fleetOrigin,
      realm: "partner",
      path: "/login",
      status: fleetOldPassword,
      outcome: "replaced_password_rejected_with_a_valid_code",
    });
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
    // A reset that dropped the second factor would also return 200 here.
    expect(
      (await currentSessionAuthMethods(fleetPage, fleetOrigin)).includes("otp"),
    ).toBe(true);
    await recordStep({
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

    await saveEvidence("completed");
  });
});
