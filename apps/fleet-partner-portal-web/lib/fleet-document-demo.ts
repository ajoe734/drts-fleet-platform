import type {
  SupplyDocumentType,
  SupplySubmissionStatus,
} from "@drts/contracts";

// Independent illustrative records: no File bytes, provider identifiers,
// checksums, scan receipts or production submission/document contracts.
export const FLEET_DOCUMENT_DEMO_KEY = "fleet-document-SIMULATION-v1";
export const fleetDocumentExamples = [
  {
    id: "vehicle_registration",
    documentType: "vehicle_registration",
    originalFileName: "SIMULATION-vehicle-registration.pdf",
    contentType: "application/pdf",
    fileSize: 2048,
  },
  {
    id: "other",
    documentType: "other",
    originalFileName: "SIMULATION-sample-document.png",
    contentType: "image/png",
    fileSize: 1024,
  },
] as const satisfies ReadonlyArray<{
  id: string;
  documentType: SupplyDocumentType;
  originalFileName: string;
  contentType: string;
  fileSize: number;
}>;

export type ExampleId = (typeof fleetDocumentExamples)[number]["id"];
export type ExternalStatus = "idle" | "pending" | "failed" | "skipped";
export type StorageStatus = ExternalStatus | "simulated_stored";
export type ScannerStatus = ExternalStatus | "simulated_pass";
export type DemoSubmissionStatus = Extract<
  SupplySubmissionStatus,
  "draft" | "submitted" | "withdrawn"
>;
export const documentDemoActions = [
  "select.vehicle_registration",
  "select.other",
  "storage.start",
  "storage.fail",
  "storage.retry",
  "storage.succeed",
  "storage.skip",
  "scanner.start",
  "scanner.fail",
  "scanner.retry",
  "scanner.succeed",
  "scanner.skip",
  "document.confirm",
  "submission.submit",
  "submission.withdraw",
  "submission.resubmit",
] as const;
export type DocumentDemoAction = (typeof documentDemoActions)[number];

export interface DocumentDemoState {
  version: 1;
  simulation: true;
  exampleId: ExampleId | null;
  storage: { status: StorageStatus; attempts: number };
  scanner: { status: ScannerStatus; attempts: number };
  confirmed: boolean;
  submission: DemoSubmissionStatus;
  events: { simulation: true; action: DocumentDemoAction; at: string }[];
}

export function createDocumentDemoState(): DocumentDemoState {
  return {
    version: 1,
    simulation: true,
    exampleId: null,
    storage: { status: "idle", attempts: 0 },
    scanner: { status: "idle", attempts: 0 },
    confirmed: false,
    submission: "draft",
    events: [],
  };
}

export function transitionDocumentDemo(
  state: DocumentDemoState,
  action: DocumentDemoAction,
  at: string,
): DocumentDemoState {
  let next = state;
  const editable = !state.confirmed && state.submission === "draft";
  const storageResolved =
    state.storage.status === "simulated_stored" ||
    state.storage.status === "skipped";
  const scannerResolved =
    state.scanner.status === "simulated_pass" ||
    state.scanner.status === "skipped";
  if (action === "select.vehicle_registration" || action === "select.other") {
    if (editable) {
      next = {
        ...createDocumentDemoState(),
        exampleId: action === "select.other" ? "other" : "vehicle_registration",
      };
    }
  } else if (editable && state.exampleId) {
    if (
      (action === "storage.start" && state.storage.status === "idle") ||
      (action === "storage.retry" && state.storage.status === "failed")
    ) {
      next = {
        ...state,
        storage: { status: "pending", attempts: state.storage.attempts + 1 },
      };
    } else if (
      (action === "storage.fail" || action === "storage.succeed") &&
      state.storage.status === "pending"
    ) {
      next = {
        ...state,
        storage: {
          ...state.storage,
          status: action === "storage.fail" ? "failed" : "simulated_stored",
        },
      };
    } else if (action === "storage.skip" && !storageResolved) {
      next = { ...state, storage: { ...state.storage, status: "skipped" } };
    } else if (
      state.storage.status === "simulated_stored" &&
      ((action === "scanner.start" && state.scanner.status === "idle") ||
        (action === "scanner.retry" && state.scanner.status === "failed"))
    ) {
      next = {
        ...state,
        scanner: { status: "pending", attempts: state.scanner.attempts + 1 },
      };
    } else if (
      (action === "scanner.fail" || action === "scanner.succeed") &&
      state.scanner.status === "pending"
    ) {
      next = {
        ...state,
        scanner: {
          ...state.scanner,
          status: action === "scanner.fail" ? "failed" : "simulated_pass",
        },
      };
    } else if (
      action === "scanner.skip" &&
      storageResolved &&
      !scannerResolved
    ) {
      next = { ...state, scanner: { ...state.scanner, status: "skipped" } };
    } else if (
      action === "document.confirm" &&
      storageResolved &&
      scannerResolved
    ) {
      next = { ...state, confirmed: true };
    }
  }
  if (state.confirmed) {
    if (
      (action === "submission.submit" && state.submission === "draft") ||
      (action === "submission.resubmit" && state.submission === "withdrawn")
    ) {
      next = { ...state, submission: "submitted" };
    } else if (
      action === "submission.withdraw" &&
      state.submission === "submitted"
    ) {
      next = { ...state, submission: "withdrawn" };
    }
  }
  return next === state
    ? state
    : {
        ...next,
        events: [...state.events, { simulation: true, action, at }],
      };
}

// Replay only this demo's valid action history. Never hydrate production
// records or interpret a saved "clean" scanner outcome as a demo result.
export function restoreDocumentDemo(raw: string | null): DocumentDemoState {
  const empty = createDocumentDemoState();
  if (!raw) return empty;
  try {
    const saved = JSON.parse(raw);
    if (
      saved.version !== 1 ||
      saved.simulation !== true ||
      !Array.isArray(saved.events)
    )
      return empty;
    let state = empty;
    for (const event of saved.events) {
      if (
        event?.simulation !== true ||
        typeof event.at !== "string" ||
        !documentDemoActions.includes(event.action)
      )
        return empty;
      const next = transitionDocumentDemo(state, event.action, event.at);
      if (next === state) return empty;
      state = next;
    }
    return state;
  } catch {
    return empty;
  }
}

export function exportDocumentDemo(state: DocumentDemoState): string {
  return JSON.stringify(
    {
      notice:
        "SIMULATION ONLY: example metadata and local illustrative submission. No file stored, scanner executed, provider receipt issued or real submission changed. Skipped steps remain skipped.",
      ...state,
      exampleMetadata:
        fleetDocumentExamples.find((item) => item.id === state.exampleId) ??
        null,
    },
    null,
    2,
  );
}
