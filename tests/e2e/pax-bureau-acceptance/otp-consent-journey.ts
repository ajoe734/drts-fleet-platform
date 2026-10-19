import { expect, type APIResponse, type Page } from "@playwright/test";

export const PAX =
  process.env.PAX_REVIEW_PASSENGER_ORIGIN || "http://localhost:3319";

export const camel = (value: any): any =>
  Array.isArray(value)
    ? value.map(camel)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
            camel(entry),
          ]),
        )
      : value;

export async function openPhoneLogin(page: Page, phone: string) {
  await page.goto(`${PAX}/login`);
  await page
    .getByRole("button", { name: "手機號碼登入", exact: true })
    .click();
  await page.getByLabel("請輸入您的手機號碼", { exact: true }).fill(phone);
}

/** Issues the rehearsal SMS via whichever button currently triggers it
 * ("取得驗證碼" on first request, "重新發送驗證碼" on resend) and returns the
 * real challenge/code pair from the server response, not a locally guessed value. */
export async function issueSimulatedOtp(
  page: Page,
  trigger: () => Promise<void>,
): Promise<{ challenge: string; code: string }> {
  const requested = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        "/api/passenger-app/review-demo/otp" &&
      response.request().method() === "POST",
  );
  await trigger();
  const response = await requested;
  expect(response.ok(), `Rehearsal SMS HTTP${response.status()}`).toBe(true);
  return camel(await response.json()).data;
}

export const requestSimulatedOtp = (page: Page) =>
  issueSimulatedOtp(page, () =>
    page.getByRole("button", { name: "取得驗證碼", exact: true }).click(),
  );

export const resendSimulatedOtp = (page: Page) =>
  issueSimulatedOtp(page, () =>
    page
      .getByRole("button", { name: "重新發送驗證碼", exact: true })
      .click(),
  );

export async function fillOtpCode(page: Page, code: string) {
  for (let index = 0; index < 6; index += 1)
    await page
      .getByRole("textbox", {
        name: `6 位數驗證碼 ${index + 1}`,
        exact: true,
      })
      .fill(code.charAt(index));
}

/** Clicks the real 驗證 button and returns the live /auth/otp/verify response;
 * callers assert the status/body themselves so both success and failure
 * branches share one real network round trip. */
export async function submitOtpVerify(page: Page) {
  const verification = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/auth/otp/verify") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "驗證", exact: true }).click();
  return verification;
}

export function wrongCode(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

/** Direct API replay of a captured challenge/code pair, bypassing the UI's own
 * current OTP state, so a superseded or consumed challenge can be proven dead
 * server-side instead of merely absent from the page. */
export function directOtpVerify(
  page: Page,
  body: { target: string; provider: "phone"; code: string; challenge: string },
): Promise<APIResponse> {
  // The Next.js BFF's checkCSRF (app/api/passenger-app/[...path]/route.ts)
  // requires a same-origin Origin header on every non-GET call, which a real
  // browser fetch() sends automatically but page.request does not; without
  // this header the BFF returns 403 CSRF_CHECK_FAILED before ever reaching
  // the real OTP verify logic, not the 400 invalid_code these tests assert.
  return page.request.post(`${PAX}/api/passenger-app/auth/otp/verify`, {
    data: body,
    headers: { "Content-Type": "application/json", Origin: PAX },
  });
}

/** Mirrors canonicalOtpTarget's phone normalization for the 09xxxxxxxx rehearsal pool. */
export function reviewPhoneTarget(localPhone: string): string {
  return `+886${localPhone.slice(1)}`;
}

/** Checks the real consent checkbox and clicks the real 繼續 button, taking the
 * account from unconsented to the current termsVersion/privacyVersion via the
 * actual ConsentGate.submit() PATCH, then waits for the real router.push("/")
 * navigation ConsentGate.onAccepted triggers. */
export async function acceptConsent(page: Page) {
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "繼續", exact: true })
    .click();
  await page.waitForURL(`${PAX}/`);
}

/** Drives the real /account screen's two-step logout confirmation (ghost
 * 登出 -> confirmation screen -> primary 登出) and waits for the real
 * client.logout() call to land on /login, the same path account/page.tsx
 * itself navigates to. */
export async function logoutFromAccount(page: Page) {
  await page.goto(`${PAX}/account`);
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await expect(
    page.getByText("確定要登出嗎？", { exact: true }),
  ).toBeVisible();
  const loggedOut = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/auth/logout") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await loggedOut;
  await page.waitForURL(`${PAX}/login`);
}
