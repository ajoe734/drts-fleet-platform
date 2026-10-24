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
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
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

it("real SupplySubmissionDetailView staged retry/resume reuses the same intent on scanner 503, resumes confirm without re-PUT, and reconciles consumed-intent confirm via canonical GET readback", async () => {
  const created = await fleetDocumentRequest<SupplySubmissionDetail>(
    "/api/fleet-partner/supply-submissions/drivers",
    { method: "POST", body: JSON.stringify(driver) },
  );
  const id = created.submission.submissionId;
  const root = `/api/fleet-partner/supply-submissions/${id}`;
  apiCalls.length = 0;
  requests.length = 0;

  const { container, rerender } = render(
    createElement(SupplySubmissionDetailView, {
      initialDetail: created,
      source: "live",
    }),
  );
  const uploadButton = screen.getByRole("button", {
    name: /建立 upload intent 並確認|Create upload intent and confirm/,
  });
  await waitFor(() =>
    expect((uploadButton as HTMLButtonElement).disabled).toBe(false),
  );

  const storageInternal = fixture.storage as unknown as {
    scannerFactory: (...args: unknown[]) => {
      availability: () => { state: string };
      scan: (...scanArgs: unknown[]) => Promise<{ scanState: string }>;
    };
  };
  const realScannerFactory = storageInternal.scannerFactory.bind(
    fixture.storage,
  );

  // Stage 1a: Selecting a different File (even with identical name and byte length) after scanner 503
  // must invalidate the previous intent and request a fresh upload-url instead of hitting 409 DOCUMENT_CONTENT_MISMATCH.
  let scannerFailuresRemaining = 2;
  storageInternal.scannerFactory = (...args: unknown[]) => {
    const scanner = realScannerFactory(...args);
    return {
      availability: () => scanner.availability(),
      scan: async (...scanArgs: unknown[]) => {
        if (scannerFailuresRemaining > 0) {
          scannerFailuresRemaining -= 1;
          throw new Error("ClamAV daemon transiently unavailable");
        }
        return scanner.scan(...scanArgs);
      },
    };
  };

  const staleLicenseFile = new File(
    [Buffer.from("driver-license-staged-retry-v001")],
    "driver-license.pdf",
    { type: "application/pdf" },
  );
  const licenseBytes = Buffer.from("driver-license-staged-retry-v002");
  const licenseFile = new File([licenseBytes], "driver-license.pdf", {
    type: "application/pdf",
  });
  const fileInput =
    container.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(fileInput, { target: { files: [staleLicenseFile] } });
  fireEvent.click(uploadButton);

  await waitFor(() =>
    expect(
      screen.getByText(/Document scanning is unavailable|scanner/i),
    ).toBeTruthy(),
  );
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/upload-url")),
  ).toHaveLength(1);

  // Replace with same-name, same-byte-length File and click upload: must create a new intent (2nd upload-url), which also hits scanner 503 once.
  fireEvent.change(fileInput, { target: { files: [licenseFile] } });
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      apiCalls.filter((call) => call.path.endsWith("/documents/upload-url")),
    ).toHaveLength(2),
  );
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/content")),
  ).toHaveLength(2);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(0);

  // Stage 1b: Explicit retry with the SAME licenseFile reuses intent #2 (still 2 upload-url calls),
  // completes PUT scan, and hits a pre-persistence confirm 503 failure.
  const realConfirm = fixture.supplyDocumentService.confirmUpload.bind(
    fixture.supplyDocumentService,
  );
  const confirmSpy = vi
    .spyOn(fixture.supplyDocumentService, "confirmUpload")
    .mockRejectedValueOnce(
      new ApiRequestError(
        503,
        "CONFIRM_PRE_COMMIT_UNAVAILABLE",
        "Confirm transiently unavailable before commit.",
      ),
    );

  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      screen.getByText(/Confirm transiently unavailable before commit/i),
    ).toBeTruthy(),
  );
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/upload-url")),
  ).toHaveLength(2);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/content")),
  ).toHaveLength(3);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(1);

  // Stage 1c: Retry after PUT succeeded checks canonical GET first (not yet persisted),
  // resumes ONLY confirm (no re-PUT, no new upload-url), and when post-confirm GET refresh fails once,
  // does not falsely display success until retry reconciles from canonical GET.
  const realGetDetail =
    fixture.supplySubmissionService.getSupplySubmissionDetail.bind(
      fixture.supplySubmissionService,
    );
  let getDetailCallCount = 0;
  const getDetailSpy = vi
    .spyOn(fixture.supplySubmissionService, "getSupplySubmissionDetail")
    .mockImplementation(async (...args) => {
      getDetailCallCount += 1;
      if (getDetailCallCount === 2) {
        throw new ApiRequestError(
          503,
          "READBACK_REFRESH_UNAVAILABLE",
          "Canonical detail readback transiently unavailable after confirm.",
        );
      }
      return realGetDetail(...args);
    });

  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      screen.getByText(
        /Canonical detail readback transiently unavailable after confirm/i,
      ),
    ).toBeTruthy(),
  );
  expect(screen.queryByText("driver-license.pdf")).toBeNull();
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/upload-url")),
  ).toHaveLength(2);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/content")),
  ).toHaveLength(3);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(2);

  // Retry after confirm_completed: only calls canonical GET readback (0 extra upload-url, PUT, or confirm).
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(screen.getAllByText("driver-license.pdf").length).toBeGreaterThan(0),
  );
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/upload-url")),
  ).toHaveLength(2);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/content")),
  ).toHaveLength(3);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(2);
  getDetailSpy.mockRestore();

  // Stage 2: Second document PUT succeeds, confirm persists on server & consumes intent,
  // but confirm response is lost (503). Retry must first read canonical GET detail,
  // match documents.fileObjectKey === intent.objectKey, and reconcile without re-calling confirm or upload-url.
  apiCalls.length = 0;
  const typeSelect = container.querySelector<HTMLSelectElement>("select")!;
  fireEvent.change(typeSelect, {
    target: { value: "taxi_driver_registration" },
  });
  const taxiBytes = Buffer.from("taxi-registration-consumed-intent-bytes");
  const taxiFile = new File([taxiBytes], "taxi-reg.pdf", {
    type: "application/pdf",
  });
  fireEvent.change(fileInput, { target: { files: [taxiFile] } });

  confirmSpy.mockImplementationOnce(async (...args) => {
    await realConfirm(...args);
    throw new ApiRequestError(
      503,
      "CONFIRM_RESPONSE_LOST",
      "Confirm response lost after Supply intent consumption.",
    );
  });

  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(screen.getByText(/Confirm response lost/i)).toBeTruthy(),
  );
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/upload-url")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/content")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(1);

  // Explicit user retry 1 after CONFIRM_RESPONSE_LOST: when canonical GET itself transiently fails with 503,
  // the session must be retained (not dropped) and the 503 readback error must surface explicitly.
  const getDetailAfterLostAckSpy = vi
    .spyOn(fixture.supplySubmissionService, "getSupplySubmissionDetail")
    .mockRejectedValueOnce(
      new ApiRequestError(
        503,
        "CANONICAL_READBACK_UNAVAILABLE",
        "Supply detail GET transiently unavailable after lost confirm ACK.",
      ),
    );
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      screen.getByText(
        /Supply detail GET transiently unavailable after lost confirm ACK/i,
      ),
    ).toBeTruthy(),
  );
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/upload-url")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/content")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(1);

  // Explicit user retry 2: checks GET /api/fleet-partner/supply-submissions/:id first,
  // discovers taxi-reg.pdf via fileObjectKey, and completes without a second confirm (which would 409 UPLOAD_URL_INVALID) or second upload-url.
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(screen.getAllByText("taxi-reg.pdf").length).toBeGreaterThan(0),
  );
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/upload-url")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/content")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(1);
  getDetailAfterLostAckSpy.mockRestore();
  confirmSpy.mockRestore();

  const finalDetail = await fleetDocumentRequest<SupplySubmissionDetail>(root);
  expect(finalDetail.documents).toHaveLength(2);

  // Stage 3: Changing docType, clearing file, or replacing File while PUT is still in-flight (deferred)
  // immediately resets busy="upload" so the real ActionButton is clickable again, and resolving the stale PUT
  // neither fires confirm for the abandoned operation nor clears the busy state of a newer in-flight operation.
  apiCalls.length = 0;
  const realUploadContent = fixture.supplyDocumentService.uploadContent.bind(
    fixture.supplyDocumentService,
  );
  let releaseAbandonedPut!: () => void;
  let releaseReplacementPut!: () => void;
  const uploadContentSpy = vi
    .spyOn(fixture.supplyDocumentService, "uploadContent")
    .mockImplementationOnce(
      async (...args) =>
        new Promise((resolve, reject) => {
          releaseAbandonedPut = () => {
            realUploadContent(...args).then(resolve, reject);
          };
        }),
    )
    .mockImplementationOnce(
      async (...args) =>
        new Promise((resolve, reject) => {
          releaseReplacementPut = () => {
            realUploadContent(...args).then(resolve, reject);
          };
        }),
    );

  const abandonedFile = new File(
    [Buffer.from("abandoned-in-flight-put-bytes")],
    "abandoned-id.pdf",
    { type: "application/pdf" },
  );
  fireEvent.change(fileInput, { target: { files: [abandonedFile] } });
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      apiCalls.filter((call) => call.path.endsWith("/documents/content")),
    ).toHaveLength(1),
  );
  expect((uploadButton as HTMLButtonElement).disabled).toBe(true);

  // Clear file selection and change docType while the first PUT is still pending.
  fireEvent.change(fileInput, { target: { files: [] } });
  expect((uploadButton as HTMLButtonElement).disabled).toBe(false);
  fireEvent.change(typeSelect, { target: { value: "driver_national_id" } });
  expect((uploadButton as HTMLButtonElement).disabled).toBe(false);
  const replacementFile = new File(
    [Buffer.from("replacement-national-id-bytes")],
    "replacement-id.pdf",
    { type: "application/pdf" },
  );
  fireEvent.change(fileInput, { target: { files: [replacementFile] } });
  expect((uploadButton as HTMLButtonElement).disabled).toBe(false);

  // Start the second upload (deferred PUT #2) BEFORE resolving the stale PUT #1.
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      apiCalls.filter((call) => call.path.endsWith("/documents/content")),
    ).toHaveLength(2),
  );
  expect((uploadButton as HTMLButtonElement).disabled).toBe(true);

  // Resolve the stale in-flight PUT #1 while PUT #2 is still in-flight:
  // PUT #1 must not confirm the abandoned file AND must not clear PUT #2's busy state.
  releaseAbandonedPut();
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(0);
  expect((uploadButton as HTMLButtonElement).disabled).toBe(true);

  // Now resolve PUT #2: replacement-id.pdf completes end-to-end and confirms once.
  releaseReplacementPut();
  await waitFor(() =>
    expect(screen.getAllByText("replacement-id.pdf").length).toBeGreaterThan(0),
  );
  expect(screen.queryByText("abandoned-id.pdf")).toBeNull();
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(1);
  expect((uploadButton as HTMLButtonElement).disabled).toBe(false);

  // Stage 4: Rerendering the SAME mounted SupplySubmissionDetailView instance from submission A to submission B
  // while submission A has an in-flight PUT stops A before confirm, resets busy, and preserves B's state.
  const createdB = await fleetDocumentRequest<SupplySubmissionDetail>(
    "/api/fleet-partner/supply-submissions/drivers",
    {
      method: "POST",
      body: JSON.stringify({
        ...driver,
        name: "Second Submission Driver",
        professionalDriverLicenseNo: "LICENSE-2",
        taxiDriverRegistrationNo: "TAXI-2",
      }),
    },
  );
  const idB = createdB.submission.submissionId;
  apiCalls.length = 0;

  let releaseSubmissionAPut!: () => void;
  uploadContentSpy.mockImplementationOnce(
    async (...args) =>
      new Promise((resolve, reject) => {
        releaseSubmissionAPut = () => {
          realUploadContent(...args).then(resolve, reject);
        };
      }),
  );

  const staleSubmissionAFile = new File(
    [Buffer.from("stale-submission-a-inflight-bytes")],
    "stale-sub-a.pdf",
    { type: "application/pdf" },
  );
  fireEvent.change(fileInput, { target: { files: [staleSubmissionAFile] } });
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      apiCalls.filter((call) => call.path.endsWith("/documents/content")),
    ).toHaveLength(1),
  );
  expect((uploadButton as HTMLButtonElement).disabled).toBe(true);

  // Rerender the SAME component instance with createdB while A's PUT is still unresolved.
  rerender(
    createElement(SupplySubmissionDetailView, {
      initialDetail: createdB,
      source: "live",
    }),
  );
  expect(screen.getByText(new RegExp(idB))).toBeTruthy();
  expect((uploadButton as HTMLButtonElement).disabled).toBe(false);

  // Release A's PUT: must not confirm A or overwrite B's detail view.
  releaseSubmissionAPut();
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(0);
  expect(screen.getByText(new RegExp(idB))).toBeTruthy();
  expect(screen.queryByText("replacement-id.pdf")).toBeNull();

  // Upload a document on B in the same instance while A's held canonical GET (both noneditable and editable with different revision)
  // resolves mid-flight: neither may cancel B's confirm nor overwrite B's expectedRevisionNo.
  const subAForHeldGet =
    await fleetDocumentRequest<SupplySubmissionDetail>(root);
  apiCalls.length = 0;
  rerender(
    createElement(SupplySubmissionDetailView, {
      initialDetail: subAForHeldGet,
      source: "live",
    }),
  );
  const heldGetConfirmSpy = vi
    .spyOn(fixture.supplyDocumentService, "confirmUpload")
    .mockRejectedValueOnce(
      new ApiRequestError(
        503,
        "CONFIRM_PRE_COMMIT_UNAVAILABLE",
        "Submission A confirm transiently unavailable before held GET.",
      ),
    );
  const subAHeldGetFile = new File(
    [Buffer.from("submission-a-held-get-bytes")],
    "sub-a-held-get.pdf",
    { type: "application/pdf" },
  );
  fireEvent.change(fileInput, { target: { files: [subAHeldGetFile] } });
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      screen.getByText(
        /Submission A confirm transiently unavailable before held GET/i,
      ),
    ).toBeTruthy(),
  );
  let resolveHeldAGet!: (detail: SupplySubmissionDetail) => void;
  let resolveHeldADraftGet!: (detail: SupplySubmissionDetail) => void;
  const heldGetDetailSpy = vi
    .spyOn(fixture.supplySubmissionService, "getSupplySubmissionDetail")
    .mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          resolveHeldAGet = (detail) => resolve(detail as never);
        }),
    );
  // Click retry on A so A's canonical GET is in-flight and held.
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(apiCalls.filter((call) => call.path === root)).toHaveLength(1),
  );
  // Switch the SAME mounted instance back to B while A's canonical GET is still unresolved.
  rerender(
    createElement(SupplySubmissionDetailView, {
      initialDetail: createdB,
      source: "live",
    }),
  );
  let releaseSubBPut!: () => void;
  uploadContentSpy.mockImplementationOnce(
    async (...args) =>
      new Promise((resolve, reject) => {
        releaseSubBPut = () => {
          realUploadContent(...args).then(resolve, reject);
        };
      }),
  );
  const subBFile = new File(
    [Buffer.from("submission-b-fresh-license-bytes")],
    "sub-b-license.pdf",
    { type: "application/pdf" },
  );
  fireEvent.change(fileInput, { target: { files: [subBFile] } });
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      apiCalls.filter((call) =>
        call.path.endsWith(`/supply-submissions/${idB}/documents/content`),
      ),
    ).toHaveLength(1),
  );
  // Resolve A's held canonical GET with noneditable status="submitted" and high revisionNo=99 while B's PUT is pending.
  resolveHeldAGet({
    ...subAForHeldGet,
    submission: {
      ...subAForHeldGet.submission,
      status: "submitted",
      revisionNo: 99,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  releaseSubBPut();
  await waitFor(() =>
    expect(screen.getAllByText("sub-b-license.pdf").length).toBeGreaterThan(0),
  );
  expect(
    apiCalls.filter((call) =>
      call.path.endsWith(`/supply-submissions/${idB}/documents/confirm`),
    ),
  ).toHaveLength(1);

  // Also verify editable status="draft" held canonical GET from A with revisionNo=99 does not overwrite B's revisionNo during B's in-flight PUT.
  const subBAfterFirstDoc = await fleetDocumentRequest<SupplySubmissionDetail>(
    `/api/fleet-partner/supply-submissions/${idB}`,
  );
  rerender(
    createElement(SupplySubmissionDetailView, {
      initialDetail: subAForHeldGet,
      source: "live",
    }),
  );
  heldGetDetailSpy.mockImplementationOnce(
    async () =>
      new Promise((resolve) => {
        resolveHeldADraftGet = (detail) => resolve(detail as never);
      }),
  );
  heldGetConfirmSpy.mockRejectedValueOnce(
    new ApiRequestError(
      503,
      "CONFIRM_PRE_COMMIT_UNAVAILABLE",
      "Submission A second confirm transiently unavailable.",
    ),
  );
  const subADraftHeldFile = new File(
    [Buffer.from("submission-a-draft-held-get-bytes")],
    "sub-a-draft-held.pdf",
    { type: "application/pdf" },
  );
  fireEvent.change(fileInput, { target: { files: [subADraftHeldFile] } });
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      screen.getByText(/Submission A second confirm transiently unavailable/i),
    ).toBeTruthy(),
  );
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(apiCalls.filter((call) => call.path === root)).toHaveLength(2),
  );
  rerender(
    createElement(SupplySubmissionDetailView, {
      initialDetail: subBAfterFirstDoc,
      source: "live",
    }),
  );
  let releaseSubBSecondPut!: () => void;
  uploadContentSpy.mockImplementationOnce(
    async (...args) =>
      new Promise((resolve, reject) => {
        releaseSubBSecondPut = () => {
          realUploadContent(...args).then(resolve, reject);
        };
      }),
  );
  const subBIdCardFile = new File(
    [Buffer.from("submission-b-id-card-bytes")],
    "sub-b-id-card.pdf",
    { type: "application/pdf" },
  );
  fireEvent.change(typeSelect, { target: { value: "driver_national_id" } });
  fireEvent.change(fileInput, { target: { files: [subBIdCardFile] } });
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      apiCalls.filter((call) =>
        call.path.endsWith(`/supply-submissions/${idB}/documents/content`),
      ),
    ).toHaveLength(2),
  );
  resolveHeldADraftGet({
    ...subAForHeldGet,
    submission: {
      ...subAForHeldGet.submission,
      status: "draft",
      revisionNo: 99,
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 25));
  releaseSubBSecondPut();
  await waitFor(() =>
    expect(screen.getAllByText("sub-b-id-card.pdf").length).toBeGreaterThan(0),
  );
  expect(
    apiCalls.filter((call) =>
      call.path.endsWith(`/supply-submissions/${idB}/documents/confirm`),
    ),
  ).toHaveLength(2);
  heldGetDetailSpy.mockRestore();
  heldGetConfirmSpy.mockRestore();

  // Rerendering the SAME instance with B becoming non-editable ("submitted") while PUT is in-flight stops before confirm.
  apiCalls.length = 0;
  let releaseNonEditablePut!: () => void;
  uploadContentSpy.mockImplementationOnce(
    async (...args) =>
      new Promise((resolve, reject) => {
        releaseNonEditablePut = () => {
          realUploadContent(...args).then(resolve, reject);
        };
      }),
  );
  const subBLateFile = new File(
    [Buffer.from("submission-b-late-taxi-reg-bytes")],
    "sub-b-late-taxi.pdf",
    { type: "application/pdf" },
  );
  fireEvent.change(typeSelect, {
    target: { value: "taxi_driver_registration" },
  });
  fireEvent.change(fileInput, { target: { files: [subBFile, subBLateFile] } });
  fireEvent.change(fileInput, { target: { files: [subBLateFile] } });
  fireEvent.click(uploadButton);
  await waitFor(() =>
    expect(
      apiCalls.filter((call) => call.path.endsWith("/documents/content")),
    ).toHaveLength(1),
  );
  const refreshedB = await fleetDocumentRequest<SupplySubmissionDetail>(
    `/api/fleet-partner/supply-submissions/${idB}`,
  );
  rerender(
    createElement(SupplySubmissionDetailView, {
      initialDetail: {
        ...refreshedB,
        submission: { ...refreshedB.submission, status: "submitted" },
      },
      source: "live",
    }),
  );
  releaseNonEditablePut();
  await new Promise((resolve) => setTimeout(resolve, 25));
  expect(
    apiCalls.filter((call) => call.path.endsWith("/documents/confirm")),
  ).toHaveLength(0);
  expect((uploadButton as HTMLButtonElement).disabled).toBe(true);
  uploadContentSpy.mockRestore();
});

