import { describe, expect, it } from "vitest";

import {
  buildCompletionExpenseItem,
  getCompletionSubmitBlocker,
  hasCompletionProofEvidence,
  normalizeCompletionProofText,
  parseCompletionExpenseAmountMinor,
  shouldDisableCompleteTripAction,
  shouldReloadTripAfterFailedAction,
} from "../../lib/completion-proof";

describe("completion proof helpers", () => {
  it("normalizes optional proof text fields", () => {
    expect(normalizeCompletionProofText("  signoff-001 ")).toBe("signoff-001");
    expect(normalizeCompletionProofText("   ")).toBeNull();
  });

  it("parses expense amounts into minor units", () => {
    expect(parseCompletionExpenseAmountMinor("40")).toBe(4000);
    expect(parseCompletionExpenseAmountMinor("12.34")).toBe(1234);
    expect(parseCompletionExpenseAmountMinor("0")).toBeNull();
    expect(parseCompletionExpenseAmountMinor("abc")).toBeNull();
  });

  it("builds expense items only when every field is valid", () => {
    expect(
      buildCompletionExpenseItem({
        type: " toll ",
        amountText: "40",
        attachmentId: " receipt-001 ",
      }),
    ).toEqual({
      type: "toll",
      amountMinor: 4000,
      attachmentId: "receipt-001",
    });

    expect(
      buildCompletionExpenseItem({
        type: "toll",
        amountText: "",
        attachmentId: "receipt-001",
      }),
    ).toBeNull();
  });

  it("treats empty proof bundles as missing evidence", () => {
    expect(
      hasCompletionProofEvidence({
        photos: [],
        signatureId: null,
        expenseItems: [],
      }),
    ).toBe(false);
    expect(
      hasCompletionProofEvidence({
        photos: ["proof-photo-001"],
      }),
    ).toBe(true);
  });

  it("keeps canonical proof-negative completion attempts submittable", () => {
    const state = {
      proofRequirementsUnavailable: false,
      missingRequiredPhotos: 2,
      signoffRequirementMissing: true,
      expenseRequirementMissing: true,
      expenseAmountInvalid: false,
      completionBlockedByTracking: false,
    };

    expect(getCompletionSubmitBlocker(state)).toBeNull();
    expect(
      shouldDisableCompleteTripAction({
        ...state,
        submittingAction: null,
      }),
    ).toBe(false);
  });

  it("still blocks completion when the client lacks valid trip state", () => {
    expect(
      getCompletionSubmitBlocker({
        proofRequirementsUnavailable: true,
        missingRequiredPhotos: 0,
        signoffRequirementMissing: false,
        expenseRequirementMissing: false,
        expenseAmountInvalid: false,
        completionBlockedByTracking: false,
      }),
    ).toBe("proof_requirements_unavailable");

    expect(
      getCompletionSubmitBlocker({
        proofRequirementsUnavailable: false,
        missingRequiredPhotos: 0,
        signoffRequirementMissing: false,
        expenseRequirementMissing: false,
        expenseAmountInvalid: true,
        completionBlockedByTracking: false,
      }),
    ).toBe("expense_amount_invalid");

    expect(
      shouldDisableCompleteTripAction({
        proofRequirementsUnavailable: false,
        missingRequiredPhotos: 0,
        signoffRequirementMissing: false,
        expenseRequirementMissing: false,
        expenseAmountInvalid: false,
        completionBlockedByTracking: true,
        submittingAction: null,
      }),
    ).toBe(true);
  });

  it("reloads trip state only after failed completion attempts", () => {
    expect(shouldReloadTripAfterFailedAction("complete")).toBe(true);
    expect(shouldReloadTripAfterFailedAction("depart")).toBe(false);
  });
});
