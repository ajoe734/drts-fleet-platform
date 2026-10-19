import { expect, test } from "@playwright/test";
import {
  PAX,
  acceptConsent,
  directOtpVerify,
  fillOtpCode,
  logoutFromAccount,
  openPhoneLogin,
  requestSimulatedOtp,
  resendSimulatedOtp,
  reviewPhoneTarget,
  submitOtpVerify,
  wrongCode,
} from "./pax-bureau-acceptance/otp-consent-journey";
import {
  bureauPhone,
  roleHeaders,
} from "./pax-bureau-acceptance/review-runtime";

/**
 * UC01 bureau gap coverage: the existing pax-review-shared-order-demo journey
 * only exercises one successful first-time OTP/consent pass. The bureau
 * review (bureau-sixteen-case-source-review/review.md, UC01) flags wrong
 * code, expiry/resend, consent refusal, the real five-minute code expiry and
 * a returning session's consent-already-current skip as still missing real
 * UI/BFF evidence. Each case below uses its own dedicated rehearsal phone
 * number. Hosted CI seeds a disposable database. Shared runs require explicit
 * per-case rehearsal-pool allocation in PAX_BUREAU_PHONES and must still
 * observe the actual first-consent prompt; no existing user is cleared.
 * Other original UC01-16 branches continue in the sibling specs, under the
 * same task and test-helper scope. Unexecuted cases remain unverified.
 */
test.describe.configure({ mode: "serial" });
test.use({ extraHTTPHeaders: roleHeaders("pax") });

test("consent gate blocks continue until checked, and refusal revokes the session", async ({
  page,
}, info) => {
  const phone = bureauPhone("consent");
  await openPhoneLogin(page, phone);
  const { code } = await requestSimulatedOtp(page);
  await fillOtpCode(page, code);
  const verification = await submitOtpVerify(page);
  expect(verification.status()).toBe(201);

  await expect(
    page.getByText("歡迎加入，請同意服務條款", { exact: true }),
  ).toBeVisible();
  const continueButton = page.getByRole("button", {
    name: "繼續",
    exact: true,
  });
  await expect(continueButton).toBeDisabled();
  const consentCheckbox = page.getByRole("checkbox");
  await consentCheckbox.check();
  await expect(continueButton).toBeEnabled();
  await info.attach("A-consent-checkbox-gates-continue", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await consentCheckbox.uncheck();
  await expect(continueButton).toBeDisabled();

  await page.getByRole("button", { name: "不同意並登出", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "手機號碼登入", exact: true }),
  ).toBeVisible();
  const afterRefuse = await page.request.get(`${PAX}/api/passenger-app/me`);
  expect(afterRefuse.status()).toBe(401);
  await info.attach("A-consent-refusal-facts", {
    body: JSON.stringify({
      phone,
      consentPromptShown: true,
      continueDisabledWhileUnchecked: true,
      continueEnabledWhenChecked: true,
      refusedToEntryScreen: true,
      afterRefuseMeStatus: afterRefuse.status(),
      scope: "real consent-gate UI and real session revocation via /me",
    }),
    contentType: "application/json",
  });
});

test("wrong OTP codes count down remaining attempts and lock after five", async ({
  page,
}, info) => {
  const phone = bureauPhone("wrong");
  await openPhoneLogin(page, phone);
  const { code } = await requestSimulatedOtp(page);
  const bad = wrongCode(code);
  const remainingObserved: number[] = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await fillOtpCode(page, bad);
    const response = await submitOtpVerify(page);
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_code");
    if (attempt < 5) {
      const remaining = 5 - attempt;
      const errorAlert = page.getByRole("alert").filter({
        has: page.getByText(`本次操作剩餘嘗試次數: ${remaining}`, {
          exact: true,
        }),
      });
      await expect(errorAlert).toBeVisible();
      await expect(errorAlert).toContainText("驗證碼錯誤");
      await expect(
        page.getByText(`本次操作剩餘嘗試次數: ${remaining}`, { exact: true }),
      ).toBeVisible();
      remainingObserved.push(remaining);
    }
  }
  await expect(
    page.getByText("錯誤次數已達上限，請重新發送驗證碼", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "驗證", exact: true }),
  ).toBeDisabled();
  await info.attach("B-otp-lockout-facts", {
    body: JSON.stringify({
      phone,
      remainingAttemptsObservedPerTry: remainingObserved,
      lockedAfterFiveRealWrongAttempts: true,
      verifyDisabledWhenLocked: true,
      scope:
        "every attempt is a real /auth/otp/verify round trip, not a UI-only counter",
    }),
    contentType: "application/json",
  });
});

