import { resolve } from "node:path";
import * as React from "react";
import * as tokens from "@drts/ui-tokens";
import * as contracts from "@drts/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createUiModuleLoader } from "../../../../tests/unit/system-remediation/sr-wire-001/ui-module-loader";

const identity = {
  accessToken: "private-session-token",
  tenantId: "tenant_acme",
  userId: "verified-member",
  roleCodes: ["tenant_admin"],
  scopes: ["tenant:read"],
  displayRole: "bank_ops_viewer",
};
const getIdentity = vi.fn(async () => identity);
const request = vi.fn();
const notFound = vi.fn(() => { throw new Error("NOT_FOUND"); });
function formalOrder(index = 1) {
  return {
    order_id: `ord_${index}`, order_no: `FORMAL-${index}`,
    tenant_id: identity.tenantId, order_domain: "owned",
    service_bucket: "business_dispatch", business_dispatch_subtype: "credit_card_airport_transfer",
    partner_program_id: "program_1", status: "assigned", direction: "dropoff",
    pickup: { address: "Legitimate owner address", masked_address: "City ••••" },
    dropoff: { address: "Airport T2", masked_address: "Airport ••••" },
    passenger: { name: "Private Cardholder", phone: "0912345678" },
    created_at: "2026-10-01T01:00:00Z", updated_at: "2026-10-02T02:00:00Z",
    reservation_window_start: "2026-10-18T03:00:00Z", flight_no: "XY101", terminal: "T2",
    benefit_reference: "BEN-TENANT-0123", issuer_authorization_ref: "AUTH-TENANT-0456",
    approval_state: "approved", notes: null,
  };
}
function envelope(items: unknown[]) { return new Response(JSON.stringify({ data: { items } })); }
function loadPages() {
  const load = createUiModuleLoader(resolve(__dirname, "../.."), {
    "server-only": {}, react: React,
    "@drts/contracts": contracts,
    "@drts/control-plane-auth": {},
    "@drts/ui-tokens": tokens,
    "@drts/ui-web": {
      DataTable: ({children}: {children: React.ReactNode}) => React.createElement("table", null, React.createElement("tbody", null, children)),
      Tr: ({children}: {children: React.ReactNode}) => React.createElement("tr", null, children),
      Td: ({children}: {children: React.ReactNode}) => React.createElement("td", null, children),
      CanvasPill: ({children}: {children: React.ReactNode}) => React.createElement("span", null, children),
    },
    "next/link": { __esModule: true, default: ({children, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => React.createElement("a", props, children) },
    "next/navigation": { notFound },
    "@/lib/bank-user-identity": { getBankUserIdentity: getIdentity },
    "./bank-user-identity": { getBankUserIdentity: getIdentity },
    "@drts/tenant-auth/api-fetch": { resolveTenantApiUrl: () => "https://api.example", tenantAuthFetch: request },
  });
  type Props = { searchParams?: Promise<Record<string, string>>; params: Promise<{ bookingId: string }> };
  return {
    list: load<{default(p: Partial<Props>): Promise<React.ReactElement>}>(resolve(__dirname, "../../app/bookings/page.tsx")).default,
    detail: load<{default(p: Props): Promise<React.ReactElement>}>(resolve(__dirname, "../../app/bookings/[bookingId]/page.tsx")).default,
  };
}
beforeEach(() => {
  vi.clearAllMocks(); getIdentity.mockResolvedValue(identity);
  request.mockImplementation(async (url: string) => envelope(String(url).includes("service-programs") ? [{ program_id: "program_1", tenant_id: identity.tenantId, display_name: "Formal program" }] : [formalOrder()]));
  // Old reader is exercised against the same formal envelopes for before/fixed-after.
  vi.stubGlobal("fetch", request);
});
afterEach(() => vi.unstubAllGlobals());
it("mounted list reads formal wire with verified identity despite foreign display selectors", async () => {
  const html = renderToStaticMarkup(await loadPages().list({ searchParams: Promise.resolve({bank: "contoso", role: "bank_program_admin", locale: "en"}) }));
  expect(getIdentity).toHaveBeenCalledOnce();
  expect(html).toContain("FORMAL-1"); expect(html).toContain("Formal program");
  expect(html).toContain("City ••••"); expect(html).not.toContain("Legitimate owner address");
  expect(html).not.toContain(identity.accessToken); expect(html).not.toContain("0912345678");
  expect(html).not.toContain("Private Cardholder");
  expect(request.mock.calls.every(([, init]) => init.headers.Authorization === `Bearer ${identity.accessToken}` && init.headers["x-tenant-id"] === identity.tenantId)).toBe(true);
});
it("mounted pages deny expired/revoked identity without requesting orders or claiming not-found", async () => {
  getIdentity.mockRejectedValue(new Error("expired"));
  const pages = loadPages();
  const html = renderToStaticMarkup(await pages.list({}));
  const detail = renderToStaticMarkup(await pages.detail({params: Promise.resolve({bookingId: "ord_1"})}));
  expect(request).not.toHaveBeenCalled(); expect(notFound).not.toHaveBeenCalled();
  expect(html).toContain('role="alert"'); expect(detail).toContain('role="alert"');
});
it("mounted detail distinguishes upstream outage from authoritative missing", async () => {
  request.mockResolvedValue(new Response("private error", {status: 503}));
  const pages = loadPages();
  expect(renderToStaticMarkup(await pages.detail({params: Promise.resolve({bookingId: "ord_1"})}))).toContain('role="alert"');
  expect(notFound).not.toHaveBeenCalled();
});
it("mounted list pages the full filtered dataset and preserves filters on navigation and detail return", async () => {
  request.mockImplementation(async (url: string) => envelope(String(url).includes("service-programs") ? [] : Array.from({length: 61}, (_, i) => formalOrder(i + 1))));
  const pages = loadPages();
  const search = {locale: "en", program: "program_1", direction: "outbound", state: "assigned", period: "2026-10", cardholder: "09", page: "2"};
  const html = renderToStaticMarkup(await pages.list({searchParams: Promise.resolve(search)}));
  expect(html).toContain("FORMAL-26</a>"); expect(html).toContain("FORMAL-50</a>");
  expect(html).not.toContain("FORMAL-1</a>"); expect(html).not.toContain("FORMAL-51</a>");
  expect(html).toContain("page=3"); expect(html).toContain("cardholder=09");
  const detail = renderToStaticMarkup(await pages.detail({params: Promise.resolve({bookingId: "ord_26"}), searchParams: Promise.resolve(search)}));
  expect(detail).toContain("FORMAL-26"); expect(detail).toContain("page=2"); expect(detail).toContain("program=program_1");
});
