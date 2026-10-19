// @vitest-environment jsdom
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import React, { createElement, type ComponentType } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../../apps/fleet-partner-portal-web/middleware";
import * as proxy from "../../../apps/fleet-partner-portal-web/app/control-plane-proxy/[...path]/route";
import { BootstrapAuthGuard } from "../../../apps/api/src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import type { SupplySubmissionDetail } from "../../../apps/fleet-partner-portal-web/lib/fleet-portal-supply";
import type {
  FleetCaseItem,
  FleetCaseAttachmentRecord,
} from "../../../apps/fleet-partner-portal-web/lib/fleet-portal-data.server";
import * as canvas from "../../../packages/ui-web/src";
import { createUiModuleLoader } from "../system-remediation/sr-wire-001/ui-module-loader";
import {
  fleetDocumentRequest,
  putFleetDocument,
  type FleetDocumentUploadIntent,
} from "../../../apps/fleet-partner-portal-web/lib/fleet-document-upload";
import { createFixture } from "./services";
import { createApiBoundary } from "./http-boundary";

vi.mock("server-only", () => ({}));
const router = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const appRoot = resolve(process.cwd(), "apps/fleet-partner-portal-web");
// The existing loader executes the actual UI and its actual local dependencies
// with the app's own aliases. The root compiler checks this typed test contract;
// the Fleet app typecheck checks the complete production component graph.
const loadFleetUi = createUiModuleLoader(appRoot, {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  "@drts/ui-web": canvas,
  "next/navigation": { useRouter: () => router },
});
const {
  NewDriverSubmissionForm,
  NewVehicleSubmissionForm,
  SupplySubmissionDetailView,
} = loadFleetUi<{
  NewDriverSubmissionForm: ComponentType<{ draftScope: string }>;
  NewVehicleSubmissionForm: ComponentType<{ draftScope: string }>;
  SupplySubmissionDetailView: ComponentType<{
    initialDetail: SupplySubmissionDetail;
    source: "live" | "fallback";
  }>;
}>(resolve(appRoot, "components/fleet-supply-workspace.tsx"));
const { CaseReplyComposer } = loadFleetUi<{
  CaseReplyComposer: ComponentType<{
    caseDetail: FleetCaseItem;
    initialAttachments: FleetCaseAttachmentRecord[];
  }>;
}>(resolve(appRoot, "app/cases/[caseId]/case-reply-composer.tsx"));
const { Reflector } = createRequire(
  resolve(process.cwd(), "apps/api/package.json"),
)("@nestjs/core");
const partner: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "partner_user",
  actorId: "actual-caller-owner",
  realm: "partner",
  tenantId: null,
  partnerId: "fleet-demo-001",
  roles: ["partner"],
  roleFamilies: ["partner"],
  scopes: ["billing:read", "partner:read", "partner:write"],
  requestId: null,
};
const driver = {
  name: "Original Driver",
  mobile: "5550100",
  professionalDriverLicenseNo: "LICENSE-1",
  professionalDriverLicenseExpiry: "2027-12-31",
  taxiDriverRegistrationNo: "TAXI-1",
  taxiDriverRegistrationArea: "TPE",
  taxiDriverRegistrationExpiry: "2027-12-31",
  supportedServiceProductCodes: ["taxi_realtime"],
  preferredVehicleSubmissionId: null,
};
const vehicle = {
  plateNo: "TEST-501",
  licenseType: "taxi",
  brand: "Toyota",
  model: "Sienta",
  modelYear: 2025,
  seatCount: 5,
  luggageCapacity: 2,
  businessArea: "TPE",
  supportedServiceProductCodes: ["taxi_realtime"],
  airportTransferEligible: false,
  fixedFareAllowed: false,
  currentDriverSubmissionId: null,
  doorCount: 4,
  color: "white",
};
let fixture: ReturnType<typeof createFixture>;
let jwt: JwtAuthService;
let apiCalls: Array<{ path: string; headers: Headers; init: RequestInit }>;
let requests: Array<{
  path: string;
  method: string;
  headers: Headers;
  status: number;
}>;
async function usePartner(partnerId = partner.partnerId!) {
  const issued = await jwt.issueSessionToken({ ...partner, partnerId });
  document.cookie = `drts_session=${encodeURIComponent(issued.token)}; path=/`;
  vi.stubEnv("DRTS_FLEET_PARTNER_ID", partnerId);
}
beforeEach(async () => {
  vi.stubEnv("DRTS_ENV", "test");
  vi.stubEnv("JWT_SECRET", "actual-fleet-browser-caller-socket-free-test-key");
  vi.stubEnv("DRTS_API_URL", "https://api.test");
  vi.stubEnv("DRTS_API_AUTH_AUDIENCE", "https://api.test");
  vi.stubEnv("DRTS_FLEET_PORTAL_AUTH_REQUIRED", "");
  fixture = createFixture();
  jwt = new JwtAuthService(new IdentityRepository());
  await usePartner();
  document.cookie = "drts_csrf=existing-csrf; path=/";
  apiCalls = [];
  requests = [];
  const api = createApiBoundary({
    fixture,
    jwt,
    guard: new BootstrapAuthGuard(new Reflector(), jwt),
    calls: apiCalls,
  });
  // Only browser cookie delivery, HTTP dispatch and provider fixtures are adapted.
  // Middleware, proxy, signed session, guard, CurrentIdentity, controllers and
  // Supply/Case command + readback services execute their actual source.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string | URL | Request, init: RequestInit = {}) => {
      if (typeof path !== "string" || !path.startsWith("/control-plane-proxy/"))
        return api(path, init);
      const headers = new Headers(init.headers);
      headers.set("cookie", document.cookie);
      headers.set("origin", "https://portal.test");
      const method = init.method ?? "GET";
      let body = init.body;
      if (body instanceof Blob)
        body = await new Promise<ArrayBuffer>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as ArrayBuffer);
          reader.onerror = () => reject(reader.error);
          reader.readAsArrayBuffer(body as Blob);
        });
      const request = new NextRequest(new URL(path, "https://portal.test"), {
        method,
        headers,
        ...(body ? { body } : {}),
      });
      const allowed = middleware(request);
      const response =
        allowed.status === 200
          ? await (proxy as unknown as Record<string, typeof proxy.GET>)[
              method
            ]!(request, {
              params: Promise.resolve({
                path: path
                  .split("?")[0]!
                  .replace("/control-plane-proxy/", "")
                  .split("/"),
              }),
            })
          : allowed;
      requests.push({ path, method, headers, status: response.status });
      return response;
    }),
  );
  vi.stubEnv("DRTS_ENV", "staging");
});
afterEach(() => {
  cleanup();
  document.cookie = "drts_session=; max-age=0; path=/";
  document.cookie = "drts_csrf=; max-age=0; path=/";
  window.sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it.each([
  ["drivers", "driver", NewDriverSubmissionForm, driver],
  ["vehicles", "vehicle", NewVehicleSubmissionForm, vehicle],
] as const)(
  "real %s create-entry reaches canonical draft and same-submission readback",
  async (subject, kind, Form, draft) => {
    const scope = `actual-${kind}`;
    window.sessionStorage.setItem(
      `supply-draft:v1:${scope}:${kind}`,
      JSON.stringify(draft),
    );
    const { container } = render(createElement(Form, { draftScope: scope }));
    const form = container.querySelector("form")!;
    await waitFor(() =>
      expect(form.querySelector("fieldset")!.disabled).toBe(false),
    );
    fireEvent.submit(form);
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]!.path).toBe(
      `/control-plane-proxy/fleet-partner/supply-submissions/${subject}`,
    );
    expect(requests[0]!.headers.get("x-csrf-token")).toBe("existing-csrf");
    expect(requests[0]!.status).toBe(200);
    await waitFor(() => expect(form.getAttribute("aria-busy")).toBe("false"));
    const drafts = await fixture.supplySubmissionService.listSupplySubmissions(
      partner.partnerId!,
      {},
    );
    expect(drafts).toHaveLength(1);
    const detail = await fleetDocumentRequest<SupplySubmissionDetail>(
      `/api/fleet-partner/supply-submissions/${drafts[0]!.submission.submissionId}`,
    );
    expect(detail.submission.status).toBe("draft");
    expect(detail.submission.fleetPartnerId).toBe(partner.partnerId);
    expect(router.push).toHaveBeenCalledWith(
      `/supply/submissions/${detail.submission.submissionId}`,
    );
    expect(router.refresh).toHaveBeenCalledTimes(1);
  },
);

