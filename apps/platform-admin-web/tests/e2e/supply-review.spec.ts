import { expect, test, type Page } from "@playwright/test";

const baseSubmission: Record<string, any> = {
  submissionId: "sub_s39",
  fleetPartnerId: "fleet-demo-001",
  fleetPartnerName: "大都會車隊",
  submissionType: "vehicle_onboarding",
  status: "submitted",
  revisionNo: 1,
  subjectDriverId: null,
  subjectVehicleId: "veh-demo-001",
  submittedBy: "fleet-user-1",
  submittedAt: "2026-06-18T14:02:00.000Z",
  reviewStartedBy: null,
  reviewStartedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReasonCode: null,
  reviewComment: null,
  canonicalDriverId: null,
  canonicalVehicleId: null,
  canonicalContractId: null,
  canonicalPolicyId: null,
  createdAt: "2026-06-18T14:02:00.000Z",
  updatedAt: "2026-06-18T14:02:00.000Z",
  subject: "KAB-7720 · Hyundai Custo",
  businessArea: "taipei",
  supportedServiceProductCodes: ["realtime", "business", "airport"],
  missingItemsCount: 0,
  lockedBy: null,
};

const vehicleDraft = {
  submissionId: "sub_s39",
  plateNo: "KAB-7720",
  licenseType: "multi_purpose_taxi",
  brand: "Hyundai",
  model: "Custo",
  modelYear: 2024,
  seatCount: 9,
  luggageCapacity: 6,
  businessArea: "taipei",
  supportedServiceProductCodes: ["realtime", "business", "airport"],
  airportTransferEligible: true,
  fixedFareAllowed: true,
  currentDriverSubmissionId: null,
  doorCount: 5,
  color: "yellow",
};

const documents = [
  {
    documentId: "doc-s39-reg",
    fleetPartnerId: "fleet-demo-001",
    submissionId: "sub_s39",
    documentType: "registration",
    fileObjectKey: "files/reg_kab7720.pdf",
    originalFileName: "reg_kab7720.pdf",
    contentType: "application/pdf",
    fileSize: 2048,
    checksumSha256: "sha256-reg-kab7720",
    effectiveFrom: "2024-01-01",
    effectiveUntil: "2029-01-01",
    reviewStatus: "approved",
    reviewComment: null,
    uploadedBy: "fleet-user-1",
    uploadedAt: "2026-06-18T14:02:00.000Z",
  },
  {
    documentId: "doc-s39-ins",
    fleetPartnerId: "fleet-demo-001",
    submissionId: "sub_s39",
    documentType: "insurance_policy",
    fileObjectKey: "files/policy_kab7720.pdf",
    originalFileName: "policy_kab7720.pdf",
    contentType: "application/pdf",
    fileSize: 4096,
    checksumSha256: "sha256-policy-kab7720",
    effectiveFrom: "2026-07-01",
    effectiveUntil: "2027-07-01",
    reviewStatus: "submitted",
    reviewComment: null,
    uploadedBy: "fleet-user-1",
    uploadedAt: "2026-06-18T14:02:00.000Z",
  },
];

function envelope(data: unknown) {
  return {
    data,
    meta: {
      requestId: "playwright-supply-review",
      timestamp: new Date().toISOString(),
    },
  };
}

async function mockSupplyReviewApi(page: Page, stateOverride?: Partial<typeof baseSubmission>) {
  let currentSubmission = { ...baseSubmission, ...stateOverride };

  await page.route("**/api/admin/supply-review/submissions*", async (route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (method === "GET" && url.endsWith("/submissions")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope([currentSubmission])),
      });
      return;
    }

    if (method === "GET" && url.includes("/submissions/sub_s39")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          envelope({
            submission: currentSubmission,
            ...currentSubmission,
            vehicleDraft,
            driverDraft: null,
            documents,
            canonicalVehicle: {
              vehicleId: "veh-demo-001",
              plateNo: "KAB-7720",
              licenseType: "multi_purpose_taxi",
              seatCount: 7,
              luggageCapacity: 6,
              operatingArea: "taipei",
              airportTransferEligible: false,
              insuranceStatus: "valid",
            },
          }),
        ),
      });
      return;
    }

    if (method === "POST" && url.includes("/start")) {
      currentSubmission = {
        ...currentSubmission,
        status: "in_review",
        reviewStartedBy: "LP",
        reviewStartedAt: new Date().toISOString(),
        lockedBy: "林佩璇",
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope(currentSubmission)),
      });
      return;
    }

    if (method === "POST" && url.includes("/request-revision")) {
      currentSubmission = {
        ...currentSubmission,
        status: "needs_revision",
        revisionNo: currentSubmission.revisionNo + 1,
        reviewReasonCode: "document_expired",
        reviewComment: "請更新保險單據",
        reviewedBy: "LP",
        reviewedAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope(currentSubmission)),
      });
      return;
    }

    if (method === "POST" && url.includes("/approve")) {
      currentSubmission = {
        ...currentSubmission,
        status: "approved",
        revisionNo: currentSubmission.revisionNo + 1,
        canonicalDriverId: null,
        canonicalVehicleId: "veh_9120",
        canonicalContractId: "contract_9120",
        canonicalPolicyId: "policy_9120",
        reviewedBy: "LP",
        reviewedAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope(currentSubmission)),
      });
      return;
    }

    if (method === "POST" && url.includes("/reject")) {
      currentSubmission = {
        ...currentSubmission,
        status: "rejected",
        revisionNo: currentSubmission.revisionNo + 1,
        reviewedBy: "LP",
        reviewedAt: new Date().toISOString(),
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(envelope(currentSubmission)),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(envelope({ status: "ok" })),
    });
  });
}

