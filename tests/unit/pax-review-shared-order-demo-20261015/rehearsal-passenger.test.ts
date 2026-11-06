import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { logoutFromAccount } from "../../e2e/pax-bureau-acceptance/otp-consent-journey";
import {
  rehearsalPhones,
  signInBookablePassenger,
} from "../../e2e/pax-review-shared-order/rehearsal-passenger";

vi.mock(
  "../../e2e/pax-bureau-acceptance/otp-consent-journey",
  async (load) => ({
    ...(await load<object>()),
    logoutFromAccount: vi.fn(async () => undefined),
  }),
);

/** Run 42008798116 failed deploy acceptance on 0900000004. */
const FAILED_RUN = "42008798116";
const DISPATCH_TIMEOUT_OFFSET = 88;
const SPEC_OFFSETS = [0, 50, 77, 88, 89];

const pageReading = (...answers: { status?: number; canBook?: unknown }[]) => {
  const get = vi.fn(async (_url: string) => {
    const { status = 200, canBook } = answers.shift()!;
    return {
      status: () => status,
      json: async () => ({ data: { can_book: canBook } }),
    };
  });
  return { request: { get } } as never;
};

beforeEach(() => {
  vi.stubEnv("GITHUB_RUN_ID", FAILED_RUN);
  vi.mocked(logoutFromAccount).mockClear();
});
afterEach(() => vi.unstubAllEnvs());

test("a bookable first phone is the same phone the run id always drew", async () => {
  const signIn = vi.fn(async (_phone: string) => undefined);

  const phone = await signInBookablePassenger(
    pageReading({ canBook: true }),
    DISPATCH_TIMEOUT_OFFSET,
    signIn,
  );

  expect(phone).toBe("0900000004");
  expect(signIn.mock.calls).toEqual([["0900000004"]]);
  expect(logoutFromAccount).not.toHaveBeenCalled();
});

test("a phone that cannot book is signed out before the next phone signs in", async () => {
  const order: string[] = [];
  vi.mocked(logoutFromAccount).mockImplementation(async () => {
    order.push("sign out");
  });

  const phone = await signInBookablePassenger(
    pageReading({ canBook: false }, { canBook: true }),
    DISPATCH_TIMEOUT_OFFSET,
    async (candidate) => {
      order.push(candidate);
    },
  );

  expect(phone).toBe("0900000009");
  expect(order).toEqual(["0900000004", "sign out", "0900000009"]);
});

test("the run fails by name when no phone can book", async () => {
  const signIn = vi.fn(async (_phone: string) => undefined);
  const answers = Array.from({ length: 5 }, () => ({ canBook: false }));

  await expect(
    signInBookablePassenger(
      pageReading(...answers),
      DISPATCH_TIMEOUT_OFFSET,
      signIn,
    ),
  ).rejects.toThrow(
    "No rehearsal phone can book: 0900000004, 0900000009, 0900000014, 0900000019, 0900000024",
  );
  expect(signIn).toHaveBeenCalledTimes(5);
});

test.each([
  ["an error status", { status: 500 }],
  ["an unreadable answer", { canBook: "unknown" }],
])("%s from the check fails the step, not a retry", async (_name, answer) => {
  const signIn = vi.fn(async (_phone: string) => undefined);

  await expect(
    signInBookablePassenger(
      pageReading(answer),
      DISPATCH_TIMEOUT_OFFSET,
      signIn,
    ),
  ).rejects.toThrow("toBe");
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(logoutFromAccount).not.toHaveBeenCalled();
});

test("a retry never lands on the first phone of another spec in the same run", () => {
  for (const runId of ["0", "37", FAILED_RUN]) {
    for (const offset of SPEC_OFFSETS) {
      const [, ...retries] = rehearsalPhones(offset, runId);
      const others = SPEC_OFFSETS.filter((other) => other !== offset).map(
        (other) => rehearsalPhones(other, runId)[0],
      );
      expect(retries.filter((phone) => others.includes(phone))).toEqual([]);
    }
  }
});