it("real editable case reply reaches verified actor and authoritative local timeline", async () => {
  await usePartner("METRO_FLEET");
  render(
    createElement(CaseReplyComposer, {
      caseDetail: {
        id: "cmp_0908",
        fleetPartnerId: "METRO_FLEET",
        status: "open",
        responsibility: "fleet",
      } as FleetCaseItem,
      initialAttachments: [],
    }),
  );
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "Existing caller reply" },
  });
  fireEvent.click(screen.getByRole("button", { name: /送出回覆/ }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]!.path).toBe(
    "/control-plane-proxy/fleet-partner/cases/cmp_0908/reply",
  );
  expect(requests[0]!.headers.get("x-csrf-token")).toBe("existing-csrf");
  expect(requests[0]!.status).toBe(200);
  await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
  const timeline = await fixture.controller.getPortalCaseTimeline(
    "METRO_FLEET",
    "cmp_0908",
  );
  expect(
    timeline.data.items.some(
      (entry) =>
        entry.actor === `${partner.actorId} (METRO_FLEET)` &&
        entry.body === "Existing caller reply",
    ),
  ).toBe(true);
});

it("actual document request→PUT bytes/scan→confirm→submit→withdraw keeps one submission and verified actor", async () => {
  const created = await fleetDocumentRequest<SupplySubmissionDetail>(
    "/api/fleet-partner/supply-submissions/drivers",
    { method: "POST", body: JSON.stringify(driver) },
  );
  const id = created.submission.submissionId;
  const root = `/api/fleet-partner/supply-submissions/${id}`;
  let revision = created.submission.revisionNo;
  for (const documentType of [
    "professional_driver_license",
    "taxi_driver_registration",
  ]) {
    const bytes = Buffer.alloc(1024, documentType);
    const file = new File([bytes], `${documentType}.pdf`, {
      type: "application/pdf",
    });
    const intent = await fleetDocumentRequest<
      FleetDocumentUploadIntent & { objectKey: string }
    >(`${root}/documents/upload-url`, {
      method: "POST",
      body: JSON.stringify({
        expectedRevisionNo: revision,
        documentType,
        originalFileName: file.name,
        contentType: file.type,
      }),
    });
    await putFleetDocument(intent, file);
    await fleetDocumentRequest(`${root}/documents/confirm`, {
      method: "POST",
      body: JSON.stringify({
        expectedRevisionNo: revision,
        documentType,
        objectKey: intent.objectKey,
        originalFileName: file.name,
        contentType: file.type,
        fileSize: bytes.length,
        checksumSha256: createHash("sha256").update(bytes).digest("hex"),
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2027-12-31",
      }),
    });
    const detail = await fleetDocumentRequest<SupplySubmissionDetail>(root);
    revision = detail.submission.revisionNo;
    const doc = detail.documents.find(
      (doc) => doc.documentType === documentType,
    )!;
    expect(doc.uploadedBy).toBe(partner.actorId);
    const download = await fetch(
      `/control-plane-proxy/fleet-partner/supply-submissions/${id}/documents/${doc.documentId}/download`,
    );
    expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);
  }
  const initialDetail =
    await fleetDocumentRequest<SupplySubmissionDetail>(root);
  const { container } = render(
    createElement(SupplySubmissionDetailView, {
      initialDetail,
      source: "live",
    }),
  );
  const submit = container.querySelector<HTMLButtonElement>(
    '[data-drt-operation="fleet-submit"]',
  )!;
  await waitFor(() => expect(submit.disabled).toBe(false));
  fireEvent.click(submit);
  await waitFor(async () =>
    expect(
      (
        await fixture.supplySubmissionService.getSupplySubmissionDetail(
          partner.partnerId!,
          id,
        )
      ).submission.status,
    ).toBe("submitted"),
  );
  const submitted = await fleetDocumentRequest<SupplySubmissionDetail>(root);
  expect(submitted.submission.submittedBy).toBe(partner.actorId);
  const withdraw = container.querySelector<HTMLButtonElement>(
    '[data-drt-operation="fleet-withdraw"]',
  )!;
  await waitFor(() => expect(withdraw.disabled).toBe(false));
  fireEvent.click(withdraw);
  await waitFor(async () =>
    expect(
      (
        await fixture.supplySubmissionService.getSupplySubmissionDetail(
          partner.partnerId!,
          id,
        )
      ).submission.status,
    ).toBe("withdrawn"),
  );
  await waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(2));
  for (const request of requests.filter(
    (request) => request.method !== "GET",
  )) {
    expect(request.headers.get("x-csrf-token")).toBe("existing-csrf");
    expect(request.status).toBe(200);
  }
  expect(
    apiCalls
      .filter((call) => call.path.startsWith("/api/fleet-partner/"))
      .every((call) => call.headers.has("x-actor-id") === false),
  ).toBe(true);
});

it("missing CSRF cookie still denies the actual form before any session or command dispatch", async () => {
  document.cookie = "drts_csrf=; max-age=0; path=/";
  const { container } = render(
    createElement(NewDriverSubmissionForm, { draftScope: "missing-cookie" }),
  );
  const form = container.querySelector("form")!;
  await waitFor(() =>
    expect(form.querySelector("fieldset")!.disabled).toBe(false),
  );
  fireEvent.submit(form);
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]!.headers.has("x-csrf-token")).toBe(false);
  expect(requests[0]!.status).toBe(403);
  await waitFor(() => expect(form.getAttribute("aria-busy")).toBe("false"));
  expect(router.push).not.toHaveBeenCalled();
  expect(apiCalls).toEqual([]);
});