test.describe("Platform Admin Supply Review Workflow", () => {
  test("completes end-to-end review lifecycle: queue -> start -> request revision -> approve provision", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockSupplyReviewApi(page);

    // 1. Open queue screen
    await page.goto("/supply-review");
    await expect(page.locator('[data-screen-id="PSR-QUEUE-01"]')).toBeVisible();
    await expect(page.getByText("供給審核佇列 · Supply Review")).toBeVisible();
    await expect(page.getByText("sub_s39")).toBeVisible();
    await expect(page.getByText("KAB-7720 · Hyundai Custo")).toBeVisible();

    // Verify 7 filter selectors
    await expect(page.locator("select").nth(0)).toBeVisible(); // Fleet
    await expect(page.locator("select").nth(1)).toBeVisible(); // Type
    await expect(page.locator("select").nth(2)).toBeVisible(); // Service Product
    await expect(page.locator("select").nth(3)).toBeVisible(); // Business Area
    await expect(page.locator("select").nth(4)).toBeVisible(); // Status
    await expect(page.locator("select").nth(5)).toBeVisible(); // Missing
    await expect(page.locator("select").nth(6)).toBeVisible(); // Date

    // 2. Start review and navigate to detail page
    await page.getByRole("button", { name: "受理審核" }).first().click();
    await expect(page.locator('[data-screen-id="PSR-DETAIL-01"]')).toBeVisible();
    await expect(page.getByText("逐欄位對照 · submission vs canonical")).toBeVisible();
    await expect(page.getByText("文件檢視 · documents")).toBeVisible();

    // Test document preview modal (VQ-2)
    await page.getByRole("button", { name: "預覽" }).first().click();
    await expect(page.getByText("文件預覽 · reg_kab7720.pdf")).toBeVisible();
    await page.getByRole("button", { name: "關閉預覽" }).click();

    // 3. Request revision action
    await page.getByRole("button", { name: "退回補正" }).click();
    await expect(page.getByText("確認退回車行補正？")).toBeVisible();
    await page.getByRole("combobox").selectOption("document_expired");
    await page.getByRole("button", { name: "確認退補" }).click();

    // Verify state transitioned to needs_revision and canonical IDs are NOT provisioned
    await expect(page.getByText("已退補正")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("審核憑證 · audit receipt");

    // 4. Re-start review and approve provision
    await mockSupplyReviewApi(page, { status: "in_review", revisionNo: 2 });
    await page.reload();

    await page.getByRole("button", { name: "核可 · provision" }).click();
    await expect(page.getByText("確認核可並寫入 canonical？")).toBeVisible();
    await page.getByRole("button", { name: "確認核可 · provision" }).click();

    // 5. Verify only approve provisions canonical registry and displays audit receipt (VQ-6)
    await expect(page.getByText("已核可")).toBeVisible();
    await expect(page.getByText("審核憑證 · audit receipt")).toBeVisible();
    await expect(page.getByText("veh_9120")).toBeVisible();
    await expect(page.getByText("contract_9120")).toBeVisible();
  });

  test("denies self-approval and displays REVIEWER_SELF_APPROVAL_DENIED error banner", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockSupplyReviewApi(page, { status: "in_review" });

    await page.route("**/api/admin/supply-review/submissions/sub_s39/approve", async (route) => {
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "REVIEWER_SELF_APPROVAL_DENIED",
            message: "審核人不得核可自己以車行身分提交的資料",
            retryable: false,
          },
        }),
      });
    });

    await page.goto("/supply-review/sub_s39");
    await page.getByRole("button", { name: "核可 · provision" }).click();
    await page.getByRole("button", { name: "確認核可 · provision" }).click();

    await expect(page.getByText("REVIEWER_SELF_APPROVAL_DENIED")).toBeVisible();
    await expect(page.getByText("審核人不得核可自己以車行身分提交的資料")).toBeVisible();
  });

  test("handles SUBMISSION_REVISION_CONFLICT 409 error gracefully", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockSupplyReviewApi(page, { status: "in_review" });

    await page.route("**/api/admin/supply-review/submissions/sub_s39/approve", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "SUBMISSION_REVISION_CONFLICT",
            message: "此 submission 已被更新，請重新載入後再審",
            retryable: false,
          },
        }),
      });
    });

    await page.goto("/supply-review/sub_s39");
    await page.getByRole("button", { name: "核可 · provision" }).click();
    await page.getByRole("button", { name: "確認核可 · provision" }).click();

    await expect(page.getByText("SUBMISSION_REVISION_CONFLICT · 409")).toBeVisible();
    await expect(page.getByRole("button", { name: "重新載入" })).toBeVisible();
  });
});
