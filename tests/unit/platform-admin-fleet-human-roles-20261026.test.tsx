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

function fleetPartnerDetailResponse() {
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
}

// FLEET-ONB-008: Fleet staff invitation issue/list/revoke/resend and member
// deactivation, SA/SD §2/§8. Coordinated into this existing manager test
// file and apps/platform-admin-web/lib/translations.ts; see
// original008-existing-admin-translations-single-path-scope-coordination-proposal.json.
describe("manager UI -> Fleet staff invitation issue/list/revoke/resend and member deactivation", () => {
  it("resolves the new invitation keys in both locales without leftover placeholders", () => {
    for (const key of [
      "title",
      "subtitle",
      "form.email",
      "form.role",
      "form.validTo",
      "issue",
      "sent",
      "notDelivered",
      "col.email",
      "col.role",
      "col.status",
      "col.expiresAt",
      "status.invited",
      "status.accepted",
      "status.revoked",
      "revoke",
      "resend",
      "empty",
      "membersCol.principal",
      "membersCol.role",
      "membersCol.status",
      "membersCol.validTo",
      "disableAction",
      "memberDisabled",
      "membersEmpty",
    ]) {
      const fullKey = `fleetPartners.invitations.${key}`;
      for (const locale of ["en", "zh"] as const) {
        const value = t(fullKey, locale, {
          email: "staff@example.com",
          principal: "human-1",
        });
        expect(value).not.toBe(fullKey);
        expect(value).not.toMatch(/\{(?:email|principal)\}/);
      }
    }
  });

  it("issues an invitation and lists it as invited using the real wire contract", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const invitation = {
      invitationId: "invitation-1",
      membershipId: "membership-1",
      fleetPartnerId: "fleet-ui-001",
      entrySlug: "entry-ui",
      email: "new-staff@example.com",
      roleCode: "fleet_partner_ops",
      deliveryStatus: "delivered",
      expiresAt: "2027-02-01T00:00:00.000Z",
      acceptedAt: null,
      revokedAt: null,
      createdAt: "2027-01-01T00:00:00.000Z",
    };
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
        if (url.endsWith("/fleet-ui-001")) return fleetPartnerDetailResponse();
        if (url.includes("/human-roles")) return Response.json({ data: [] });
        if (
          method === "POST" &&
          url.includes("/invitations") &&
          !url.includes("/revoke")
        ) {
          return Response.json({
            data: {
              invitation,
              member: {
                membershipId: "membership-1",
                principalId: "principal-1",
                fleetPartnerId: "fleet-ui-001",
                entrySlug: "entry-ui",
                email: invitation.email,
                displayName: null,
                status: "invited",
                roleCode: "fleet_partner_ops",
                validTo: null,
                createdAt: invitation.createdAt,
                updatedAt: invitation.createdAt,
              },
              deliveryOutcome: "sent",
            },
          });
        }
        if (method === "GET" && url.includes("/invitations")) {
          return Response.json({ data: [] });
        }
        return Response.json({ data: [], meta: { total: 0 } });
      }),
    );
    state.client = new ApiClient({ baseUrl: "https://unit.invalid" });
    render(<FleetPartnerDetailPage />);
    await screen.findByText("Fleet Staff Invitations");
    fireEvent.change(screen.getByLabelText("Fleet entry slug"), {
      target: { value: "entry-ui" },
    });
    fireEvent.change(screen.getByLabelText("Invitee email"), {
      target: { value: invitation.email },
    });
    fireEvent.click(screen.getByText("Issue invitation"));
    await screen.findByText(`Invitation sent to ${invitation.email}.`);
    expect(
      calls.find(
        (call) =>
          call.method === "POST" &&
          call.url.endsWith(
            "/api/admin/fleet-partners/fleet-ui-001/invitations",
          ),
      )?.body,
    ).toMatchObject({
      entrySlug: "entry-ui",
      email: invitation.email,
      roleCode: "fleet_partner_ops",
    });
    expect(screen.getByText(invitation.email)).toBeTruthy();
    expect(screen.getByText("Invited (pending)")).toBeTruthy();
  });

  it("resend revokes first then re-issues preserving email/role; a failed re-issue leaves the revoked row and an error, never a false sent", async () => {
    let reissueShouldFail = true;
    const existingInvitation = {
      invitationId: "invitation-old",
      membershipId: "membership-old",
      fleetPartnerId: "fleet-ui-001",
      entrySlug: "entry-ui",
      email: "resend-me@example.com",
      roleCode: "fleet_partner_finance",
      deliveryStatus: "delivered",
      expiresAt: "2027-02-01T00:00:00.000Z",
      acceptedAt: null,
      revokedAt: null,
      createdAt: "2027-01-01T00:00:00.000Z",
    };
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (url.endsWith("/fleet-ui-001")) return fleetPartnerDetailResponse();
        if (url.includes("/human-roles")) return Response.json({ data: [] });
        if (method === "POST" && url.includes("/revoke")) {
          return Response.json({
            data: {
              ...existingInvitation,
              revokedAt: "2027-01-05T00:00:00.000Z",
            },
          });
        }
        if (
          method === "POST" &&
          url.includes("/invitations") &&
          !url.includes("/revoke")
        ) {
          if (reissueShouldFail) {
            return Response.json(
              {
                error: {
                  code: "FLEET_INVITE_DELIVERY_UNAVAILABLE",
                  message: "Delivery is unavailable.",
                  retryable: true,
                  trace_id: "trace-resend-1",
                },
              },
              { status: 503 },
            );
          }
          return Response.json({
            data: {
              invitation: {
                ...existingInvitation,
                invitationId: "invitation-new",
                revokedAt: null,
              },
              member: {
                membershipId: "membership-old",
                principalId: "principal-old",
                fleetPartnerId: "fleet-ui-001",
                entrySlug: "entry-ui",
                email: existingInvitation.email,
                displayName: null,
                status: "invited",
                roleCode: existingInvitation.roleCode,
                validTo: null,
                createdAt: existingInvitation.createdAt,
                updatedAt: existingInvitation.createdAt,
              },
              deliveryOutcome: "sent",
            },
          });
        }
        if (method === "GET" && url.includes("/invitations")) {
          return Response.json({ data: [existingInvitation] });
        }
        return Response.json({ data: [], meta: { total: 0 } });
      }),
    );
    state.client = new ApiClient({ baseUrl: "https://unit.invalid" });
    render(<FleetPartnerDetailPage />);
    await screen.findByText("Fleet Staff Invitations");
    fireEvent.change(screen.getByLabelText("Fleet entry slug"), {
      target: { value: "entry-ui" },
    });
    fireEvent.click(screen.getByText("Read assignments"));
    await screen.findByText(existingInvitation.email);

    fireEvent.click(screen.getByText("Resend"));
    await screen.findByText("Revoked");
    await screen.findByText(/unavailable/);
    expect(
      calls.some(
        (call) => call.method === "POST" && call.url.includes("/revoke"),
      ),
    ).toBe(true);
    expect(screen.queryByText(/Invitation sent/)).toBeNull();

    reissueShouldFail = false;
    fireEvent.click(screen.getByText("Resend"));
    await screen.findByText(`Invitation sent to ${existingInvitation.email}.`);
  });

  it("disables an active member through the dedicated deactivate endpoint and reflects the readback status", async () => {
    const activeMember = {
      entrySlug: "entry-ui",
      principalId: "human-active-1",
      membershipId: "membership-active-1",
      roleCode: "fleet_partner_ops",
      status: "active",
      validTo: null,
    };
    const calls: Array<{ url: string; method: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        if (url.endsWith("/fleet-ui-001")) return fleetPartnerDetailResponse();
        if (method === "POST" && url.includes("/deactivate")) {
          return Response.json({
            data: {
              membershipId: activeMember.membershipId,
              principalId: activeMember.principalId,
              fleetPartnerId: "fleet-ui-001",
              entrySlug: "entry-ui",
              email: null,
              displayName: null,
              status: "disabled",
              roleCode: activeMember.roleCode,
              validTo: null,
              createdAt: "2027-01-01T00:00:00.000Z",
              updatedAt: "2027-01-06T00:00:00.000Z",
            },
          });
        }
        if (method === "GET" && url.includes("/human-roles")) {
          return Response.json({ data: [activeMember] });
        }
        if (method === "GET" && url.includes("/invitations")) {
          return Response.json({ data: [] });
        }
        return Response.json({ data: [], meta: { total: 0 } });
      }),
    );
    state.client = new ApiClient({ baseUrl: "https://unit.invalid" });
    render(<FleetPartnerDetailPage />);
    await screen.findByText("Fleet Staff Invitations");
    fireEvent.change(screen.getByLabelText("Fleet entry slug"), {
      target: { value: "entry-ui" },
    });
    fireEvent.click(screen.getByText("Read assignments"));
    await screen.findByText("human-active-1");

    fireEvent.click(screen.getByText("Disable member"));
    await screen.findByText(
      `Membership for principal ${activeMember.principalId} has been disabled.`,
    );
    expect(
      calls.some(
        (call) =>
          call.method === "POST" &&
          call.url.includes(
            `/members/${activeMember.membershipId}/deactivate`,
          ) &&
          call.url.includes("entrySlug=entry-ui"),
      ),
    ).toBe(true);
    const disabledStatusBadges = screen
      .getAllByText("Disabled")
      .filter((el) => el.tagName !== "OPTION");
    expect(disabledStatusBadges).toHaveLength(1);
    expect(screen.queryByText("Disable member")).toBeNull();
  });
});
