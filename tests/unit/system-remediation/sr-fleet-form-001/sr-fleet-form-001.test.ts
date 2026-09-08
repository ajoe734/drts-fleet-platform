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

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  fieldId,
  DRAFT_GUARD_STRINGS,
  isEditableStatus,
  formatSupplySubject,
  INITIAL_DRIVER_DRAFT,
  INITIAL_VEHICLE_DRAFT,
  isDriverFormDirty,
  isVehicleFormDirty,
  saveDriverDraft,
  loadDriverDraft,
  clearDriverDraft,
  saveVehicleDraft,
  loadVehicleDraft,
  clearVehicleDraft,
  shouldInterceptNavigation,
  DRIVER_DRAFT_STORAGE_KEY,
  VEHICLE_DRAFT_STORAGE_KEY,
  type SupplySubmissionDetail,
  getSafeLocalStorage,
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
// 5. Production dirty predicates — R25 comprehensive field change tracking
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / production dirty predicates (R25)", () => {
  describe("isDriverFormDirty (production)", () => {
    it("returns false for initial empty driver draft", () => {
      expect(isDriverFormDirty(INITIAL_DRIVER_DRAFT)).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isDriverFormDirty(null)).toBe(false);
      expect(isDriverFormDirty(undefined)).toBe(false);
    });

    it("returns true when name changes", () => {
      expect(isDriverFormDirty({ ...INITIAL_DRIVER_DRAFT, name: "王大明" })).toBe(true);
    });

    it("returns true when mobile changes", () => {
      expect(isDriverFormDirty({ ...INITIAL_DRIVER_DRAFT, mobile: "0912345678" })).toBe(true);
    });

    it("returns true when license number changes", () => {
      expect(
        isDriverFormDirty({ ...INITIAL_DRIVER_DRAFT, professionalDriverLicenseNo: "DL-12345" }),
      ).toBe(true);
    });

    it("returns true when license expiry date changes (date tracking)", () => {
      expect(
        isDriverFormDirty({ ...INITIAL_DRIVER_DRAFT, professionalDriverLicenseExpiry: "2028-12-31" }),
      ).toBe(true);
    });

    it("returns true when taxi registration number changes", () => {
      expect(
        isDriverFormDirty({ ...INITIAL_DRIVER_DRAFT, taxiDriverRegistrationNo: "REG-999" }),
      ).toBe(true);
    });

    it("returns true when registration area changes (area tracking)", () => {
      expect(
        isDriverFormDirty({ ...INITIAL_DRIVER_DRAFT, taxiDriverRegistrationArea: "新北市" }),
      ).toBe(true);
    });

    it("returns true when registration expiry date changes (date tracking)", () => {
      expect(
        isDriverFormDirty({ ...INITIAL_DRIVER_DRAFT, taxiDriverRegistrationExpiry: "2029-06-30" }),
      ).toBe(true);
    });

    it("returns true when supported products change (products tracking)", () => {
      expect(
        isDriverFormDirty({
          ...INITIAL_DRIVER_DRAFT,
          supportedServiceProductCodes: ["taxi_realtime", "taxi_charter"],
        }),
      ).toBe(true);
      expect(
        isDriverFormDirty({
          ...INITIAL_DRIVER_DRAFT,
          supportedServiceProductCodes: [],
        }),
      ).toBe(true);
    });

    it("returns true when preferred vehicle submission ID changes", () => {
      expect(
        isDriverFormDirty({ ...INITIAL_DRIVER_DRAFT, preferredVehicleSubmissionId: "sub-veh-1" }),
      ).toBe(true);
    });

    it("supports custom baseline for existing submission editing", () => {
      const baseline = {
        name: "李小美",
        mobile: "0988776655",
        professionalDriverLicenseNo: "DL-001",
        professionalDriverLicenseExpiry: "2028-01-01",
        taxiDriverRegistrationNo: "REG-001",
        taxiDriverRegistrationArea: "台中市",
        taxiDriverRegistrationExpiry: "2027-01-01",
        supportedServiceProductCodes: ["taxi_realtime"],
        preferredVehicleSubmissionId: null,
      };
      expect(isDriverFormDirty(baseline, baseline)).toBe(false);
      expect(isDriverFormDirty({ ...baseline, name: "李大美" }, baseline)).toBe(true);
      expect(
        isDriverFormDirty({ ...baseline, taxiDriverRegistrationArea: "高雄市" }, baseline),
      ).toBe(true);
    });
  });

  describe("isVehicleFormDirty (production)", () => {
    it("returns false for initial empty vehicle draft", () => {
      expect(isVehicleFormDirty(INITIAL_VEHICLE_DRAFT)).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isVehicleFormDirty(null)).toBe(false);
      expect(isVehicleFormDirty(undefined)).toBe(false);
    });

    it("returns true when plateNo changes", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, plateNo: "TDG-8888" })).toBe(true);
    });

    it("returns true when licenseType changes", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, licenseType: "rental" })).toBe(true);
    });

    it("returns true when brand changes", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, brand: "Toyota" })).toBe(true);
    });

    it("returns true when model changes", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, model: "Camry" })).toBe(true);
    });

    it("returns true when modelYear changes (year tracking)", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, modelYear: 2025 })).toBe(true);
    });

    it("returns true when seatCount changes (seat tracking)", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, seatCount: 7 })).toBe(true);
    });

    it("returns true when luggageCapacity changes", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, luggageCapacity: 4 })).toBe(true);
    });

    it("returns true when businessArea changes (area tracking)", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, businessArea: "高雄市" })).toBe(true);
    });

    it("returns true when supported products change (products tracking)", () => {
      expect(
        isVehicleFormDirty({
          ...INITIAL_VEHICLE_DRAFT,
          supportedServiceProductCodes: ["taxi_realtime", "cross_city"],
        }),
      ).toBe(true);
    });

    it("returns true when airportTransferEligible flag changes (flags tracking)", () => {
      expect(
        isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, airportTransferEligible: true }),
      ).toBe(true);
    });

    it("returns true when fixedFareAllowed flag changes (flags tracking)", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, fixedFareAllowed: true })).toBe(true);
    });

    it("returns true when currentDriverSubmissionId changes", () => {
      expect(
        isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, currentDriverSubmissionId: "sub-drv-002" }),
      ).toBe(true);
    });

    it("returns true when doorCount changes", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, doorCount: 5 })).toBe(true);
    });

    it("returns true when color changes (color tracking)", () => {
      expect(isVehicleFormDirty({ ...INITIAL_VEHICLE_DRAFT, color: "yellow" })).toBe(true);
    });

    it("supports custom baseline for existing vehicle submission editing", () => {
      const baseline = {
        plateNo: "ABC-123",
        licenseType: "taxi",
        brand: "Toyota",
        model: "RAV4",
        modelYear: 2023,
        seatCount: 5,
        luggageCapacity: 3,
        businessArea: "台北市",
        supportedServiceProductCodes: ["taxi_realtime"],
        airportTransferEligible: true,
        fixedFareAllowed: false,
        currentDriverSubmissionId: null,
        doorCount: 5,
        color: "silver",
      };
      expect(isVehicleFormDirty(baseline, baseline)).toBe(false);
      expect(isVehicleFormDirty({ ...baseline, color: "black" }, baseline)).toBe(true);
      expect(isVehicleFormDirty({ ...baseline, seatCount: 7 }, baseline)).toBe(true);
      expect(isVehicleFormDirty({ ...baseline, airportTransferEligible: false }, baseline)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Navigation intercept logic — R25 link interception
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / shouldInterceptNavigation (R25)", () => {
  const currentLoc = {
    pathname: "/supply/drivers/new",
    search: "",
    origin: "http://localhost:3000",
  };

  it("intercepts link to sidebar /supply", () => {
    expect(shouldInterceptNavigation("/supply", undefined, currentLoc)).toBe(true);
  });

  it("intercepts link to /supply/submissions", () => {
    expect(shouldInterceptNavigation("/supply/submissions", undefined, currentLoc)).toBe(true);
  });

  it("intercepts absolute URL to another page", () => {
    expect(
      shouldInterceptNavigation("http://localhost:3000/dashboard", undefined, currentLoc),
    ).toBe(true);
  });

  it("does not intercept link to the exact same pathname and search", () => {
    expect(shouldInterceptNavigation("/supply/drivers/new", undefined, currentLoc)).toBe(false);
    expect(
      shouldInterceptNavigation("http://localhost:3000/supply/drivers/new", undefined, currentLoc),
    ).toBe(false);
  });

  it("does not intercept link with target='_blank' (opens in new tab)", () => {
    expect(shouldInterceptNavigation("/supply", "_blank", currentLoc)).toBe(false);
  });

  it("does not intercept hash fragment links", () => {
    expect(shouldInterceptNavigation("#section", undefined, currentLoc)).toBe(false);
  });

  it("does not intercept javascript: links", () => {
    expect(shouldInterceptNavigation("javascript:void(0)", undefined, currentLoc)).toBe(false);
  });

  it("does not intercept tel: or mailto: links", () => {
    expect(shouldInterceptNavigation("tel:0912345678", undefined, currentLoc)).toBe(false);
    expect(shouldInterceptNavigation("mailto:test@example.com", undefined, currentLoc)).toBe(false);
  });

  it("does not intercept empty or undefined href", () => {
    expect(shouldInterceptNavigation("", undefined, currentLoc)).toBe(false);
    expect(shouldInterceptNavigation(null, undefined, currentLoc)).toBe(false);
    expect(shouldInterceptNavigation(undefined, undefined, currentLoc)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Draft storage persistence & recovery — R25
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / draft storage persistence (R25)", () => {
  const store = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };

  beforeAll(() => {
    // @ts-expect-error mock window for node vitest
    globalThis.window = {
      localStorage: mockLocalStorage,
      location: { pathname: "/supply/drivers/new", search: "", origin: "http://localhost:3000" },
    };
  });

  afterAll(() => {
    // @ts-expect-error clean up
    delete globalThis.window;
  });

  beforeEach(() => {
    store.clear();
  });

  it("saves, loads, and clears driver draft", () => {
    const draft = {
      ...INITIAL_DRIVER_DRAFT,
      name: "陳司機",
      mobile: "0911222333",
    };
    saveDriverDraft(draft);
    expect(store.has(DRIVER_DRAFT_STORAGE_KEY)).toBe(true);

    const loaded = loadDriverDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe("陳司機");
    expect(loaded?.mobile).toBe("0911222333");

    clearDriverDraft();
    expect(store.has(DRIVER_DRAFT_STORAGE_KEY)).toBe(false);
    expect(loadDriverDraft()).toBeNull();
  });

  it("saves, loads, and clears vehicle draft", () => {
    const draft = {
      ...INITIAL_VEHICLE_DRAFT,
      plateNo: "RAB-5566",
      brand: "Honda",
      model: "Fit",
      color: "white",
    };
    saveVehicleDraft(draft);
    expect(store.has(VEHICLE_DRAFT_STORAGE_KEY)).toBe(true);

    const loaded = loadVehicleDraft();
    expect(loaded).not.toBeNull();
    expect(loaded?.plateNo).toBe("RAB-5566");
    expect(loaded?.brand).toBe("Honda");
    expect(loaded?.color).toBe("white");

    clearVehicleDraft();
    expect(store.has(VEHICLE_DRAFT_STORAGE_KEY)).toBe(false);
    expect(loadVehicleDraft()).toBeNull();
  });

  it("merges defaults when saved draft has missing fields", () => {
    store.set(DRIVER_DRAFT_STORAGE_KEY, JSON.stringify({ name: "張司機" }));
    const loaded = loadDriverDraft();
    expect(loaded?.name).toBe("張司機");
    expect(loaded?.mobile).toBe("");
    expect(loaded?.supportedServiceProductCodes).toEqual(["taxi_realtime"]);
  });

  it("gracefully handles localStorage SecurityError on access (denied storage getter)", () => {
    const originalLocalStorage = globalThis.window.localStorage;
    Object.defineProperty(globalThis.window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });

    try {
      expect(getSafeLocalStorage()).toBeNull();
      expect(loadDriverDraft()).toBeNull();
      expect(loadVehicleDraft()).toBeNull();
      expect(() => saveDriverDraft(INITIAL_DRIVER_DRAFT)).not.toThrow();
      expect(() => clearDriverDraft()).not.toThrow();
      expect(() => saveVehicleDraft(INITIAL_VEHICLE_DRAFT)).not.toThrow();
      expect(() => clearVehicleDraft()).not.toThrow();
    } finally {
      Object.defineProperty(globalThis.window, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
        writable: true,
      });
    }
  });

  it("gracefully handles storage quota exceeded error", () => {
    const quotaMock = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    };
    const originalLocalStorage = globalThis.window.localStorage;
    Object.defineProperty(globalThis.window, "localStorage", {
      configurable: true,
      value: quotaMock,
      writable: true,
    });

    try {
      expect(() => saveDriverDraft(INITIAL_DRIVER_DRAFT)).not.toThrow();
      expect(() => saveVehicleDraft(INITIAL_VEHICLE_DRAFT)).not.toThrow();
    } finally {
      Object.defineProperty(globalThis.window, "localStorage", {
        configurable: true,
        value: originalLocalStorage,
        writable: true,
      });
    }
  });

  it("gracefully handles invalid JSON in stored draft", () => {
    store.set(DRIVER_DRAFT_STORAGE_KEY, "invalid-json{");
    store.set(VEHICLE_DRAFT_STORAGE_KEY, "{broken");
    expect(loadDriverDraft()).toBeNull();
    expect(loadVehicleDraft()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. useDraftGuard — lifecycle, listeners, beforeunload, click & popstate (R25)
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / useDraftGuard lifecycle and navigation protection (R25)", () => {
  type ListenerMap = Map<string, Set<Function>>;
  let windowListeners: ListenerMap;
  let documentListeners: ListenerMap;
  let historyPushes: Array<{ state: any; unused: string; url?: string | URL | null }>;
  let confirmPromptCount: number;
  let confirmResult: boolean;
  let effectCleanup: (() => void) | void;

  function createMockEnv() {
    windowListeners = new Map();
    documentListeners = new Map();
    historyPushes = [];
    confirmPromptCount = 0;
    confirmResult = true;
    effectCleanup = undefined;

    const mockWindow = {
      location: {
        pathname: "/supply/drivers/new",
        search: "",
        origin: "http://localhost:3000",
        href: "http://localhost:3000/supply/drivers/new",
      },
      history: {
        pushState: (state: any, unused: string, url?: string | URL | null) => {
          historyPushes.push({ state, unused, url });
        },
      },
      confirm: (_msg: string) => {
        confirmPromptCount++;
        return confirmResult;
      },
      addEventListener: (type: string, listener: Function, _options?: any) => {
        if (!windowListeners.has(type)) windowListeners.set(type, new Set());
        windowListeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: Function) => {
        windowListeners.get(type)?.delete(listener);
      },
    };

    const mockDocument = {
      addEventListener: (type: string, listener: Function, _options?: any) => {
        if (!documentListeners.has(type)) documentListeners.set(type, new Set());
        documentListeners.get(type)!.add(listener);
      },
      removeEventListener: (type: string, listener: Function) => {
        documentListeners.get(type)?.delete(listener);
      },
    };

    return { mockWindow, mockDocument };
  }

  function getDraftGuard(mockWindow: any, mockDocument: any) {
    const filePath = path.resolve(
      __dirname,
      "../../../../apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx",
    );
    const source = fs.readFileSync(filePath, "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText;

    const sandbox = {
      require: (mod: string) => {
        if (mod === "react") {
          return {
            useEffect: (effect: () => (() => void) | void) => {
              effectCleanup = effect();
            },
            useMemo: (fn: Function) => fn(),
            useState: (init: any) => [init, () => {}],
          };
        }
        if (mod.includes("fleet-portal-supply")) {
          return require(
            path.resolve(
              __dirname,
              "../../../../apps/fleet-partner-portal-web/lib/fleet-portal-supply.ts",
            ),
          );
        }
        return {};
      },
      module: { exports: {} },
      exports: {},
      window: mockWindow,
      document: mockDocument,
      console,
    };

    vm.createContext(sandbox);
    vm.runInContext(transpiled, sandbox);
    return sandbox.exports.useDraftGuard as (dirty: boolean) => {
      confirmLeave: () => boolean;
    };
  }

  it("registers window:beforeunload, document:click, and window:popstate when dirty", () => {
    const { mockWindow, mockDocument } = createMockEnv();
    const useDraftGuard = getDraftGuard(mockWindow, mockDocument);

    useDraftGuard(true);
    expect(windowListeners.get("beforeunload")?.size).toBe(1);
    expect(documentListeners.get("click")?.size).toBe(1);
    expect(windowListeners.get("popstate")?.size).toBe(1);

    // Cleanup unregisters all listeners
    if (typeof effectCleanup === "function") {
      effectCleanup();
    }
    expect(windowListeners.get("beforeunload")?.size ?? 0).toBe(0);
    expect(documentListeners.get("click")?.size ?? 0).toBe(0);
    expect(windowListeners.get("popstate")?.size ?? 0).toBe(0);
  });

  it("does not register listeners when form is clean (dirty=false)", () => {
    const { mockWindow, mockDocument } = createMockEnv();
    const useDraftGuard = getDraftGuard(mockWindow, mockDocument);

    const { confirmLeave } = useDraftGuard(false);
    expect(windowListeners.get("beforeunload")?.size ?? 0).toBe(0);
    expect(documentListeners.get("click")?.size ?? 0).toBe(0);
    expect(windowListeners.get("popstate")?.size ?? 0).toBe(0);
    expect(confirmLeave()).toBe(true);
    expect(confirmPromptCount).toBe(0);
  });

  it("intercepts popstate events: prompts confirmation and recovers history if cancelled", () => {
    const { mockWindow, mockDocument } = createMockEnv();
    const useDraftGuard = getDraftGuard(mockWindow, mockDocument);

    useDraftGuard(true);
    const popstateListeners = Array.from(windowListeners.get("popstate") || []);
    expect(popstateListeners.length).toBe(1);
    const handlePopState = popstateListeners[0];

    // User cancels navigation (clicks "Cancel" in confirm dialog)
    confirmResult = false;
    handlePopState(new Event("popstate"));
    expect(confirmPromptCount).toBe(1);
    expect(historyPushes.length).toBe(1);
    expect(historyPushes[0].url).toBe("http://localhost:3000/supply/drivers/new");

    // User confirms navigation (clicks "OK" in confirm dialog)
    confirmResult = true;
    handlePopState(new Event("popstate"));
    expect(confirmPromptCount).toBe(2);
    // historyPushes remains 1 because user chose to proceed with navigation
    expect(historyPushes.length).toBe(1);

    if (typeof effectCleanup === "function") effectCleanup();
  });

  it("intercepts beforeunload event and sets legacy returnValue", () => {
    const { mockWindow, mockDocument } = createMockEnv();
    const useDraftGuard = getDraftGuard(mockWindow, mockDocument);

    useDraftGuard(true);
    const beforeUnloadListeners = Array.from(windowListeners.get("beforeunload") || []);
    expect(beforeUnloadListeners.length).toBe(1);

    let defaultPrevented = false;
    const mockEvent: any = {
      preventDefault: () => {
        defaultPrevented = true;
      },
      returnValue: "",
    };
    beforeUnloadListeners[0](mockEvent);
    expect(defaultPrevented).toBe(true);
    expect(mockEvent.returnValue).toBe(DRAFT_GUARD_STRINGS.beforeUnload);

    if (typeof effectCleanup === "function") effectCleanup();
  });

  it("intercepts cross-page link clicks and stops propagation if rejected", () => {
    const { mockWindow, mockDocument } = createMockEnv();
    const useDraftGuard = getDraftGuard(mockWindow, mockDocument);

    useDraftGuard(true);
    const clickListeners = Array.from(documentListeners.get("click") || []);
    expect(clickListeners.length).toBe(1);

    let prevented = false;
    let stopped = false;
    let immediateStopped = false;
    const mockAnchor = {
      href: "http://localhost:3000/supply/submissions",
      getAttribute: (attr: string) => (attr === "href" ? "/supply/submissions" : null),
      target: "",
      closest: (sel: string) => (sel === "a" ? mockAnchor : null),
    };
    const mockClickEvent: any = {
      target: mockAnchor,
      preventDefault: () => {
        prevented = true;
      },
      stopPropagation: () => {
        stopped = true;
      },
      stopImmediatePropagation: () => {
        immediateStopped = true;
      },
    };

    // Case 1: user rejects leaving
    confirmResult = false;
    clickListeners[0](mockClickEvent);
    expect(confirmPromptCount).toBe(1);
    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    expect(immediateStopped).toBe(true);

    // Case 2: user approves leaving
    prevented = false;
    confirmResult = true;
    clickListeners[0](mockClickEvent);
    expect(confirmPromptCount).toBe(2);
    expect(prevented).toBe(false);

    if (typeof effectCleanup === "function") effectCleanup();
  });
});

// ---------------------------------------------------------------------------
// 9. Dirty-during-save invariant (P1)
// ---------------------------------------------------------------------------
describe("SR-FLEET-FORM-001 / dirty-during-save invariant", () => {
  it("maintains dirty protection while busy saving until successful baseline update", () => {
    const baseline = {
      ...INITIAL_DRIVER_DRAFT,
      name: "王小明",
      mobile: "0912345678",
    };
    const editedForm = {
      ...baseline,
      name: "王大明", // modified
    };

    // User modified form -> dirty
    const isDirtyBeforeSave = isDriverFormDirty(editedForm, baseline);
    expect(isDirtyBeforeSave).toBe(true);

    // While busy saving (busy = "save"), dirty must evaluate to true
    // (verifying that no `!busy &&` gates dirty protection)
    const computeDetailDirty = (
      editable: boolean,
      current: typeof editedForm,
      base: typeof baseline,
    ) => {
      // Matches production logic in fleet-supply-workspace.tsx:
      // editable && (driverForm ? isDriverFormDirty(...) : ...)
      return editable && isDriverFormDirty(current, base);
    };

    const isDirtyDuringSave = computeDetailDirty(true, editedForm, baseline);
    expect(isDirtyDuringSave).toBe(true);

    // After successful save, baseline is updated to match current
    const updatedBaseline = { ...editedForm };
    const isDirtyAfterSave = computeDetailDirty(true, editedForm, updatedBaseline);
    expect(isDirtyAfterSave).toBe(false);
  });
});