test("resend issues a new code; the superseded challenge is rejected server-side", async ({
  page,
}, info) => {
  const phone = bureauPhone("resend");
  const target = reviewPhoneTarget(phone);
  await openPhoneLogin(page, phone);
  const first = await requestSimulatedOtp(page);

  // Real cooldown, not a fake clock: the resend button stays disabled for the
  // unchanged sixty-second resendAt window.
  await expect(
    page.getByRole("button", { name: "重新發送驗證碼", exact: true }),
  ).toBeEnabled({ timeout: 70_000 });
  const second = await resendSimulatedOtp(page);
  expect(second.challenge).not.toBe(first.challenge);

  const staleAttempt = await directOtpVerify(page, {
    target,
    provider: "phone",
    code: first.code,
    challenge: first.challenge,
  });
  expect(staleAttempt.status()).toBe(400);
  expect((await staleAttempt.json()).error.code).toBe("invalid_code");

  await fillOtpCode(page, second.code);
  const verification = await submitOtpVerify(page);
  expect(verification.status()).toBe(201);
  await info.attach("C-otp-resend-facts", {
    body: JSON.stringify({
      phone,
      firstChallengeRejectedAfterResend: true,
      secondChallengeVerified: true,
      scope:
        "real sixty-second resend cooldown and direct API replay of the superseded challenge",
    }),
    contentType: "application/json",
  });
});

test("the real five-minute code expiry locks the UI and the server rejects the stale code", async ({
  page,
}, info) => {
  // This is the one real-time wait this file could not avoid: the server's
  // expiresAt is a hard-coded now+300000ms in passenger-otp.service.ts, not
  // an env-tunable value, so proving expiry needs an actual elapsed five
  // minutes, not a fake clock. The whole-file serial job budget (see
  // ci-integ.yml's ui-bureau-acceptance-e2e timeout-minutes) accounts for it.
  test.setTimeout(8 * 60_000);
  const phone = bureauPhone("expiry");
  const target = reviewPhoneTarget(phone);
  await openPhoneLogin(page, phone);
  const { code, challenge } = await requestSimulatedOtp(page);
  await fillOtpCode(page, code);

  await page.waitForTimeout(301_000);

  await expect(
    page.getByText("驗證碼已過期，請重新發送", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "驗證", exact: true }),
  ).toBeDisabled();
  for (let index = 0; index < 6; index += 1)
    await expect(
      page.getByRole("textbox", {
        name: `6 位數驗證碼 ${index + 1}`,
        exact: true,
      }),
    ).toBeDisabled();

  const staleServerSide = await directOtpVerify(page, {
    target,
    provider: "phone",
    code,
    challenge,
  });
  expect(staleServerSide.status()).toBe(400);
  expect((await staleServerSide.json()).error.code).toBe("invalid_code");

  const resend = await resendSimulatedOtp(page);
  await fillOtpCode(page, resend.code);
  const verification = await submitOtpVerify(page);
  expect(verification.status()).toBe(201);
  await info.attach("D-otp-five-minute-expiry-facts", {
    body: JSON.stringify({
      phone,
      verifyDisabledAfterRealFiveMinuteWait: true,
      codeInputsDisabledAfterRealFiveMinuteWait: true,
      expiredCodeRejectedServerSideAfterRealWait: true,
      accountRecoversViaRealResendAfterExpiry: true,
      scope:
        "real elapsed five-minute wait against the server's hard-coded expiresAt; no fake clock",
    }),
    contentType: "application/json",
  });
});

test("a returning session with current consent skips the consent gate on the next login", async ({
  page,
}, info) => {
  const phone = bureauPhone("returning");
  await openPhoneLogin(page, phone);
  const { code } = await requestSimulatedOtp(page);
  await fillOtpCode(page, code);
  const firstVerification = await submitOtpVerify(page);
  expect(firstVerification.status()).toBe(201);
  await expect(
    page.getByText("歡迎加入，請同意服務條款", { exact: true }),
  ).toBeVisible();
  await acceptConsent(page);

  await logoutFromAccount(page);

  await openPhoneLogin(page, phone);
  const { code: secondCode } = await requestSimulatedOtp(page);
  await fillOtpCode(page, secondCode);
  const secondVerification = await submitOtpVerify(page);
  expect(secondVerification.status()).toBe(201);
  await page.waitForURL(`${PAX}/`);
  await expect(
    page.getByText("歡迎加入，請同意服務條款", { exact: true }),
  ).not.toBeVisible();
  await info.attach("E-returning-session-consent-skip-facts", {
    body: JSON.stringify({
      phone,
      consentPersistedOnFirstLogin: true,
      loggedOutThenLoggedBackInWithSameAccount: true,
      consentGateSkippedOnReturningSessionWithCurrentConsent: true,
      scope:
        "real ConsentGate.load() termsVersion/privacyVersion match against the real logged-out/logged-back-in account",
    }),
    contentType: "application/json",
  });
});
