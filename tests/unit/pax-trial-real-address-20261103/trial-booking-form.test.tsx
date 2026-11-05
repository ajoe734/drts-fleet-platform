// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React, { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PassengerBookingSettingsResponse } from "@drts/contracts";
import type { PassengerBookingClient } from "@drts/passenger-client";

const context = vi.hoisted(() => ({ review: true, trial: true }));
vi.mock(
  "../../../apps/passenger-app-web/components/review-demo/review-context",
  () => ({
    useReviewDemo: () => context.review,
    useReviewDemoPending: () => false,
    useTrialMode: () => context.trial,
  }),
);

import {
  BookingForm,
  type BookingDraft,
} from "../../../apps/passenger-app-web/components/booking/booking-form";

const appRequire = createRequire(
  resolve("apps/passenger-app-web/package.json"),
);
const { AppRouterContext } = appRequire(
  "next/dist/shared/lib/app-router-context.shared-runtime",
) as typeof import("next/dist/shared/lib/app-router-context.shared-runtime");
const router = {
  bfcacheId: "synthetic-trial-booking-route",
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};
const client = {
  search: vi.fn(async () => ({ candidates: [] })),
  resolve: vi.fn(),
  reverse: vi.fn(),
} as unknown as PassengerBookingClient;
const settings = {
  minLeadTimeMinutes: 1,
  requireSmsVerification: false,
} as unknown as PassengerBookingSettingsResponse;

function Harness() {
  const [draft, setDraft] = useState<BookingDraft>({
    origin: null,
    destination: null,
    localTime: "",
  });
  return (
    <AppRouterContext.Provider value={router}>
      <BookingForm
        client={client}
        settings={settings}
        draft={draft}
        onChange={setDraft}
        onQuote={() => undefined}
        busy={false}
      />
    </AppRouterContext.Provider>
  );
}

beforeEach(() => {
  context.review = true;
  context.trial = true;
  window.localStorage.clear();
});
afterEach(() => cleanup());

it("books the trial like the real app: address search, no demo stops", async () => {
  render(<Harness />);
  // Both stops offer the ordinary address search, and the pickup also offers
  // the current location.
  expect(
    await screen.findAllByPlaceholderText("請輸入街道、地點或地標"),
  ).toHaveLength(2);
  expect(screen.getByRole("button", { name: "使用目前位置" })).toBeTruthy();
  expect(screen.queryByText(/示範地點/)).toBeNull();
  expect(screen.queryByLabelText("示範上車地點")).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
});

it("keeps the internal rehearsal's fixed stops and mode switch", async () => {
  context.trial = false;
  render(<Harness />);
  expect(await screen.findByLabelText("示範上車地點")).toBeTruthy();
  expect(screen.getByLabelText("示範下車地點")).toBeTruthy();
  expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(3);
});
