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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  FleetSupplyRenewalTargetsResponse,
  SupplyDocumentRecord,
  SupplySubmissionRecord,
} from "@drts/contracts";
import {
  NewSupplyRenewalForm,
  NewVehicleSubmissionForm,
  SupplySubmissionDetailView,
} from "../../../apps/fleet-partner-portal-web/components/fleet-supply-workspace";
import { LanguageProvider as FleetLanguageProvider } from "../../../apps/fleet-partner-portal-web/lib/i18n";
import type { SupplySubmissionDetail } from "../../../apps/fleet-partner-portal-web/lib/fleet-portal-supply";
import SupplyReviewDetailPage from "../../../apps/platform-admin-web/app/supply-review/[submissionId]/page";
import { buildSideBySideDiff } from "../../../apps/platform-admin-web/app/supply-review/supply-review-shared";
import { LanguageProvider as AdminLanguageProvider } from "../../../apps/platform-admin-web/lib/i18n";

const navMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  submissionId: "sub-ren-ui-001",
}));

const adminClientState = vi.hoisted(() => ({
  client: null as any,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navMocks.push,
    refresh: navMocks.refresh,
    back: navMocks.back,
  }),
  useParams: () => ({ submissionId: navMocks.submissionId }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: () => adminClientState.client,
}));

const sampleTargets: FleetSupplyRenewalTargetsResponse = {
  fleetPartnerId: "fleet-ui-001",
  vehicles: [
    {
      vehicleId: "veh-canon-001",
      fleetPartnerId: "fleet-ui-001",
      plateNo: "TPE-9001",
      licenseType: "taxi",
      brand: "Toyota",
      model: "Camry Hybrid",
      modelYear: 2024,
      seatCount: 4,
      luggageCapacity: 2,
      businessArea: "台北市",
      supportedServiceProductCodes: ["taxi_realtime"],
      airportTransferEligible: true,
      fixedFareAllowed: true,
      doorCount: 4,
      color: "White",
      supplyLifecycle: "suspended",
      activeContractId: "contract-canon-001",
      activeContractStatus: "active",
      activeContractEndAt: "2028-12-31T23:59:59.000Z",
      activePolicyId: "policy-canon-001",
      activePolicyNo: "POL-OLD-001",
      activePolicyStatus: "expired",
      activePolicyEndAt: "2025-12-31T23:59:59.000Z",
      ready: false,
      reasonCodes: ["INSURANCE_EXPIRED"],
    },
  ],
  drivers: [
    {
      driverId: "drv-canon-001",
      fleetPartnerId: "fleet-ui-001",
      name: "林續期",
      mobile: "0912333444",
      professionalDriverLicenseNo: "PDL-UI-001",
      professionalDriverLicenseExpiry: "2025-10-01",
      taxiDriverRegistrationNo: "REG-UI-001",
      taxiDriverRegistrationArea: "台北市",
      taxiDriverRegistrationExpiry: "2025-10-01",
      supportedServiceProductCodes: ["taxi_realtime"],
      lifecycleStatus: "active",
      licensesValid: false,
      ready: false,
      reasonCodes: ["DRIVER_LICENSE_EXPIRED", "DRIVER_REGISTRATION_EXPIRED"],
    },
  ],
};

