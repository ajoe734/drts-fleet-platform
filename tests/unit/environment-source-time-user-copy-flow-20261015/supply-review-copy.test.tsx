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
import type { SupplySubmissionRecord } from "@drts/contracts";
import SupplyReviewDetailPage from "../../../apps/platform-admin-web/app/supply-review/[submissionId]/page";
import { classifySupplyReviewError } from "../../../apps/platform-admin-web/app/supply-review/supply-review-shared";
import { LanguageProvider } from "../../../apps/platform-admin-web/lib/i18n";
import { t } from "../../../apps/platform-admin-web/lib/translations";

const state = vi.hoisted(() => ({ client: null as any }));
vi.mock("@/lib/admin-client", () => ({
  usePlatformAdminClient: () => state.client,
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ submissionId: "ENV-SUPPLY-001" }),
  useRouter: () => ({ refresh() {} }),
}));

const original = {
  submissionId: "ENV-SUPPLY-001",
  submissionType: "vehicle_onboarding",
  status: "in_review",
  fleetPartnerId: "fleet-env",
  revisionNo: 7,
  submittedAt: "2026-10-01T00:00:00.000Z",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  reviewStartedBy: "reviewer-other",
  canonicalVehicleId: null,
} as unknown as SupplySubmissionRecord;
const expected = {
  en: {
    preview: "Changes after approval",
    confirmation: "Confirm approval and record updates?",
    guardrail:
      "You cannot approve a fleet submission you sent yourself. Ask another authorized reviewer to handle it. Required documents must be complete before approval.",
    consequence:
      "Approval creates or updates official driver or vehicle records, links them to the fleet partner, rechecks service requirements, and saves the review history and notifications in one transaction. Complete missing fields or documents before approval.",
    steps: [
      "1. Create or update the official driver or vehicle record",
      "2. Link the driver or vehicle to the fleet partner",
      "3. Recheck whether service requirements are met",
      "4. Save the review history and notify the fleet partner and driver",
    ],
    deniedTitle: "Another reviewer is required",
    deniedBody:
      "You cannot approve a fleet submission you sent yourself. Ask another authorized reviewer to review this application.",
  },
  zh: {
    preview: "核可後的資料異動",
    confirmation: "確認核可並更新正式資料？",
    guardrail:
      "不得核可自己以車行身分提交的資料，請交由其他具審核權限的人員處理。必要文件須齊全，不得略過檢查。",
    consequence:
      "核可會在同一筆交易中建立或更新司機／車輛正式資料、綁定車行關係、重新檢查服務條件，並保存審核紀錄及通知。資料或文件未齊全時無法核可，請先退回補正。",
    steps: [
      "1. 建立或更新司機／車輛正式資料",
      "2. 建立司機／車輛與車行的歸屬關係",
      "3. 重新檢查是否符合服務條件",
      "4. 保存審核紀錄並通知車行與司機",
    ],
    // The existing correct zh denial is preserved, not rewritten for symmetry.
    deniedTitle: "拒絕自身審核",
    deniedBody: "審核人不得核可自己以車行身分提交的資料（拒絕利益衝突審核）。",
  },
};
function harness(locale: "en" | "zh", missingDocuments = false) {
  const approved = {
    ...original,
    status: "approved",
    canonicalVehicleId: "vehicle-env-confirmed",
    reviewedBy: "reviewer-authorized",
  };
  const documents = missingDocuments
    ? []
    : ["registration", "insurance"].map((documentType, index) => ({
        documentId: `env-doc-${index}`,
        submissionId: original.submissionId,
        documentType,
        originalFileName: `${documentType}.pdf`,
        effectiveFrom: "2026-01-01",
        effectiveUntil: "2035-12-31",
        reviewStatus: "approved",
      }));
  const approve = vi.fn(async () => approved);
  state.client = {
    getAdminSupplyReviewSubmission: vi.fn(async () => ({
      submission: original,
      documents,
      vehicleDraft: {
        plateNo: "ENV-TEST",
        brand: "Test",
        model: "Review",
        seatCount: 4,
        supportedServiceProductCodes: ["taxi"],
      },
    })),
    approveAdminSupplySubmission: approve,
  };
  const view = render(
    <LanguageProvider defaultLocale={locale}>
      <SupplyReviewDetailPage />
    </LanguageProvider>,
  );
  return { ...view, approve };
}
async function submitThroughActualUi(locale: "en" | "zh") {
  const button = await screen.findByRole("button", {
    name: (name: string) =>
      name.includes(t("supplyReview.detail.approveProvision", locale)),
  });
  await act(async () => {
    fireEvent.click(button);
  });
  const confirmation = screen.queryByRole("button", {
    name: (name: string) =>
      name.includes(t("supplyReview.modal.confirmApproveBtn", locale)),
  });
  if (confirmation)
    await act(async () => {
      fireEvent.click(confirmation);
    });
}
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each(["en", "zh"] as const)(
  "actual supply review copy and command flow (%s)",
  (locale) => {
    it("shows the complete normal guardrail and approval consequences with the real locale catalog", async () => {
      harness(locale);
      await screen.findByText(expected[locale].preview);
      expect(screen.getByText(expected[locale].guardrail)).toBeDefined();
      expect(screen.getByText(expected[locale].consequence)).toBeDefined();
    });

    it("retains explicit confirmation, reason, revision and audit diagnostics after readable approval steps", async () => {
      const h = harness(locale);
      const approve = await screen.findByRole("button", {
        name: (name: string) =>
          name.includes(t("supplyReview.detail.approveProvision", locale)),
      });
      expect((approve as HTMLButtonElement).disabled).toBe(false);
      fireEvent.change(
        screen.getByPlaceholderText(
          t("supplyReview.detail.commentPlaceholder", locale),
        ),
        { target: { value: "Documents checked for this application" } },
      );
      fireEvent.click(approve);
      expect(h.approve).not.toHaveBeenCalled();
      expect(screen.getByText(expected[locale].confirmation)).toBeDefined();
      const intro = t("supplyReview.detail.confirmApproveIntro", locale, {
        submissionId: "ENV-SUPPLY-001",
      });
      const confirmation = screen.getByText(
        (_, element) =>
          element?.tagName === "DIV" &&
          element.textContent?.startsWith(intro) === true &&
          element.children.length === 4,
      );
      for (const step of expected[locale].steps)
        expect(confirmation.textContent).toContain(step);
      fireEvent.click(
        screen.getByRole("button", {
          name: (name: string) =>
            name.includes(t("supplyReview.modal.confirmApproveBtn", locale)),
        }),
      );
      await waitFor(() =>
        expect(h.approve).toHaveBeenCalledWith("ENV-SUPPLY-001", {
          expectedRevisionNo: 7,
          reasonCode: "manual_screening",
          comment: "Documents checked for this application",
        }),
      );
      await screen.findByText("vehicle-env-confirmed");
      expect(screen.getByText("canonicalVehicleId")).toBeDefined(); // useful audit diagnostics retained
      expect(screen.getByText("reviewer-authorized")).toBeDefined();
    });

    it("cancels the existing confirmation without sending an approval command", async () => {
      const h = harness(locale);
      const button = await screen.findByRole("button", {
        name: (name: string) =>
          name.includes(t("supplyReview.detail.approveProvision", locale)),
      });
      fireEvent.click(button);
      expect(screen.getByText(expected[locale].confirmation)).toBeDefined();
      fireEvent.click(
        screen.getByRole("button", {
          name: t("supplyReview.detail.cancel", locale),
        }),
      );
      expect(screen.queryByText(expected[locale].confirmation)).toBeNull();
      expect(h.approve).not.toHaveBeenCalled();
    });

    it("uses the unchanged canonical denial classifier and shows a human rejection banner", async () => {
      const denial = {
        response: {
          error: {
            code: "REVIEWER_SELF_APPROVAL_DENIED",
            message: "REVIEWER_SELF_APPROVAL_DENIED: self submission",
          },
        },
      };
      const h = harness(locale);
      h.approve.mockRejectedValueOnce(denial);
      await submitThroughActualUi(locale);
      await screen.findByText(expected[locale].deniedTitle);
      expect(screen.getByText(expected[locale].deniedBody)).toBeDefined();
      expect(classifySupplyReviewError(denial)).toMatchObject({
        code: "REVIEWER_SELF_APPROVAL_DENIED",
        isSelfApprovalDenied: true,
        isConflict: false,
      });
      expect(screen.queryByText("vehicle-env-confirmed")).toBeNull();
    });

    it("retains missing-document warnings and the real backend refusal without an approval receipt", async () => {
      const h = harness(locale, true);
      const message =
        locale === "en"
          ? "Required registration and insurance documents are missing."
          : "必要行照與保險文件尚未齊全。";
      const refusal = {
        response: { error: { code: "SUBMISSION_INCOMPLETE", message } },
      };
      h.approve.mockRejectedValueOnce(refusal);
      await screen.findByText(t("supplyReview.validation.missingDocs", locale));
      await submitThroughActualUi(locale);
      await screen.findByText(message);
      expect(classifySupplyReviewError(refusal).code).toBe(
        "SUBMISSION_INCOMPLETE",
      );
      expect(screen.queryByText("vehicle-env-confirmed")).toBeNull();
    });
  },
);
