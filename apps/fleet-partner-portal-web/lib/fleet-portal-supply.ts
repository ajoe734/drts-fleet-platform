import type {
  DriverSupplyDraft,
  SupplyDocumentRecord,
  SupplyReadinessReasonCode,
  SupplySubmissionRecord,
  SupplySubmissionStatus,
  SupplySubmissionType,
  VehicleSupplyDraft,
} from "@drts/contracts";

export type SupplyDataSource = "live" | "fallback";

export type SupplyReviewEvent = {
  eventId: string;
  submissionId: string;
  eventType: string;
  actorId: string;
  actorType: string;
  reasonCode: string | null;
  comment: string | null;
  createdAt: string;
};

export type SupplySubmissionDetail = {
  submission: SupplySubmissionRecord;
  driverDraft: DriverSupplyDraft | null;
  vehicleDraft: VehicleSupplyDraft | null;
  documents: SupplyDocumentRecord[];
  reviewEvents: SupplyReviewEvent[];
};

export type SupplySubjectSummary = {
  title: string;
  subtitle: string;
};

export type SupplyDashboardGroup =
  | "draft"
  | "review"
  | "revision"
  | "approved"
  | "expiring"
  | "not_ready";

export type SupplyDashboardCard = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  status?: SupplySubmissionStatus;
  tone?: "neutral" | "info" | "warn" | "success" | "danger";
  reasons?: SupplyReadinessReasonCode[];
};

export type SupplyDashboardView = {
  groups: Record<SupplyDashboardGroup, SupplyDashboardCard[]>;
  source: SupplyDataSource;
};

export type SupplyDocumentsView = {
  rows: Array<
    SupplyDocumentRecord & {
      submissionStatus: SupplySubmissionStatus;
      submissionType: SupplySubmissionType;
      subject: SupplySubjectSummary;
    }
  >;
  source: SupplyDataSource;
};

export function formatSupplySubject(
  detail: SupplySubmissionDetail,
): SupplySubjectSummary {
  if (detail.driverDraft) {
    return {
      title: detail.driverDraft.name,
      subtitle: detail.driverDraft.mobile,
    };
  }
  if (detail.vehicleDraft) {
    return {
      title: detail.vehicleDraft.plateNo,
      subtitle:
        [detail.vehicleDraft.brand, detail.vehicleDraft.model]
          .filter(Boolean)
          .join(" ") || detail.vehicleDraft.businessArea,
    };
  }
  return {
    title: detail.submission.submissionType,
    subtitle: detail.submission.submissionId,
  };
}

export function isEditableStatus(status: SupplySubmissionStatus) {
  return (
    status === "draft" || status === "needs_revision" || status === "withdrawn"
  );
}

export type DriverDraftInput = Omit<DriverSupplyDraft, "submissionId">;
export type VehicleDraftInput = Omit<VehicleSupplyDraft, "submissionId">;

export const INITIAL_DRIVER_DRAFT: DriverDraftInput = {
  name: "",
  mobile: "",
  professionalDriverLicenseNo: "",
  professionalDriverLicenseExpiry: "",
  taxiDriverRegistrationNo: "",
  taxiDriverRegistrationArea: "",
  taxiDriverRegistrationExpiry: "",
  supportedServiceProductCodes: ["taxi_realtime"],
  preferredVehicleSubmissionId: null,
};

export const INITIAL_VEHICLE_DRAFT: VehicleDraftInput = {
  plateNo: "",
  licenseType: "taxi",
  brand: "",
  model: "",
  modelYear: 2024,
  seatCount: 5,
  luggageCapacity: 2,
  businessArea: "台北市",
  supportedServiceProductCodes: ["taxi_realtime"],
  airportTransferEligible: false,
  fixedFareAllowed: false,
  currentDriverSubmissionId: null,
  doorCount: 4,
  color: "",
};

/**
 * Checks whether a driver form has unsaved modifications against a baseline (R25).
 * Tracks ALL form fields: name, mobile, license numbers & dates, taxi registration
 * numbers & dates & areas, preferred vehicle, and supported service products.
 */
export function isDriverFormDirty(
  current: DriverDraftInput | null | undefined,
  baseline: DriverDraftInput | null | undefined = INITIAL_DRIVER_DRAFT,
): boolean {
  if (!current) return false;
  const base = baseline ?? INITIAL_DRIVER_DRAFT;
  if (current.name !== base.name) return true;
  if (current.mobile !== base.mobile) return true;
  if (current.professionalDriverLicenseNo !== base.professionalDriverLicenseNo) return true;
  if (current.professionalDriverLicenseExpiry !== base.professionalDriverLicenseExpiry) return true;
  if (current.taxiDriverRegistrationNo !== base.taxiDriverRegistrationNo) return true;
  if (current.taxiDriverRegistrationArea !== base.taxiDriverRegistrationArea) return true;
  if (current.taxiDriverRegistrationExpiry !== base.taxiDriverRegistrationExpiry) return true;
  if (current.preferredVehicleSubmissionId !== base.preferredVehicleSubmissionId) return true;

  const currentProducts = current.supportedServiceProductCodes ?? [];
  const baseProducts = base.supportedServiceProductCodes ?? [];
  if (currentProducts.length !== baseProducts.length) return true;
  const sortedCurrent = [...currentProducts].sort();
  const sortedBase = [...baseProducts].sort();
  for (let i = 0; i < sortedCurrent.length; i++) {
    if (sortedCurrent[i] !== sortedBase[i]) return true;
  }

  return false;
}