it("real CaseReplyComposer staged retry/resume reuses the same intent on scanner 503, resumes confirm without re-PUT, and reconciles persisted attachment via canonical GET readback", async () => {
  await usePartner("METRO_FLEET");
  apiCalls.length = 0;
  requests.length = 0;

  const { container } = render(
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

  const storageInternal = fixture.storage as unknown as {
    scannerFactory: (...args: unknown[]) => {
      availability: () => { state: string };
      scan: (...scanArgs: unknown[]) => Promise<{ scanState: string }>;
    };
  };
  const realScannerFactory = storageInternal.scannerFactory.bind(
    fixture.storage,
  );

  let failScannerOnce = true;
  storageInternal.scannerFactory = (...args: unknown[]) => {
    const scanner = realScannerFactory(...args);
    return {
      availability: () => scanner.availability(),
      scan: async (...scanArgs: unknown[]) => {
        if (failScannerOnce) {
          failScannerOnce = false;
          throw new Error("ClamAV daemon transiently unavailable");
        }
        return scanner.scan(...scanArgs);
      },
    };
  };

  const fileInput =
    container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const evidenceFile = new File(
    [Buffer.from("case-attachment-staged-retry-bytes")],
    "dispatch-log.pdf",
    { type: "application/pdf" },
  );
  fireEvent.change(fileInput, { target: { files: [evidenceFile] } });

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /重試/ })).toBeTruthy(),
  );
  expect(screen.queryByText("已上傳")).toBeNull();
  expect(
    apiCalls.filter((call) => call.path.endsWith("/attachments/upload-url")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/attachments/content")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/attachments/confirm")),
  ).toHaveLength(0);

  // Now make confirm persist on backend and then throw 503 response-lost once.
  const caseService = (
    fixture.controller as unknown as {
      caseService: {
        confirmAttachmentUpload: (...args: unknown[]) => Promise<unknown>;
      };
    }
  ).caseService;
  const realConfirm = caseService.confirmAttachmentUpload.bind(caseService);
  const confirmSpy = vi
    .spyOn(caseService, "confirmAttachmentUpload")
    .mockImplementationOnce(async (...args) => {
      await realConfirm(...args);
      throw new ApiRequestError(
        503,
        "CONFIRM_RESPONSE_LOST",
        "Case attachment confirm response lost after commit.",
      );
    });

  // First retry click: reuses original intent, re-PUTs same bytes (scan now succeeds), calls confirm (persists then 503).
  fireEvent.click(screen.getByRole("button", { name: /重試/ }));
  await waitFor(() =>
    expect(
      apiCalls.filter((call) => call.path.endsWith("/attachments/confirm")),
    ).toHaveLength(1),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /重試/ })).toBeTruthy(),
  );
  expect(screen.queryByText("已上傳")).toBeNull();
  expect(
    apiCalls.filter((call) => call.path.endsWith("/attachments/upload-url")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/attachments/content")),
  ).toHaveLength(2);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/attachments/confirm")),
  ).toHaveLength(1);

  // Second retry click: when canonical GET /api/fleet-partner/cases/cmp_0908 transiently fails with 503,
  // retains staged session and surfaces the failure; third retry click reconciles from canonical GET without re-PUT or re-confirm!
  const getCaseDetailSpy = vi
    .spyOn(
      caseService as unknown as {
        getCaseDetail: (...args: unknown[]) => Promise<unknown>;
      },
      "getCaseDetail",
    )
    .mockRejectedValueOnce(
      new ApiRequestError(
        503,
        "CASE_READBACK_UNAVAILABLE",
        "Case detail GET transiently unavailable after lost confirm ACK.",
      ),
    );
  fireEvent.click(screen.getByRole("button", { name: /重試/ }));
  await waitFor(() =>
    expect(
      apiCalls.filter(
        (call) => call.path === "/api/fleet-partner/cases/cmp_0908",
      ),
    ).toHaveLength(1),
  );
  await waitFor(() =>
    expect(
      apiCalls.filter((call) => call.path.endsWith("/attachments/confirm")),
    ).toHaveLength(1),
  );
  expect(screen.queryByText("已上傳")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /重試/ }));
  await waitFor(() => expect(screen.getByText("已上傳")).toBeTruthy());
  expect(
    apiCalls.filter((call) => call.path.endsWith("/attachments/upload-url")),
  ).toHaveLength(1);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/attachments/content")),
  ).toHaveLength(2);
  expect(
    apiCalls.filter((call) => call.path.endsWith("/attachments/confirm")),
  ).toHaveLength(1);
  getCaseDetailSpy.mockRestore();
  confirmSpy.mockRestore();

  const detail = await fixture.controller.getPortalCaseDetail(
    "METRO_FLEET",
    "cmp_0908",
  );
  expect(
    detail.data.attachments.filter((item) => item.name === "dispatch-log.pdf"),
  ).toHaveLength(1);
});
