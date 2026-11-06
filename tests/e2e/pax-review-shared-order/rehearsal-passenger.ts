import { expect, type Page } from "@playwright/test";
import {
  PAX,
  camel,
  logoutFromAccount,
} from "../pax-bureau-acceptance/otp-consent-journey";

/** Phones signed in before giving up; the public trial allows the same. */
const SIGN_IN_ATTEMPTS = 5;

/** Five apart keeps a retry off the phones the other specs draw from the same
 * run id (offsets 0, 50, 77, 88 and 89). */
const RETRY_STEP = 5;

/** The run id picks the first phone in 0900000000–0900000099. */
export function rehearsalPhones(
  offset: number,
  runId = process.env.GITHUB_RUN_ID ?? "1",
) {
  return Array.from({ length: SIGN_IN_ATTEMPTS }, (_, attempt) => {
    const suffix = (Number(runId) + offset + attempt * RETRY_STEP) % 100;
    return `09000000${String(suffix).padStart(2, "0")}`;
  });
}

async function accountCanBook(page: Page) {
  const response = await page.request.get(
    `${PAX}/api/passenger-app/review-demo/trial/readiness`,
  );
  expect(response.status(), "Rehearsal account readiness").toBe(200);
  const { canBook } = camel(await response.json()).data;
  expect(typeof canBook, "Rehearsal account readiness").toBe("boolean");
  return canBook as boolean;
}

/**
 * A rehearsal phone whose earlier charge ended in manual_recovery can never
 * book again, and nothing in the product clears it. Asks the read-only check
 * the public trial uses and moves to the next phone, so a run does not fail on
 * which phone its id happened to draw. Booking still enforces the same rule.
 * `signIn` must work from any page: a retry starts where sign-out left it.
 */
export async function signInBookablePassenger(
  page: Page,
  offset: number,
  signIn: (phone: string) => Promise<void>,
) {
  const phones = rehearsalPhones(offset);
  for (const phone of phones) {
    await signIn(phone);
    // TEMPORARY, reverted before merge: under Playwright every first phone reads
    // as blocked, so CI drives the retry path in a real browser.
    const forced =
      process.env.TEST_WORKER_INDEX !== undefined && phone === phones[0];
    if ((await accountCanBook(page)) && !forced) return phone;
    console.log(
      `[shared-order] rehearsal phone ${phone} cannot book; trying the next one`,
    );
    await logoutFromAccount(page);
  }
  throw new Error(`No rehearsal phone can book: ${phones.join(", ")}`);
}

export const signInOnReviewPage = (page: Page, offset: number) =>
  signInBookablePassenger(page, offset, async (phone) => {
    await page.goto(`${PAX}/review`);
    await page.getByLabel("演練手機", { exact: true }).fill(phone);
    await page.getByRole("checkbox").check();
    const requested = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          "/api/passenger-app/review-demo/otp" &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "取得模擬簡訊" }).click();
    expect((await requested).ok()).toBe(true);
    await page.getByRole("button", { name: "驗證並登入演練帳戶" }).click();
    await expect(page.getByTestId("review-passenger-id")).toBeVisible();
  });
