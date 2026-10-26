// @vitest-environment jsdom
import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FleetPartnerDetailPage from "../../apps/platform-admin-web/app/fleet-partners/[fleetPartnerId]/page";
import { ApiClient } from "../../packages/api-client/src";

const state = vi.hoisted(() => ({ client: null as any }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ fleetPartnerId: "fleet-ui-001" }),
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: () => state.client,
  formatDateTime: (s: string) => s,
}));
vi.mock("@/lib/i18n", async () => {
  const { t } = await import("../../apps/platform-admin-web/lib/translations");
  return {
    useTranslation: () => ({
      t: (key: string, params?: Record<string, string | number>) =>
        t(key, "en", params),
      locale: "en",
    }),
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("manager UI -> existing shared SDK mutation -> canonical ACK/readback", () => {
  it("only confirms after server readback and exposes failed/discordant writes", async () => {
    const result = {
      entrySlug: "entry-ui",
      principalId: "human-1",
      membershipId: "membership-1",
      roleCode: "fleet_partner_ops",
      status: "active",
      validTo: null,
    };
    let stored: typeof result | null = null;
    let mismatch = false;
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({
          url,
          method,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (url.includes("human-roles")) {
          if (method === "PUT") {
            stored = result;
            return Response.json({ ok: true, data: result });
          }
          return Response.json({
            ok: true,
            data: mismatch ? [] : stored ? [stored] : [],
            meta: { total: stored ? 1 : 0 },
          });
        }
        if (url.endsWith("/fleet-ui-001"))
          return Response.json({
            ok: true,
            data: {
              fleetPartnerId: "fleet-ui-001",
              legalName: "Unit Fleet",
              displayName: "Unit Fleet",
              businessRegistrationNo: "TEST",
              contactName: "Test",
              contactPhone: "none",
              active: true,
              partnershipType: "fleet_management",
            },
          });
        return Response.json({ ok: true, data: [], meta: { total: 0 } });
      }),
    );
    state.client = new ApiClient({ baseUrl: "https://unit.invalid" });
    render(<FleetPartnerDetailPage />);
    await screen.findByText("Fleet human roles");
    fireEvent.change(screen.getByLabelText("Canonical Fleet entry slug"), {
      target: { value: "entry-ui" },
    });
    fireEvent.change(screen.getByLabelText("Existing linked OIDC subject"), {
      target: { value: "oidc-verified-1" },
    });
    fireEvent.click(screen.getByText("Save human role"));
    await screen.findByRole("status");
    expect(
      calls.find(
        (call) => call.method === "PUT" && call.url.includes("human-roles"),
      )?.body,
    ).toMatchObject({
      entrySlug: "entry-ui",
      partnerUserRef: "oidc-verified-1",
      roleCode: "fleet_partner_ops",
      enabled: true,
    });
    expect(
      calls.filter(
        (call) => call.method === "GET" && call.url.includes("human-roles"),
      ),
    ).toHaveLength(1);
    mismatch = true;
    fireEvent.click(screen.getByText("Save human role"));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    await screen.findByText(/not confirmed by canonical readback/);
  });
});
