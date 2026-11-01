// @vitest-environment jsdom
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FleetPartnerDetailPage from "../../apps/platform-admin-web/app/fleet-partners/[fleetPartnerId]/page";
import { ApiClient } from "../../packages/api-client/src";
import { t } from "../../apps/platform-admin-web/lib/translations";

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
  it("resolves displayed controls and readback/error messages in both locales", () => {
    for (const key of [
      "title",
      "subtitle",
      "entrySlug",
      "subject",
      "role",
      "admin",
      "ops",
      "finance",
      "expiry",
      "state",
      "disabled",
      "read",
      "save",
      "until",
      "confirmed",
      "readbackMismatch",
    ]) {
      const fullKey = `fleetPartners.humanRoles.${key}`;
      for (const locale of ["en", "zh-TW"] as const) {
        const value = t(fullKey, locale, {
          date: "2027-01-01",
          role: "fleet_partner_ops",
          status: "active",
          principal: "human-1",
        });
        expect(value).not.toBe(fullKey);
        expect(value).not.toMatch(/\{(?:date|role|status|principal)\}/);
      }
    }
  });
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
    await screen.findByText("Managed Fleet Staff Roles");
    fireEvent.change(screen.getByLabelText("Fleet entry slug"), {
      target: { value: "entry-ui" },
    });
    fireEvent.change(screen.getByLabelText("Linked staff subject"), {
      target: { value: "oidc-verified-1" },
    });
    fireEvent.click(screen.getByText("Save assignment"));
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
    fireEvent.click(screen.getByText("Save assignment"));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    await screen.findByText(/did not match the saved change/);
  });

  it("never lets a pre-save read replace the confirmed assignment after the mutation readback", async () => {
    const saved = {
      entrySlug: "entry-ui",
      principalId: "human-1",
      membershipId: "membership-1",
      roleCode: "fleet_partner_ops",
      status: "active",
      validTo: null,
    };
    let releaseOldRead!: (response: Response) => void;
    const oldRead = new Promise<Response>((resolve) => {
      releaseOldRead = resolve;
    });
    let readCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("human-roles")) {
          if (init?.method === "PUT") {
            return Response.json({ data: saved });
          }
          readCount++;
          return readCount === 1
            ? oldRead
            : Response.json({ data: { items: [saved] } });
        }
        if (url.endsWith("/fleet-ui-001")) {
          return Response.json({
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
        }
        return Response.json({ data: { items: [] } });
      }),
    );
    state.client = new ApiClient({ baseUrl: "https://unit.invalid" });
    render(<FleetPartnerDetailPage />);
    await screen.findByText("Managed Fleet Staff Roles");
    fireEvent.change(screen.getByLabelText("Fleet entry slug"), {
      target: { value: "entry-ui" },
    });
    fireEvent.click(screen.getByText("Read assignments"));
    await waitFor(() => expect(readCount).toBe(1));
    fireEvent.change(screen.getByLabelText("Linked staff subject"), {
      target: { value: "oidc-verified-1" },
    });
    fireEvent.click(screen.getByText("Save assignment"));
    await screen.findByText("human-1: fleet_partner_ops / active");
    expect(screen.getByRole("status").textContent).toContain(
      "readback confirmed",
    );
    expect(readCount).toBe(2);
    await act(async () => {
      releaseOldRead(
        Response.json({
          data: { items: [{ ...saved, roleCode: "fleet_partner_admin" }] },
        }),
      );
    });
    expect(
      screen.getByText("human-1: fleet_partner_ops / active"),
    ).toBeTruthy();
    expect(
      screen.queryByText("human-1: fleet_partner_admin / active"),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "readback confirmed",
    );
  });
});
