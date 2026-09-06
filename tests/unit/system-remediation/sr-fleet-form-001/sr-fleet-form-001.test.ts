/**
 * SR-FLEET-FORM-001 — 供給表單可及性及未儲存草稿
 *
 * Unit regression tests for the accessibility and unsaved-draft fixes.
 *
 * Base SHA : b32ab8ba (origin/dev at task start, 2026-09-06)
 * Task gaps : R23 (label/id, contrast), R25 (unsaved-draft warning)
 *
 * Tests cover:
 *  1. fieldId() helper — stable, predictable id strings (R23)
 *  2. DRAFT_GUARD_STRINGS — all required keys present, non-empty, plain-text safe (R25)
 *  3. isEditableStatus() — regression: editable status gate unchanged
 *  4. formatSupplySubject() — regression: subject derivation unchanged
 *  5. Dirty-state logic — logical invariants for the draft guard threshold
 */

import { describe, expect, it } from "vitest";

import {
  fieldId,
  DRAFT_GUARD_STRINGS,
  isEditableStatus,
  formatSupplySubject,
  type SupplySubmissionDetail,
} from "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-supply";

// ---------------------------------------------------------------------------
// 1. fieldId() — R23 label/input linkage
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / fieldId (R23 label-id linkage)", () => {
  it("returns a string with form-<context>-<field> structure", () => {
    expect(fieldId("new-driver", "name")).toBe("form-new-driver-name");
  });

  it("is stable for the same inputs (deterministic)", () => {
    const a = fieldId("new-driver", "mobile");
    const b = fieldId("new-driver", "mobile");
    expect(a).toBe(b);
  });

  it("produces distinct IDs for distinct fields", () => {
    const name = fieldId("new-driver", "name");
    const mobile = fieldId("new-driver", "mobile");
    expect(name).not.toBe(mobile);
  });

  it("produces distinct IDs for the same field in different form contexts", () => {
    const driverMobile = fieldId("new-driver", "mobile");
    const detailMobile = fieldId("detail", "mobile");
    expect(driverMobile).not.toBe(detailMobile);
  });

  it("does not contain spaces (safe as HTML id attribute)", () => {
    const id = fieldId("new-driver", "licenseNo");
    expect(id).not.toMatch(/\s/);
  });

  it("is not empty", () => {
    expect(fieldId("x", "y")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 2. DRAFT_GUARD_STRINGS — R25 unsaved-draft warning copy
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / DRAFT_GUARD_STRINGS (R25 unsaved-draft guard)", () => {
  const keys = [
    "beforeUnload",
    "confirmLeaveTitle",
    "confirmLeaveBody",
    "confirmLeaveCancel",
    "confirmLeaveOk",
  ] as const;

  it("exports all required keys", () => {
    for (const key of keys) {
      expect(DRAFT_GUARD_STRINGS).toHaveProperty(key);
    }
  });

  it("all values are non-empty strings", () => {
    for (const key of keys) {
      const value = DRAFT_GUARD_STRINGS[key];
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it("beforeUnload contains no HTML tags (browser dialog is plain-text only)", () => {
    expect(DRAFT_GUARD_STRINGS.beforeUnload).not.toMatch(/<[a-z]/i);
  });

  it("confirmLeaveOk and confirmLeaveCancel are different strings", () => {
    expect(DRAFT_GUARD_STRINGS.confirmLeaveOk).not.toBe(
      DRAFT_GUARD_STRINGS.confirmLeaveCancel,
    );
  });
});

// ---------------------------------------------------------------------------
// 3. isEditableStatus() — regression: gate must remain unchanged
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / isEditableStatus (regression)", () => {
  it("returns true for draft", () => {
    expect(isEditableStatus("draft")).toBe(true);
  });
  it("returns true for needs_revision", () => {
    expect(isEditableStatus("needs_revision")).toBe(true);
  });
  it("returns true for withdrawn", () => {
    expect(isEditableStatus("withdrawn")).toBe(true);
  });
  it("returns false for submitted", () => {
    expect(isEditableStatus("submitted")).toBe(false);
  });
  it("returns false for in_review", () => {
    expect(isEditableStatus("in_review")).toBe(false);
  });
  it("returns false for approved", () => {
    expect(isEditableStatus("approved")).toBe(false);
  });
  it("returns false for rejected", () => {
    expect(isEditableStatus("rejected")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. formatSupplySubject() — regression: subject derivation unchanged
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / formatSupplySubject (regression)", () => {
  const baseSubmission: SupplySubmissionDetail["submission"] = {
    submissionId: "sub-test-001",
    fleetPartnerId: "fleet-001",
    submissionType: "driver_onboarding",
    status: "draft",
    revisionNo: 0,
    subjectDriverId: null,
    subjectVehicleId: null,
    submittedBy: null,
    submittedAt: null,
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
    createdAt: "2026-09-06T10:00:00.000Z",
    updatedAt: "2026-09-06T10:00:00.000Z",
  };

  it("uses driver name + mobile as title/subtitle when driverDraft present", () => {
    const detail: SupplySubmissionDetail = {
      submission: baseSubmission,
      driverDraft: {
        submissionId: "sub-test-001",
        name: "蔡明憲",
        mobile: "0922-118-446",
        professionalDriverLicenseNo: "A1-2208-44102",
        professionalDriverLicenseExpiry: "2028-03-01",
        taxiDriverRegistrationNo: "TXR-118-2204",
        taxiDriverRegistrationArea: "台北市",
        taxiDriverRegistrationExpiry: "2027-05-10",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      },
      vehicleDraft: null,
      documents: [],
      reviewEvents: [],
    };
    const subject = formatSupplySubject(detail);
    expect(subject.title).toBe("蔡明憲");
    expect(subject.subtitle).toBe("0922-118-446");
  });

  it("uses plateNo + brand+model as title/subtitle when vehicleDraft present", () => {
    const detail: SupplySubmissionDetail = {
      submission: { ...baseSubmission, submissionType: "vehicle_onboarding" },
      driverDraft: null,
      vehicleDraft: {
        submissionId: "sub-test-002",
        plateNo: "KAB-7720",
        licenseType: "taxi",
        brand: "Hyundai",
        model: "Custo",
        modelYear: 2024,
        seatCount: 9,
        luggageCapacity: 6,
        businessArea: "台北市",
        supportedServiceProductCodes: ["taxi_realtime"],
        airportTransferEligible: true,
        fixedFareAllowed: false,
        currentDriverSubmissionId: null,
        doorCount: 4,
        color: "black",
      },
      documents: [],
      reviewEvents: [],
    };
    const subject = formatSupplySubject(detail);
    expect(subject.title).toBe("KAB-7720");
    expect(subject.subtitle).toBe("Hyundai Custo");
  });

  it("falls back to submissionType + submissionId when no draft", () => {
    const detail: SupplySubmissionDetail = {
      submission: baseSubmission,
      driverDraft: null,
      vehicleDraft: null,
      documents: [],
      reviewEvents: [],
    };
    const subject = formatSupplySubject(detail);
    expect(subject.title).toBe("driver_onboarding");
    expect(subject.subtitle).toBe("sub-test-001");
  });
});

// ---------------------------------------------------------------------------
// 5. Dirty-state logic invariants — R25 draft guard threshold
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / dirty-state invariants (R25)", () => {
  function isDriverDirty(
    form: { name: string; mobile: string; professionalDriverLicenseNo: string; taxiDriverRegistrationNo: string },
    submitted: boolean,
  ): boolean {
    return (
      !submitted &&
      (form.name !== "" ||
        form.mobile !== "" ||
        form.professionalDriverLicenseNo !== "" ||
        form.taxiDriverRegistrationNo !== "")
    );
  }

  function isVehicleDirty(
    form: { plateNo: string; brand: string; model: string },
    submitted: boolean,
  ): boolean {
    return !submitted && (form.plateNo !== "" || form.brand !== "" || form.model !== "");
  }

  it("driver form is not dirty on initial empty state", () => {
    expect(
      isDriverDirty(
        { name: "", mobile: "", professionalDriverLicenseNo: "", taxiDriverRegistrationNo: "" },
        false,
      ),
    ).toBe(false);
  });

  it("driver form is dirty once name is typed", () => {
    expect(
      isDriverDirty(
        { name: "A", mobile: "", professionalDriverLicenseNo: "", taxiDriverRegistrationNo: "" },
        false,
      ),
    ).toBe(true);
  });

  it("driver form is not dirty after successful submit (submitted=true)", () => {
    expect(
      isDriverDirty(
        { name: "A", mobile: "0922", professionalDriverLicenseNo: "X", taxiDriverRegistrationNo: "Y" },
        true,
      ),
    ).toBe(false);
  });

  it("vehicle form is not dirty on initial empty state", () => {
    expect(isVehicleDirty({ plateNo: "", brand: "", model: "" }, false)).toBe(false);
  });

  it("vehicle form is dirty once plateNo is typed", () => {
    expect(isVehicleDirty({ plateNo: "KAB-001", brand: "", model: "" }, false)).toBe(true);
  });

  it("vehicle form is not dirty after successful submit (submitted=true)", () => {
    expect(isVehicleDirty({ plateNo: "KAB-001", brand: "Toyota", model: "Sienta" }, true)).toBe(
      false,
    );
  });
});