describe("BUREAU-APPROVED-SUPPLY-RENEWAL-WORKFLOW-20261025: Fleet & Platform Renewal UI", () => {
  beforeEach(() => {
    localStorage.clear();
    navMocks.push.mockReset();
    navMocks.refresh.mockReset();
    navMocks.back.mockReset();
    adminClientState.client = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows plate-collision renewal routing banner and link when vehicle onboarding hits PLATE_ALREADY_EXISTS", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "PLATE_ALREADY_EXISTS",
            message:
              "A vehicle draft or canonical vehicle with this plate number is already registered.",
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetcher);

    render(
      <FleetLanguageProvider defaultLocale="zh">
        <NewVehicleSubmissionForm draftScope="fleet-ui-001:actor-1" />
      </FleetLanguageProvider>,
    );

    const plateInput = await screen.findByLabelText(/車牌/);
    fireEvent.change(plateInput, { target: { value: "TPE-9001" } });

    const submitBtn = screen.getByRole("button", { name: /建立草稿/ });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() =>
      expect(
        screen.getByRole("region", { name: /此車牌已存在於車隊核可車輛主檔/ }),
      ).toBeDefined(),
    );

    const renewalLink = screen.getByRole("link", {
      name: /前往既有供給續期送審 \(TPE-9001\)/,
    });
    expect(renewalLink.getAttribute("href")).toBe(
      "/supply/renewals/new?plateNo=TPE-9001",
    );
  });

  it("creates vehicle insurance_update and driver profile_correction drafts via NewSupplyRenewalForm with read-only plate and canonical target selection", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            submission: {
              submissionId: "sub-veh-ren-001",
              fleetPartnerId: "fleet-ui-001",
              submissionType: "insurance_update",
              status: "draft",
              revisionNo: 1,
              subjectVehicleId: "veh-canon-001",
              canonicalVehicleId: "veh-canon-001",
            },
            vehicleDraft: {
              submissionId: "sub-veh-ren-001",
              plateNo: "TPE-9001",
              licenseType: "taxi",
              brand: "Toyota",
              model: "Camry Hybrid",
              modelYear: 2024,
              seatCount: 4,
              luggageCapacity: 2,
              businessArea: "台北市",
              supportedServiceProductCodes: ["taxi_realtime"],
              airportTransferEligible: true,
              fixedFareAllowed: true,
              currentDriverSubmissionId: null,
              doorCount: 4,
              color: "White",
            },
            driverDraft: null,
            documents: [],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            submission: {
              submissionId: "sub-drv-ren-001",
              fleetPartnerId: "fleet-ui-001",
              submissionType: "profile_correction",
              status: "draft",
              revisionNo: 1,
              subjectDriverId: "drv-canon-001",
              canonicalDriverId: "drv-canon-001",
            },
            driverDraft: {
              submissionId: "sub-drv-ren-001",
              name: "林續期",
              mobile: "0912333444",
              professionalDriverLicenseNo: "PDL-UI-001",
              professionalDriverLicenseExpiry: "2030-10-01",
              taxiDriverRegistrationNo: "REG-UI-001",
              taxiDriverRegistrationArea: "台北市",
              taxiDriverRegistrationExpiry: "2030-10-01",
              supportedServiceProductCodes: ["taxi_realtime"],
              preferredVehicleSubmissionId: null,
            },
            vehicleDraft: null,
            documents: [],
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    render(
      <FleetLanguageProvider defaultLocale="zh">
        <NewSupplyRenewalForm
          draftScope="fleet-ui-001:actor-1"
          initialTargets={sampleTargets}
          initialPlateNo="TPE-9001"
        />
      </FleetLanguageProvider>,
    );

    // Shows canonical summary for TPE-9001 and read-only plate field
    expect(
      screen.getByText(/目前主檔效期與派工狀態 \(veh-canon-001 · TPE-9001\)/),
    ).toBeDefined();
    const plateField = screen.getByDisplayValue("TPE-9001") as HTMLInputElement;
    expect(plateField.readOnly).toBe(true);

    // Submit vehicle insurance_update draft creation
    const createBtn = screen.getByRole("button", { name: /建立草稿/ });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/control-plane-proxy/fleet-partner/supply-submissions/renewals",
    );
    const vehicleCreateBody = JSON.parse(
      String(fetcher.mock.calls[0]?.[1]?.body),
    );
    expect(vehicleCreateBody).toMatchObject({
      submissionType: "insurance_update",
      subjectVehicleId: "veh-canon-001",
      vehicleDraft: expect.objectContaining({
        plateNo: "TPE-9001",
        brand: "Toyota",
      }),
    });
    expect(navMocks.push).toHaveBeenCalledWith(
      "/supply/submissions/sub-veh-ren-001",
    );

    // Switch to driver license renewal (profile_correction)
    const typeSelect = screen.getByLabelText(/續期送審類型/);
    fireEvent.change(typeSelect, { target: { value: "profile_correction" } });

    expect(
      await screen.findByText(/目前主檔效期與派工狀態 \(drv-canon-001\)/),
    ).toBeDefined();

    await act(async () => {
      fireEvent.click(createBtn);
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const driverCreateBody = JSON.parse(
      String(fetcher.mock.calls[1]?.[1]?.body),
    );
    expect(driverCreateBody).toMatchObject({
      submissionType: "profile_correction",
      subjectDriverId: "drv-canon-001",
      driverDraft: expect.objectContaining({
        name: "林續期",
        professionalDriverLicenseNo: "PDL-UI-001",
      }),
    });
    expect(navMocks.push).toHaveBeenCalledWith(
      "/supply/submissions/sub-drv-ren-001",
    );
  });

  it("saves renewal draft via /renewal endpoint, uploads proof via C125, and submits from SupplySubmissionDetailView", async () => {
    const initialDetail: SupplySubmissionDetail = {
      submission: {
        submissionId: "sub-veh-ren-002",
        fleetPartnerId: "fleet-ui-001",
        submissionType: "contract_update",
        status: "draft",
        revisionNo: 1,
        subjectDriverId: null,
        subjectVehicleId: "veh-canon-001",
        submittedBy: null,
        submittedAt: null,
        reviewStartedBy: null,
        reviewStartedAt: null,
        reviewedBy: null,
        reviewedAt: null,
        reviewReasonCode: null,
        reviewComment: null,
        canonicalDriverId: null,
        canonicalVehicleId: "veh-canon-001",
        canonicalContractId: "contract-canon-001",
        canonicalPolicyId: "policy-canon-001",
        createdAt: "2026-10-25T10:00:00.000Z",
        updatedAt: "2026-10-25T10:00:00.000Z",
      },
      driverDraft: null,
      vehicleDraft: {
        submissionId: "sub-veh-ren-002",
        plateNo: "TPE-9001",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Camry Hybrid",
        modelYear: 2024,
        seatCount: 4,
        luggageCapacity: 2,
        businessArea: "台北市",
        supportedServiceProductCodes: ["taxi_realtime"],
        airportTransferEligible: true,
        fixedFareAllowed: true,
        currentDriverSubmissionId: null,
        doorCount: 4,
        color: "White",
      },
      documents: [],
      reviewEvents: [],
    };

    const uploadedDoc: SupplyDocumentRecord = {
      documentId: "doc-contract-001",
      fleetPartnerId: "fleet-ui-001",
      submissionId: "sub-veh-ren-002",
      documentType: "fleet_participation_contract",
      fileObjectKey: "fleet-supply/fleet-ui-001/sub-veh-ren-002/contract.pdf",
      originalFileName: "renewed-contract.pdf",
      contentType: "application/pdf",
      fileSize: 12,
      checksumSha256: "b".repeat(64),
      effectiveFrom: "2026-01-01",
      effectiveUntil: "2031-12-31",
      reviewStatus: "pending",
      reviewComment: null,
      uploadedBy: "actor-1",
      uploadedAt: "2026-10-25T10:05:00.000Z",
    };

    const fetcher = vi
      .fn()
      // 1. Save renewal draft PUT .../renewal
      .mockResolvedValueOnce(
        Response.json({
          data: {
            ...initialDetail,
            submission: { ...initialDetail.submission, revisionNo: 2 },
          },
        }),
      )
      // 2. Refresh detail GET
      .mockResolvedValueOnce(
        Response.json({
          data: {
            ...initialDetail,
            submission: { ...initialDetail.submission, revisionNo: 2 },
          },
        }),
      )
      // 3. Upload intent POST .../documents/upload-url
      .mockResolvedValueOnce(
        Response.json({
          data: {
            submissionId: "sub-veh-ren-002",
            objectKey: uploadedDoc.fileObjectKey,
            uploadUrl:
              "/api/fleet-partner/supply-submissions/sub-veh-ren-002/documents/content?objectKey=key-c",
            method: "PUT",
            headers: { "content-type": "application/pdf" },
          },
        }),
      )
      // 4. Upload bytes PUT
      .mockResolvedValueOnce(
        Response.json({ data: { scan_state: "clean" } }),
      )
      // 5. Confirm upload POST .../documents/confirm
      .mockResolvedValueOnce(Response.json({ data: uploadedDoc }))
      // 6. Finalize canonical readback GET
      .mockResolvedValueOnce(
        Response.json({
          data: {
            ...initialDetail,
            submission: { ...initialDetail.submission, revisionNo: 3 },
            documents: [uploadedDoc],
          },
        }),
      )
      // 7. Submit POST .../submit
      .mockResolvedValueOnce(
        Response.json({
          data: {
            ...initialDetail,
            submission: {
              ...initialDetail.submission,
              status: "submitted",
              revisionNo: 4,
            },
            documents: [uploadedDoc],
          },
        }),
      )
      // 8. Refresh detail GET after submit
      .mockResolvedValueOnce(
        Response.json({
          data: {
            ...initialDetail,
            submission: {
              ...initialDetail.submission,
              status: "submitted",
              revisionNo: 4,
            },
            documents: [uploadedDoc],
          },
        }),
      );
    vi.stubGlobal("fetch", fetcher);

    render(
      <FleetLanguageProvider defaultLocale="zh">
        <SupplySubmissionDetailView
          initialDetail={initialDetail}
          source="live"
        />
      </FleetLanguageProvider>,
    );

    // Default document type for contract_update is fleet_participation_contract
    const docTypeSelect = screen.getByLabelText(/文件類型/) as HTMLSelectElement;
    expect(docTypeSelect.value).toBe("fleet_participation_contract");

    // Plate input is read-only for contract_update
    const plateField = screen.getByDisplayValue("TPE-9001") as HTMLInputElement;
    expect(plateField.readOnly).toBe(true);

    // Save draft calls PUT .../renewal
    const saveBtn = await screen.findByRole("button", { name: /儲存草稿/ });
    await waitFor(() => expect((saveBtn as HTMLButtonElement).disabled).toBe(false));
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/control-plane-proxy/fleet-partner/supply-submissions/sub-veh-ren-002/renewal",
    );
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("PUT");

    // Upload contract proof via C125
    const file = new File(["contract-pdf"], "renewed-contract.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(screen.getByLabelText(/檔名/), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText(/生效起/), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText(/到期/), {
      target: { value: "2031-12-31" },
    });

    const uploadBtn = screen.getByRole("button", {
      name: /建立 upload intent 並確認/,
    });
    await act(async () => {
      fireEvent.click(uploadBtn);
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(6));
    expect(await screen.findByText("renewed-contract.pdf")).toBeDefined();

    // Submit renewal for review
    const submitBtn = screen.getByRole("button", { name: /^送審/ });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(8));
    expect(fetcher.mock.calls[6]?.[0]).toBe(
      "/control-plane-proxy/fleet-partner/supply-submissions/sub-veh-ren-002/submit",
    );
  });

  it("renders renewal target diff and executes review/approve in Platform Admin SupplyReviewDetailPage", async () => {
    navMocks.submissionId = "sub-ren-admin-001";
    const submission: SupplySubmissionRecord = {
      submissionId: "sub-ren-admin-001",
      fleetPartnerId: "fleet-ui-001",
      submissionType: "insurance_update",
      status: "in_review",
      revisionNo: 3,
      subjectDriverId: null,
      subjectVehicleId: "veh-canon-001",
      submittedBy: "fleet-manager-1",
      submittedAt: "2026-10-25T10:10:00.000Z",
      reviewStartedBy: "platform-reviewer-1",
      reviewStartedAt: "2026-10-25T10:15:00.000Z",
      reviewedBy: null,
      reviewedAt: null,
      reviewReasonCode: null,
      reviewComment: null,
      canonicalDriverId: null,
      canonicalVehicleId: "veh-canon-001",
      canonicalContractId: "contract-canon-001",
      canonicalPolicyId: "policy-canon-001",
      createdAt: "2026-10-25T10:00:00.000Z",
      updatedAt: "2026-10-25T10:15:00.000Z",
    };

    const approveMock = vi.fn(async () => ({
      ...submission,
      status: "approved",
      revisionNo: 4,
      canonicalPolicyId: "policy-canon-renewed-002",
      reviewedBy: "platform-reviewer-1",
      reviewedAt: "2026-10-25T10:20:00.000Z",
    }));

    adminClientState.client = {
      getAdminSupplyReviewSubmission: vi.fn(async () => ({
        submission,
        vehicleDraft: {
          submissionId: submission.submissionId,
          plateNo: "TPE-9001",
          licenseType: "taxi",
          brand: "Toyota",
          model: "Camry Hybrid",
          modelYear: 2024,
          seatCount: 4,
          luggageCapacity: 2,
          businessArea: "台北市",
          supportedServiceProductCodes: ["taxi_realtime"],
          airportTransferEligible: true,
          fixedFareAllowed: true,
          currentDriverSubmissionId: null,
          doorCount: 4,
          color: "White",
        },
        driverDraft: null,
        documents: [
          {
            documentId: "doc-ins-new-001",
            fleetPartnerId: "fleet-ui-001",
            submissionId: submission.submissionId,
            documentType: "insurance_policy",
            fileObjectKey: "key-ins",
            originalFileName: "renewed-policy-2030.pdf",
            contentType: "application/pdf",
            fileSize: 1024,
            checksumSha256: "c".repeat(64),
            effectiveFrom: "2026-01-01",
            effectiveUntil: "2030-12-31",
            reviewStatus: "pending",
            reviewComment: null,
            uploadedBy: "fleet-manager-1",
            uploadedAt: "2026-10-25T10:05:00.000Z",
          },
        ],
        canonicalVehicle: {
          vehicleId: "veh-canon-001",
          plateNo: "TPE-9001",
          operatingArea: "台北市",
          supportedServiceBuckets: ["standard_taxi"],
          dispatchableFlag: false,
          insuranceStatus: "expired",
          supplyLifecycle: {
            insurance: {
              endAt: "2025-12-31T23:59:59.000Z",
            },
            contract: {
              endAt: "2028-12-31T23:59:59.000Z",
            },
          },
        },
      })),
      approveAdminSupplySubmission: approveMock,
    };

    // Verify buildSideBySideDiff directly includes renewed insurance date against expired canonical date
    const diffRows = buildSideBySideDiff(
      "sub-ren-admin-001",
      "insurance_update",
      {
        submissionId: "sub-ren-admin-001",
        plateNo: "TPE-9001",
        licenseType: "taxi",
        brand: "Toyota",
        model: "Camry Hybrid",
        modelYear: 2024,
        seatCount: 4,
        luggageCapacity: 2,
        businessArea: "台北市",
        supportedServiceProductCodes: ["taxi_realtime"],
        airportTransferEligible: true,
        fixedFareAllowed: true,
        currentDriverSubmissionId: null,
        doorCount: 4,
        color: "White",
      },
      null,
      {
        vehicleId: "veh-canon-001",
        plateNo: "TPE-9001",
        insuranceStatus: "expired",
        supplyLifecycle: {
          insurance: { endAt: "2025-12-31T23:59:59.000Z" },
        },
      },
      null,
      [
        {
          documentId: "doc-ins-new-001",
          fleetPartnerId: "fleet-ui-001",
          submissionId: "sub-ren-admin-001",
          documentType: "insurance_policy",
          fileObjectKey: "key-ins",
          originalFileName: "renewed-policy-2030.pdf",
          contentType: "application/pdf",
          fileSize: 1024,
          checksumSha256: "c".repeat(64),
          effectiveFrom: "2026-01-01",
          effectiveUntil: "2030-12-31",
          reviewStatus: "pending",
          reviewComment: null,
          uploadedBy: "fleet-manager-1",
          uploadedAt: "2026-10-25T10:05:00.000Z",
        },
      ],
    );
    const insuranceRow = diffRows.find((r) => r.label.includes("保險到期"));
    expect(insuranceRow).toEqual({
      label: "保險到期 · insurance until",
      submitted: "2030-12-31",
      canonical: "2025-12-31",
      changed: true,
    });

    render(
      <AdminLanguageProvider defaultLocale="zh">
        <SupplyReviewDetailPage />
      </AdminLanguageProvider>,
    );

    await screen.findByText(/同車續保更新/);
    expect(screen.getAllByText(/veh-canon-001/).length).toBeGreaterThan(0);
    expect(screen.getByText("2030-12-31")).toBeDefined();

    const approveBtn = await screen.findByRole("button", {
      name: /核可並更新資料/,
    });
    fireEvent.click(approveBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: /確認核可/,
    });
    await act(async () => {
      fireEvent.click(confirmBtn);
    });

    await waitFor(() =>
      expect(approveMock).toHaveBeenCalledWith(
        "sub-ren-admin-001",
        expect.objectContaining({
          expectedRevisionNo: 3,
          reasonCode: "manual_screening",
        }),
      ),
    );
    expect(await screen.findByText("policy-canon-renewed-002")).toBeDefined();
  });
});
