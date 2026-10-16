// @vitest-environment jsdom
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as contracts from "../../../packages/contracts/src/index";
import * as canvas from "../../../packages/ui-web/src/index";
import type * as BookingModule from "../../../apps/tenant-console-web/app/bookings/page";
import type * as InvoiceModule from "../../../apps/tenant-console-web/app/invoices/page";
import type * as BillingModule from "../../../apps/tenant-console-web/app/billing/page";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";

const instant = "2026-12-31T16:05:00Z";
const booking = {
  bookingId: "booking-c121",
  orderId: "order-c121",
  tenantId: "tenant-c121",
  partnerId: null,
  partnerProgramId: null,
  partnerEntrySlug: null,
  eligibilityVerificationId: null,
  issuerAuthorizationRef: null,
  passengerDisclosure: null,
  status: "active",
  serviceBucket: "business_dispatch",
  businessDispatchSubtype: "enterprise_dispatch",
  bookingType: "oneway",
  reservationWindowStart: instant,
  reservationWindowEnd: "2026-12-31T17:05:00Z",
  recurrenceRule: null,
  modifiableUntil: null,
  cancelableUntil: null,
  pickup: { address: "Sample pickup", latitude: 25, longitude: 121 },
  dropoff: { address: "Sample dropoff", latitude: 25.1, longitude: 121.1 },
  passenger: {
    name: "Example Rider",
    phone: "0900000000",
    email: "rider@example.test",
  },
  bookedBy: null,
  onsiteContact: null,
  costCenter: null,
  vehiclePreference: null,
  benefitReference: null,
  direction: null,
  flightNo: null,
  terminal: null,
  luggageCount: null,
  notes: null,
  quotedFare: { currency: "TWD", amountMinor: 12345 },
  quotedFareSource: null,
  quotedFareRuleVersion: null,
  manualFareOverride: null,
  approvalState: "not_required",
  approvalRequestIds: [],
  orderStatus: "completed",
  createdAt: instant,
  updatedAt: instant,
};
const invoice = {
  invoiceId: "invoice-c121",
  tenantId: "tenant-c121",
  periodStart: "2026-12-01",
  periodEnd: "2026-12-31",
  amount: { currency: "TWD", amountMinor: 12345 },
  status: "issued",
  artifactUrl: null,
  pricingVersionSnapshot: "pricing-c121",
  lines: [],
  createdAt: instant,
  updatedAt: instant,
  availableActions: [],
  deepLinks: [],
};
const profile = {
  tenantId: "tenant-c121",
  invoiceTitle: "Example Transit",
  taxId: null,
  address: null,
  contactName: null,
  email: "billing@example.test",
  updatedAt: instant,
};
const appRoot = resolve(process.env.C121_APP_ROOT ?? "apps/tenant-console-web");
afterEach(cleanup);

describe(`C121 actual page readbacks (host TZ=${process.env.TZ})`, () => {
  it.each(["en", "zh"] as const)(
    "renders Booking, Billing and Invoice canonical dates in %s",
    async (locale) => {
      // Only server resource/auth and framework boundaries are simulated. Pages,
      // row renderers, formatters, catalogs and the profile editor execute unchanged.
      const api = {
        getTenantClient: async () => ({
          listTenantBookings: async () => [structuredClone(booking)],
          getBillingProfile: async () => structuredClone(profile),
          listInvoices: async () => [structuredClone(invoice)],
          listTenantStatements: async () => [],
          getTenantQuotaSummary: async () => null,
          listInvoicesRuntime: async () => ({
            items: [structuredClone(invoice)],
            refresh: {
              generatedAt: instant,
              staleAfterMs: 30000,
              dataFreshness: "fresh",
              source: "live",
            },
            emptyState: null,
          }),
        }),
      };
      const serverLocale = { getServerLocale: async () => locale };
      const load = createUiModuleLoader(appRoot, {
        react: React,
        "react/jsx-runtime": jsxRuntime,
        "@drts/ui-web": canvas,
        "@drts/contracts": contracts,
        "next/navigation": { useRouter: () => ({ refresh() {} }) },
        "next/cache": { revalidatePath() {} },
        "./mail-actions": {
          readInvoiceMail: async () => ({ ok: false }),
          sendInvoiceMail: async () => ({ ok: false }),
        },
        "next/link": ({ children, ...props }: React.ComponentProps<"a">) => (
          <a {...props}>{children}</a>
        ),
        "@/lib/api-client": api,
        "../../lib/api-client": api,
        "@/lib/server-locale": serverLocale,
        "../../lib/server-locale": serverLocale,
      });
      const Bookings = load<typeof BookingModule>(
        resolve(appRoot, "app/bookings/page.tsx"),
      ).default;
      const Billing = load<typeof BillingModule>(
        resolve(appRoot, "app/billing/page.tsx"),
      ).default;
      const Invoices = load<typeof InvoiceModule>(
        resolve(appRoot, "app/invoices/page.tsx"),
      ).default;
      render(await Bookings({ searchParams: Promise.resolve({}) }));
      expect(
        screen.getByText(
          locale === "en" ? "Jan 1, 2027, 12:05 AM" : "2027年1月1日 凌晨12:05",
        ),
      ).toBeTruthy();
      expect(
        document.querySelector('a[href="/bookings/booking-c121"]'),
      ).toBeTruthy();
      cleanup();
      render(await Billing({}));
      expect(screen.getAllByText("2026-12-31").length).toBeGreaterThan(0);
      expect(
        screen.getByText(
          locale === "en" ? "Jan 1, 2027, 12:05 AM" : "2027年1月1日 凌晨12:05",
        ),
      ).toBeTruthy();
      cleanup();
      render(
        await Invoices({
          searchParams: Promise.resolve({ invoiceId: invoice.invoiceId }),
        }),
      );
      expect(screen.getAllByText("2027-01-01").length).toBeGreaterThan(0);
      expect(screen.getAllByText("2027-01-14").length).toBeGreaterThan(0);
      expect(document.body.textContent).toContain("2026-12");
      // Original fixtures remain canonical and their IDs/days are not rewritten.
      expect(invoice.createdAt).toBe(instant);
      expect(invoice.periodEnd).toBe("2026-12-31");
      expect(booking.reservationWindowStart).toBe(instant);
    },
  );
});