/**
 * Checks whether a vehicle form has unsaved modifications against a baseline (R25).
 * Tracks ALL form fields: plate number, license type, brand, model, year, seat count,
 * luggage capacity, business area, products, eligibility flags, driver id, doors, and color.
 */
export function isVehicleFormDirty(
  current: VehicleDraftInput | null | undefined,
  baseline: VehicleDraftInput | null | undefined = INITIAL_VEHICLE_DRAFT,
): boolean {
  if (!current) return false;
  const base = baseline ?? INITIAL_VEHICLE_DRAFT;
  if (current.plateNo !== base.plateNo) return true;
  if (current.licenseType !== base.licenseType) return true;
  if ((current.brand ?? "") !== (base.brand ?? "")) return true;
  if ((current.model ?? "") !== (base.model ?? "")) return true;
  if ((current.modelYear ?? null) !== (base.modelYear ?? null)) return true;
  if (current.seatCount !== base.seatCount) return true;
  if (current.luggageCapacity !== base.luggageCapacity) return true;
  if (current.businessArea !== base.businessArea) return true;
  if (Boolean(current.airportTransferEligible) !== Boolean(base.airportTransferEligible)) return true;
  if (Boolean(current.fixedFareAllowed) !== Boolean(base.fixedFareAllowed)) return true;
  if ((current.currentDriverSubmissionId ?? null) !== (base.currentDriverSubmissionId ?? null)) return true;
  if ((current.doorCount ?? null) !== (base.doorCount ?? null)) return true;
  if ((current.color ?? "") !== (base.color ?? "")) return true;

  const currentProducts = current.supportedServiceProductCodes ?? [];
  const baseProducts = base.supportedServiceProductCodes ?? [];
  if (currentProducts.length !== baseProducts.length) return true;
  const sortedCurrent = [...currentProducts].sort();
  const sortedBase = [...baseProducts].sort();
  for (let i = 0; i < sortedCurrent.length; i++) {
    if (sortedCurrent[i] !== sortedBase[i]) return true;
  }

  return false;
}

export const DRIVER_DRAFT_STORAGE_KEY = "drts:fleet:supply:driver_draft";
export const VEHICLE_DRAFT_STORAGE_KEY = "drts:fleet:supply:vehicle_draft";

export function saveDriverDraft(draft: DriverDraftInput): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(DRIVER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore quota or disabled storage error
  }
}

export function loadDriverDraft(): DriverDraftInput | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(DRIVER_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...INITIAL_DRIVER_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

export function clearDriverDraft(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(DRIVER_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore disabled storage error
  }
}

export function saveVehicleDraft(draft: VehicleDraftInput): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(VEHICLE_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Ignore quota or disabled storage error
  }
}

export function loadVehicleDraft(): VehicleDraftInput | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(VEHICLE_DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...INITIAL_VEHICLE_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

export function clearVehicleDraft(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(VEHICLE_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore disabled storage error
  }
}

/**
 * Determines whether clicking a link should trigger the unsaved draft guard (R25).
 * Returns true if the link navigates to a different page/route.
 */
export function shouldInterceptNavigation(
  anchorHref: string | null | undefined,
  anchorTarget: string | null | undefined,
  currentLocation: { pathname: string; search?: string; origin?: string },
): boolean {
  if (!anchorHref) return false;
  if (anchorTarget === "_blank") return false;
  if (
    anchorHref.startsWith("#") ||
    anchorHref.startsWith("javascript:") ||
    anchorHref.startsWith("mailto:") ||
    anchorHref.startsWith("tel:")
  ) {
    return false;
  }

  try {
    const base = currentLocation.origin || "http://localhost";
    const url = new URL(anchorHref, base);
    const currPath = currentLocation.pathname;
    const currSearch = currentLocation.search || "";
    if (url.pathname === currPath && (url.search || "") === currSearch) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Unsaved-draft guard copy used by the new-driver / new-vehicle forms (R25).
 * Kept here so it is discoverable by tests and translators without touching
 * the shared translations.ts (outside this task's write scope).
 */
export const DRAFT_GUARD_STRINGS = {
  /** Shown in the browser's native beforeunload dialog (plain text only). */
  beforeUnload:
    "您有尚未儲存的草稿內容。確定要離開嗎？離開後資料將會遺失。",
  /** Shown in the in-app navigation confirmation dialog. */
  confirmLeaveTitle: "尚未儲存的草稿",
  confirmLeaveBody:
    "表單中有尚未儲存的內容，確定離開嗎？離開後資料將會遺失。",
  confirmLeaveCancel: "繼續填寫",
  confirmLeaveOk: "確定離開",
  confirmDiscard: "確定要放棄未儲存的草稿嗎？所有已填寫的內容將被清除。",
  restoredNotice: "已自動恢復上次未儲存的草稿",
  discardDraft: "放棄草稿",
} as const;

/**
 * Returns a stable `id` string for a named form field within a form context,
 * e.g. `fieldId("new-driver", "name")` → `"form-new-driver-name"`.
 * Used to wire `<label htmlFor>` ↔ `<input id>` for assistive technology (R23).
 */
export function fieldId(form: string, field: string): string {
  return `form-${form}-${field}`;
}
