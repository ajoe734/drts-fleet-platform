import type {
  APIResponse,
  BrowserContext,
  Page,
  Route,
} from "@playwright/test";
import type { RunFinalizer } from "./run-finalization";
import { createHash } from "node:crypto";
import {
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
  type ResolveComplaintCaseCommand,
  type TransferCallToComplaintCommand,
} from "@drts/contracts";
import {
  camelWire,
  NativeTransport,
  text,
  records,
  JourneyFailure,
  object,
  requireFact,
  type CallResult,
  type ObjectData,
} from "./protocol";

// The original FULL caller/finalizer supplies these observed ports.
// No credentials, browser, role issuance, booking or recording producer here.
export type R08OpsProof = {
  origin: string;
  runtimeSha: string;
  callcenterServedSha: string;
  transportRuntimeSha: string;
  browser: {
    runtimeSha: string;
    active: boolean;
    identity: R08OpsProof["identity"];
  };
  controlRole: "ops" | "opsApi";
  bffStatus: number;
  callcenterPageStatus: number;
  active: boolean;
  identity: {
    realm: string;
    actorType: string;
    authMode: string;
    actorId: string;
    principalId: string;
    membershipId: string;
    sessionId: string;
  };
};
export type R08Canonical = {
  // Caller reads the original canonical order and qualified supply. Include
  // their stable custody projection, not changing timestamps or credentials.
  order: ObjectData & { orderId: string; status: string };
  supply: ObjectData & { driverId: string; vehicleId: string; known: boolean };
};
export type R08Owned = {
  callId: string;
  recordingId: string;
  callbackTaskId: string;
  orderId: string;
};
export type R08Command = {
  path: string;
  rawBody: string;
  // Only non-secret content headers. H692's actual SDK omits Idempotency-Key.
  headers: Record<string, string>;
  bodySha256: string;
};
export type R08Custody = R08Owned & {
  caseNo?: string;
  command?: R08Command;
  transfer: "not-captured" | "ack-unknown" | "acknowledged";
  replay: "not-attempted" | "ack-unknown" | "verified";
  cleanup: "not-attempted" | "unknown" | "verified";
  unresolved: string[];
  recording: "synthetic-index-only";
  finalizeRecording: { dedupeKey: string; status: "unobserved-retained" };
};
export type R08Ports = {
  // Re-read/compare the caller's genuine canonical Ops BFF proof. Never use a
  // direct API fallback. Neither this proof nor checkpoints contain JWT/cookies.
  proof(): Promise<R08OpsProof>;
  // Normal role=ops NativeTransport GET, unwrapped data and runtime headers.
  get(path: string): Promise<CallResult>;
  // The caller's same BFF/session, finalizer-guarded transport, single fetch,
  // existing 15s deadline, no redirects/retries. MUST send rawBody verbatim.
  // NativeTransport.call JSON-stringifies: do not pass rawBody as its body.
  postRaw(command: R08Command): Promise<CallResult>;
  canonical(): Promise<R08Canonical>;
  checkpoint(custody: R08Custody): Promise<void>;
};
type UiResponse = {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  body(): Promise<Buffer>;
};
export type R08UiRoute<Response extends UiResponse> = {
  request(): {
    method(): string;
    url(): string;
    postData(): string | null;
    headers(): Record<string, string>;
  };
  fetch(options: {
    maxRedirects: 0;
    maxRetries: 0;
    timeout: 15000;
  }): Promise<Response>;
  fulfill(options: { response: Response; body: Buffer }): Promise<void>;
};

const prefix = "/control-plane-proxy";
const copy = <T>(value: T): T => structuredClone(value);
const digest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
};

export function assertR08OpsProof(
  proof: R08OpsProof,
  expected: R08OpsProof = proof,
) {
  const i = proof.identity;
  const origin = new URL(proof.origin);
  requireFact(
    origin.protocol === "https:" &&
      origin.origin === proof.origin &&
      /^[a-f0-9]{40}$/.test(proof.runtimeSha) &&
      proof.callcenterServedSha === proof.runtimeSha &&
      proof.transportRuntimeSha === proof.runtimeSha &&
      proof.browser?.runtimeSha === proof.runtimeSha &&
      proof.browser.active === true &&
      stable(proof.browser.identity) === stable(i) &&
      proof.controlRole === "ops" &&
      proof.bffStatus === 200 &&
      proof.callcenterPageStatus === 200 &&
      proof.active &&
      i.realm === "ops" &&
      i.actorType === "ops_user" &&
      i.authMode === "jwt_bearer" &&
      i.actorId === i.principalId &&
      !!i.principalId &&
      !!i.membershipId &&
      !!i.sessionId &&
      stable(proof) === stable(expected),
    "r08-same-canonical-ops-first-party-bff-runtime",
  );
}

/** Own original UI transfer, one exact replay and bounded normal terminalization.
 * A new instance is NOT a restart journal; later finalizer wiring must retain
 * this custody and never instantiate a replacement after an unknown ACK. */
export class R08Callcenter {
  private readonly expected: {
    proof: R08OpsProof;
    canonical: R08Canonical;
    owned: R08Owned;
    intent: TransferCallToComplaintCommand;
  };
  private readonly state: R08Custody;
  private captureStarted = false;
  private replayEligible = false;
  private replayStarted = false;
  private cleanupStarted = false;

  constructor(
    expected: {
      proof: R08OpsProof;
      canonical: R08Canonical;
      owned: R08Owned;
      intent: TransferCallToComplaintCommand;
    },
    private readonly ports: R08Ports,
  ) {
    this.expected = copy(expected);
    this.state = {
      ...copy(expected.owned),
      transfer: "not-captured",
      replay: "not-attempted",
      cleanup: "not-attempted",
      unresolved: [],
      recording: "synthetic-index-only",
      finalizeRecording: {
        dedupeKey: `finalize_recording:call:${expected.owned.callId}`,
        status: "unobserved-retained",
      },
    };
    this.assertProof(expected.proof);
    requireFact(
      Object.values(expected.owned).every((id) => !!id) &&
        expected.canonical.order.orderId === expected.owned.orderId &&
        expected.canonical.order.status === "completed" &&
        expected.canonical.supply.known === true &&
        !!expected.canonical.supply.driverId &&
        !!expected.canonical.supply.vehicleId &&
        (expected.intent.relatedOrderId ?? expected.owned.orderId) ===
          expected.owned.orderId,
      "r08-existing-completed-order-and-known-supply",
    );
  }

  snapshot(): R08Custody {
    return copy(this.state);
  }

  private assertProof(proof: R08OpsProof) {
    assertR08OpsProof(proof, this.expected.proof);
  }

  private async guard() {
    this.assertProof(await this.ports.proof());
    const canonical = await this.ports.canonical();
    requireFact(
      canonical.order.status === "completed" &&
        canonical.supply.known === true &&
        stable(canonical) === stable(this.expected.canonical),
      "r08-completed-order-or-supply-drift",
    );
  }

  private async checkpoint() {
    await this.ports.checkpoint(this.snapshot());
  }

  private async unknown(reason: string) {
    if (!this.state.unresolved.includes(reason))
      this.state.unresolved.push(reason);
    await this.checkpoint();
  }

  private path() {
    return `${prefix}/callcenter/sessions/${encodeURIComponent(this.state.callId)}`;
  }

  private checked(result: CallResult, post = false): ObjectData {
    requireFact(
      (result.status === 200 || (post && result.status === 201)) &&
        result.headers.get("x-drts-candidate-sha") ===
          this.expected.proof.runtimeSha,
      "r08-normal-bff-ack-runtime",
    );
    return object(result.data);
  }

  private assertCallback(value: unknown) {
    const task = object(value);
    requireFact(
      task.callbackTaskId === this.state.callbackTaskId &&
        task.callId === this.state.callId &&
        task.linkedOrderId === this.state.orderId &&
        task.linkedCaseNo === (this.state.caseNo ?? null),
      "r08-same-callback-tuple",
    );
    return task;
  }

  private assertCall(value: unknown) {
    const call = object(value);
    requireFact(
      call.callId === this.state.callId &&
        call.recordingId === this.state.recordingId &&
        call.recordingState === "ready" &&
        call.linkedOrderId === this.state.orderId &&
        call.linkedCaseNo === (this.state.caseNo ?? null),
      "r08-same-call-recording-order-case",
    );
    this.assertCallback(call.callbackTask);
    return call;
  }

  private assertCase(value: unknown) {
    const item = object(value);
    const intent = this.expected.intent;
    requireFact(
      item.caseNo === this.state.caseNo &&
        item.caseSource === "phone" &&
        item.relatedCallId === this.state.callId &&
        item.relatedOrderId === this.state.orderId &&
        item.category === intent.category &&
        item.severity === intent.severity &&
        item.description === intent.description,
      "r08-same-phone-case-intent",
    );
    return item;
  }

  private acceptTransfer(data: ObjectData) {
    const item = object(data.complaintCase);
    requireFact(
      typeof item.caseNo === "string" &&
        !!item.caseNo &&
        item.caseSource === "phone" &&
        item.relatedCallId === this.state.callId &&
        item.relatedOrderId === this.state.orderId,
      "r08-owned-case-id",
    );
    if (!this.state.caseNo) this.state.caseNo = item.caseNo;
    this.assertCase(item);
    this.assertCall(data.session);
  }

  /** Attach to the exact first UI POST before its navigation-causing ACK. The
   * caller must abort an intercepted request on failure; never route.continue. */
  async capture<Response extends UiResponse>(route: R08UiRoute<Response>) {
    requireFact(!this.captureStarted, "r08-no-second-ui-command");
    this.captureStarted = true;
    try {
      await this.guard();
      const request = route.request();
      const rawBody = request.postData();
      const headers = new Headers(request.headers());
      requireFact(
        request.method() === "POST" &&
          request.url() ===
            `${this.expected.proof.origin}${this.path()}/transfer-to-complaint` &&
          rawBody !== null &&
          Buffer.byteLength(rawBody) <= 65536 &&
          !headers.has("idempotency-key") &&
          /^application\/json(?:\s*;|$)/i.test(
            headers.get("content-type") ?? "",
          ),
        "r08-exact-original-ui-post-absent-key",
      );
      const body = object(JSON.parse(rawBody));
      requireFact(
        stable(body) === stable(this.expected.intent) &&
          (body.relatedOrderId ?? this.state.orderId) === this.state.orderId,
        "r08-original-ui-intent",
      );
      // The completed-order/index producer is the caller's responsibility.
      // Read its actual canonical call immediately before forwarding, so an
      // omitted relatedOrderId cannot silently use a different effective order.
      const originalCall = this.assertCall(
        this.checked(await this.ports.get(this.path())),
      );
      requireFact(originalCall.status === "active", "r08-original-active-call");
      this.state.command = {
        path: `${this.path()}/transfer-to-complaint`,
        rawBody,
        headers: { "Content-Type": headers.get("content-type")! },
        bodySha256: digest(rawBody),
      };
      this.state.transfer = "ack-unknown";
      await this.checkpoint(); // Exact intent and known IDs BEFORE forwarding.
      this.replayEligible = true;
      const response = await route.fetch({
        maxRedirects: 0,
        maxRetries: 0,
        timeout: 15000,
      });
      // A known BFF denial or foreign runtime is not an uncertain business ACK
      // and cannot authorize a resend, even if an older proof was successful.
      if (
        ![200, 201].includes(response.status()) ||
        new Headers(response.headers()).get("x-drts-candidate-sha") !==
          this.expected.proof.runtimeSha ||
        response.url() !== request.url()
      ) {
        this.replayEligible = false;
        requireFact(false, "r08-original-ui-bff-denial-or-runtime");
      }
      const bytes = await response.body();
      requireFact(bytes.length <= 1024 * 1024, "r08-bounded-ui-response");
      const payload = object(camelWire(JSON.parse(bytes.toString("utf8"))));
      if (payload.data === undefined || payload.error !== undefined)
        this.replayEligible = false;
      requireFact(
        response.url() === request.url() &&
          payload.data !== undefined &&
          payload.error === undefined,
        "r08-ui-success-envelope",
      );
      this.acceptTransfer(
        this.checked(
          {
            status: response.status(),
            headers: new Headers(response.headers()),
            data: payload.data,
            bytes,
          },
          true,
        ),
      );
      this.state.transfer = "acknowledged";
      await this.checkpoint(); // Capture success/IDs BEFORE UI can navigate.
      await route.fulfill({ response, body: bytes });
      await this.guard();
    } catch (error) {
      await this.unknown("original-ui-transfer-unverified");
      throw error;
    }
  }

  private async readTuple() {
    this.assertCall(this.checked(await this.ports.get(this.path())));
    const callbacks = this.checked(
      await this.ports.get(`${prefix}/callcenter/callbacks`),
    );
    requireFact(Array.isArray(callbacks.items), "r08-callback-queue-items");
    const ownCallbacks = callbacks.items.filter(
      (item) => object(item).callbackTaskId === this.state.callbackTaskId,
    );
    requireFact(ownCallbacks.length === 1, "r08-one-own-callback");
    this.assertCallback(ownCallbacks[0]);
    const cases = this.checked(await this.ports.get(`${prefix}/complaints`));
    requireFact(Array.isArray(cases.items), "r08-complaint-list-items");
    const phone = cases.items.filter(
      (item) =>
        object(item).caseSource === "phone" &&
        object(item).relatedCallId === this.state.callId,
    );
    requireFact(phone.length === 1, "r08-exactly-one-phone-case-for-call");
    this.assertCase(phone[0]);
    this.assertCase(
      this.checked(
        await this.ports.get(
          `${prefix}/complaints/${encodeURIComponent(this.state.caseNo!)}`,
        ),
      ),
    );
    await this.guard();
  }

  async replay() {
    requireFact(
      !this.replayStarted && this.replayEligible && !!this.state.command,
      "r08-one-original-replay-only",
    );
    this.replayStarted = true;
    try {
      await this.guard();
      this.state.replay = "ack-unknown";
      await this.checkpoint(); // Never replay again if ACK/checkpoint is unknown.
      this.acceptTransfer(
        this.checked(await this.ports.postRaw(copy(this.state.command)), true),
      );
      await this.checkpoint();
      await this.readTuple();
      // A recovered unknown original ACK still requires the same exact replay
      // and canonical tuple. No new call, case command, key or body is minted.
      this.state.transfer = "acknowledged";
      this.state.replay = "verified";
      this.state.unresolved = this.state.unresolved.filter(
        (item) => item !== "original-ui-transfer-unverified",
      );
      await this.checkpoint();
    } catch (error) {
      this.state.replay = "ack-unknown";
      await this.unknown("original-replay-unverified");
      throw error;
    }
  }

  // Read-only recovery of an interrupted original command, never another
  // transfer. Only the exact owned call's canonical link can supply its case.
  async reconcileOwnTransfer() {
    if (this.state.caseNo || !this.state.command) return;
    await this.guard();
    const session = this.checked(await this.ports.get(this.path()));
    const caseNo = text(session.linkedCaseNo);
    const complaintCase = this.checked(
      await this.ports.get(
        `${prefix}/complaints/${encodeURIComponent(caseNo)}`,
      ),
    );
    this.acceptTransfer({ session, complaintCase });
    await this.checkpoint();
  }

  /** To be called by the original finalizer BEFORE own Ops session revocation.
   * Retains audit rows and finalize_recording queue; no broad cleanup. */
  async cleanup(command: ResolveComplaintCaseCommand) {
    requireFact(!this.cleanupStarted, "r08-cleanup-at-most-once");
    this.cleanupStarted = true;
    this.state.cleanup = "unknown";
    try {
      requireFact(
        !!this.state.caseNo &&
          !!command.closingNote.trim() &&
          COMPLAINT_CATEGORY_VALID_RESOLUTIONS[
            this.expected.intent.category
          ].includes(command.resolutionCode),
        "r08-known-own-case-valid-close",
      );
      await this.checkpoint();
      await this.guard();
      await this.readTuple();
      const post = async (path: string, body: unknown) => {
        await this.guard();
        await this.checkpoint();
        const rawBody = JSON.stringify(body);
        this.checked(
          await this.ports.postRaw({
            path,
            rawBody,
            headers: { "Content-Type": "application/json" },
            bodySha256: digest(rawBody),
          }),
          true,
        );
        await this.guard();
      };
      const callback = this.assertCallback(
        object(this.checked(await this.ports.get(this.path()))).callbackTask,
      );
      if (callback.status !== "cancelled") {
        requireFact(
          ["pending", "claimed", "in_progress"].includes(
            String(callback.status),
          ),
          "r08-callback-normal-cancel-state",
        );
        await post(
          `${prefix}/callcenter/callbacks/${encodeURIComponent(this.state.callbackTaskId)}/cancel`,
          { reason: command.closingNote },
        );
      }
      const queue = this.checked(
        await this.ports.get(`${prefix}/callcenter/callbacks`),
      );
      requireFact(Array.isArray(queue.items), "r08-callback-queue-items");
      const own = queue.items.filter(
        (item) => object(item).callbackTaskId === this.state.callbackTaskId,
      );
      requireFact(
        own.length === 1 &&
          this.assertCallback(own[0]).status === "cancelled" &&
          this.assertCallback(
            this.checked(await this.ports.get(this.path())).callbackTask,
          ).status === "cancelled",
        "r08-callback-terminal-readback",
      );
      const casePath = `${prefix}/complaints/${encodeURIComponent(this.state.caseNo!)}`;
      if (
        this.assertCase(this.checked(await this.ports.get(casePath))).status !==
        "closed"
      )
        await post(`${casePath}/close`, command);
      requireFact(
        this.assertCase(this.checked(await this.ports.get(casePath))).status ===
          "closed",
        "r08-case-terminal-readback",
      );
      if (
        this.assertCall(this.checked(await this.ports.get(this.path())))
          .status !== "closed"
      )
        await post(`${this.path()}/close`, {});
      requireFact(
        this.assertCall(this.checked(await this.ports.get(this.path())))
          .status === "closed",
        "r08-call-terminal-readback",
      );
      await this.readTuple();
      this.state.cleanup = "verified";
      await this.checkpoint();
    } catch (error) {
      this.state.cleanup = "unknown";
      await this.unknown("normal-owned-cleanup-unverified");
      throw error;
    }
  }
}

export type R08RunCustody = {
  recording: "synthetic-index-only";
  finalizeRecording?: R08Custody["finalizeRecording"];
  orderId: string;
  callId?: string;
  recordingId: string;
  callbackTaskId?: string;
  producers: {
    step: string;
    command: R08Command;
    ack: "ack-unknown" | "acknowledged";
  }[];
  transfer?: R08Custody;
  result: "in-progress" | "failed" | "verified";
  cleanup: "not-attempted" | "unknown" | "verified";
};

/** Existing FULL's last extension. Uses its normal Ops issuer, browser context,
 * canonical order/supply reader, and original finalizer. No product fetcher,
 * booking, role, workflow, retry or runtime is created here. */
export class R08ExistingFull {
  private readonly state: R08RunCustody;
  private page?: Page;
  private helper?: R08Callcenter;
  private expectedProof?: R08OpsProof;
  private expectedCanonical?: R08Canonical;
  private cleanupStarted = false;
  private closed = false;
  private pending:
    | {
        started: boolean;
        path: string;
        intent?: ObjectData;
        accept: (value: ObjectData) => void;
        resolve: () => void;
        reject: (error: unknown) => void;
      }
    | undefined;
  private readonly path = `${prefix}/callcenter/sessions`;
  constructor(
    private readonly ports: {
      context: BrowserContext;
      tx: NativeTransport;
      finalizer: RunFinalizer;
      origin: string;
      runtimeSha: string;
      controlRole: "ops" | "opsApi";
      orderId: string;
      phone: string;
      nonce: string;
      canonical: () => Promise<R08Canonical>;
    },
  ) {
    this.state = {
      orderId: ports.orderId,
      recording: "synthetic-index-only",
      recordingId: `${ports.nonce}-SYNTHETIC-INDEX-ONLY`,
      producers: [],
      result: "in-progress",
      cleanup: "not-attempted",
    };
  }
  snapshot(): R08RunCustody {
    return copy(this.state);
  }
  private async save() {
    if (this.state.callId)
      this.state.finalizeRecording = {
        dedupeKey: `finalize_recording:call:${this.state.callId}`,
        status: "unobserved-retained",
      };
    if (this.helper) this.state.transfer = this.helper.snapshot();
    await this.ports.finalizer.checkpointOwned("r08-own-call-custody");
  }
  private checked(
    status: number,
    headers: Headers,
    bytes: Buffer,
    url: string,
    expectedUrl: string,
    raw = false,
  ): CallResult {
    requireFact(
      url === expectedUrl &&
        [200, 201].includes(status) &&
        headers.get("x-drts-candidate-sha") === this.ports.runtimeSha &&
        bytes.length <= 1024 * 1024,
      "r08-browser-bff-origin-status-runtime-size",
    );
    if (raw) return { status, headers, bytes, data: null };
    const envelope = object(camelWire(JSON.parse(bytes.toString("utf8"))));
    requireFact(
      envelope.data !== undefined && envelope.error === undefined,
      "r08-browser-bff-success-envelope",
    );
    return { status, headers, bytes, data: envelope.data };
  }
  private request(path: string, command?: R08Command, raw = false) {
    return this.ports.finalizer.guardOperation(async () => {
      const url = `${this.ports.origin}${path}`;
      // Explicit per-request headers, exact first-party origin only. The
      // browser's shared APIRequestContext supplies its own same cookies.
      const response = await this.ports.context.request.fetch(url, {
        method: command ? "POST" : "GET",
        headers: {
          ...this.ports.tx.headers("ops", url),
          ...(command?.headers ?? {}),
        },
        ...(command ? { data: Buffer.from(command.rawBody, "utf8") } : {}),
        timeout: 15_000,
        maxRedirects: 0,
        maxRetries: 0,
      });
      try {
        return this.checked(
          response.status(),
          new Headers(response.headers()),
          await response.body(),
          response.url(),
          url,
          raw,
        );
      } finally {
        await response.dispose();
      }
    });
  }
  private identity(value: unknown): R08OpsProof["identity"] {
    const i = object(value);
    return {
      realm: text(i.realm),
      actorType: text(i.actorType),
      authMode: text(i.authMode),
      actorId: text(i.actorId),
      principalId: text(i.principalId),
      membershipId: text(i.membershipId),
      sessionId: text(i.sessionId),
    };
  }
  private async proof(): Promise<R08OpsProof> {
    const page = await this.request("/callcenter", undefined, true);
    const browser = await this.request(`${prefix}/auth/session`);
    const transport = await this.ports.tx.call("opsApi", "/api/auth/session");
    return {
      origin: this.ports.origin,
      runtimeSha: this.ports.runtimeSha,
      callcenterPageStatus: page.status,
      callcenterServedSha: page.headers.get("x-drts-candidate-sha") ?? "",
      bffStatus: browser.status,
      controlRole: this.ports.controlRole,
      transportRuntimeSha: transport.headers.get("x-drts-candidate-sha") ?? "",
      active: object(transport.data).active === true,
      identity: this.identity(object(transport.data).identity),
      browser: {
        runtimeSha: browser.headers.get("x-drts-candidate-sha") ?? "",
        active: object(browser.data).active === true,
        identity: this.identity(object(browser.data).identity),
      },
    };
  }
  private async guard() {
    requireFact(
      this.expectedProof && this.expectedCanonical,
      "r08-initial-observations-required",
    );
    requireFact(
      stable(await this.proof()) === stable(this.expectedProof),
      "r08-actual-browser-transport-proof-drift",
    );
    requireFact(
      stable(await this.ports.canonical()) === stable(this.expectedCanonical),
      "r08-completed-order-or-supply-drift",
    );
  }
  private sessionPath() {
    return `${this.path}/${encodeURIComponent(text(this.state.callId))}`;
  }
  private async route(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== this.ports.origin) return route.continue();
    try {
      await this.ports.finalizer.guardOperation(async (assertOpen) => {
        requireFact(!this.closed, "r08-ui-command-closed");
        const pending = this.pending;
        if (request.method() === "POST") {
          requireFact(
            !this.closed &&
              pending &&
              !pending.started &&
              url.pathname === pending.path,
            "r08-no-unowned-ui-post",
          );
          pending.started = true;
          await this.guard();
          assertOpen();
          requireFact(!this.closed, "r08-ui-command-closed");
          if (this.helper && url.pathname.endsWith("/transfer-to-complaint")) {
            let apiResponse: APIResponse | undefined;
            try {
              await this.helper.capture({
                request: () => request,
                fetch: async (options) => {
                  apiResponse = await route.fetch({
                    ...options,
                    headers: {
                      ...request.headers(),
                      ...this.ports.tx.headers("ops", request.url()),
                    },
                  });
                  const response = apiResponse;
                  return {
                    url: () => response.url(),
                    status: () => response.status(),
                    headers: () => response.headers(),
                    body: () =>
                      this.ports.finalizer.guardOperation(async (check) => {
                        const bytes = await response.body();
                        check();
                        requireFact(!this.closed, "r08-ui-command-closed");
                        return bytes;
                      }),
                  };
                },
                fulfill: (options) =>
                  this.ports.finalizer.guardOperation(async (check) => {
                    check();
                    requireFact(!this.closed, "r08-ui-command-closed");
                    await route.fulfill({
                      status: options.response.status(),
                      headers: options.response.headers(),
                      body: options.body,
                    });
                  }),
              });
            } finally {
              await apiResponse?.dispose();
            }
          } else {
            const rawBody = request.postData();
            const contentType =
              new Headers(request.headers()).get("content-type") ?? "";
            requireFact(
              rawBody !== null &&
                /^application\/json(?:\s*;|$)/i.test(contentType) &&
                Buffer.byteLength(rawBody) <= 65536 &&
                stable(object(JSON.parse(rawBody))) ===
                  stable(pending.intent) &&
                !new Headers(request.headers()).has("idempotency-key"),
              "r08-original-producer-intent",
            );
            this.state.producers.push({
              step: url.pathname.split("/").at(-1)!,
              ack: "ack-unknown",
              command: {
                path: url.pathname,
                rawBody,
                headers: { "Content-Type": contentType },
                bodySha256: digest(rawBody),
              },
            });
            await this.save();
            const response = await route.fetch({
              headers: {
                ...request.headers(),
                ...this.ports.tx.headers("ops", request.url()),
              },
              timeout: 15_000,
              maxRedirects: 0,
              maxRetries: 0,
            });
            try {
              const bytes = await response.body();
              assertOpen();
              requireFact(!this.closed, "r08-ui-command-closed");
              const data = object(
                this.checked(
                  response.status(),
                  new Headers(response.headers()),
                  bytes,
                  response.url(),
                  request.url(),
                ).data,
              );
              pending.accept(data); // Exact own ACK/IDs BEFORE page loadData/navigation.
              this.state.producers.at(-1)!.ack = "acknowledged";
              await this.save();
              assertOpen();
              requireFact(!this.closed, "r08-ui-command-closed");
              await route.fulfill({ response, body: bytes });
            } finally {
              await response.dispose();
            }
            await this.guard();
          }
          this.pending = undefined;
          pending.resolve();
          return;
        }
        const response = await route.fetch({
          headers: {
            ...request.headers(),
            ...this.ports.tx.headers("ops", request.url()),
          },
          timeout: 15_000,
          maxRedirects: 0,
          maxRetries: 0,
        });
        try {
          // Never require static assets to carry the API envelope; the actual
          // Callcenter navigation and BFF observations are checked separately.
          assertOpen();
          requireFact(!this.closed, "r08-ui-command-closed");
          await route.fulfill({ response });
        } finally {
          await response.dispose();
        }
      });
    } catch (error) {
      const pending = this.pending;
      this.pending = undefined;
      await route.abort("failed").catch(() => undefined);
      pending?.reject(error);
    }
  }
  private async submit(
    path: string,
    intent: ObjectData | undefined,
    action: () => Promise<unknown>,
    accept: (data: ObjectData) => void = () => undefined,
  ) {
    requireFact(!this.pending, "r08-single-ui-command-in-flight");
    let resolve!: () => void, reject!: (error: unknown) => void;
    const ack = new Promise<void>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void ack.catch(() => undefined);
    this.pending = {
      path,
      started: false,
      ...(intent ? { intent } : {}),
      accept,
      resolve,
      reject,
    };
    // One existing write deadline also bounds a click that emits no request.
    // A timed-out UI command is never clicked again; finally closes this page.
    const timer = setTimeout(
      () => reject(new JourneyFailure("r08-original-ui-observation-timeout")),
      15_000,
    );
    try {
      await Promise.all([action(), ack]);
    } finally {
      clearTimeout(timer);
    }
  }
  async run() {
    await this.save();
    try {
      requireFact(
        this.ports.controlRole === "ops",
        "r08-real-ops-bff-required-no-direct-api-fallback",
      );
      requireFact(
        !this.closed && !this.ports.finalizer.started,
        "r08-ui-command-closed",
      );
      this.page = await this.ports.context.newPage();
      requireFact(
        !this.closed && !this.ports.finalizer.started,
        "r08-ui-command-closed",
      );
      this.page.on("dialog", (dialog) => {
        void dialog.accept(
          dialog.type() === "prompt"
            ? "Controlled synthetic index only"
            : undefined,
        );
      });
      await this.page.route("**/*", (route) => this.route(route));
      const navigation = await this.page.goto(
        `${this.ports.origin}/callcenter`,
        { timeout: 15_000 },
      );
      requireFact(
        navigation?.status() === 200 &&
          navigation.headers()["x-drts-candidate-sha"] ===
            this.ports.runtimeSha,
        "r08-actual-served-callcenter-page-runtime",
      );
      // First-party browser fetch, on the actual page. Not a status declaration
      // or direct-API observation. Same-origin routing injects the normal JWT.
      const initialBrowser = await this.page.evaluate(async () => {
        const response = await fetch("/control-plane-proxy/auth/session", {
          redirect: "error",
        });
        return {
          status: response.status,
          sha: response.headers.get("x-drts-candidate-sha"),
          body: await response.text(),
        };
      });
      requireFact(
        initialBrowser.status === 200 &&
          initialBrowser.sha === this.ports.runtimeSha &&
          Buffer.byteLength(initialBrowser.body) <= 1024 * 1024,
        "r08-actual-browser-session-runtime",
      );
      const initial = object(
        object(camelWire(JSON.parse(initialBrowser.body))).data,
      );
      this.expectedProof = await this.proof();
      requireFact(
        initial.active === true &&
          stable(this.identity(initial.identity)) ===
            stable(this.expectedProof.identity),
        "r08-actual-browser-equals-native-ops-session",
      );
      this.expectedCanonical = await this.ports.canonical();
      // Validate all independent observations before creating even the own call.
      assertR08OpsProof(this.expectedProof);
      requireFact(
        this.expectedCanonical.order.orderId === this.state.orderId &&
          this.expectedCanonical.order.status === "completed" &&
          this.expectedCanonical.supply.known === true,
        "r08-existing-completed-order-and-known-supply",
      );
      const before = records(
        object((await this.request(this.path)).data).items,
      );
      requireFact(
        !before.some(
          (item) =>
            item.callerPhone === this.ports.phone &&
            item.agentId === this.expectedProof!.identity.actorId,
        ),
        "r08-no-existing-own-call-intent",
      );
      const page = this.page;
      await page
        .getByRole("button", {
          name: /^(Open call work session|開啟通話工作階段|建立通話|開啟通話|開啟新受理)$/i,
        })
        .first()
        .click({ timeout: 15_000 });
      const intake = page
        .locator("form")
        .filter({ has: page.locator('input[type="checkbox"]') });
      await intake.locator("select").selectOption("complaint");
      await intake.locator('input[type="text"]').nth(0).fill(this.ports.phone);
      await intake
        .locator('input[type="text"]')
        .nth(1)
        .fill(this.expectedProof.identity.actorId);
      await intake.locator('input[type="checkbox"]').check();
      const open = {
        callType: "complaint",
        callerPhone: this.ports.phone,
        agentId: this.expectedProof.identity.actorId,
        agentIdentityAnnounced: true,
      };
      await this.submit(
        this.path,
        open,
        () =>
          intake.locator('button[type="submit"]').click({ timeout: 15_000 }),
        (data) => {
          requireFact(
            data.callerPhone === open.callerPhone &&
              data.agentId === open.agentId &&
              data.callType === open.callType &&
              data.status === "active",
            "r08-own-open-call-ack",
          );
          this.state.callId = text(data.callId);
        },
      );
      // H692 normal nonvoice compatibility: attach synthetic index while no
      // order is linked, THEN link the already completed main order. No media.
      const recording = page.locator("form").filter({
        has: page.getByRole("button", {
          name: /Manually attach recording|手動補掛錄音/,
        }),
      });
      await recording
        .locator('input[type="text"]')
        .nth(0)
        .fill(this.state.recordingId);
      await this.submit(
        `${this.sessionPath()}/recording-callback`,
        {
          recordingId: this.state.recordingId,
          providerRecordingRef: "",
          recordingUrl: "",
          agentId: "AGENT-OPS-001",
        },
        () =>
          recording.locator('button[type="submit"]').click({ timeout: 15_000 }),
        (data) => {
          requireFact(
            data.callId === this.state.callId &&
              data.recordingId === this.state.recordingId &&
              data.recordingState === "ready" &&
              data.linkedOrderId == null &&
              !data.providerRecordingRef &&
              !data.recordingUrl,
            "r08-synthetic-index-ready-before-link",
          );
        },
      );
      const link = page.locator("form").filter({
        has: page.getByRole("button", {
          name: /Link existing order|連結既有訂單/,
        }),
      });
      await link.locator('input[type="text"]').fill(this.state.orderId);
      await this.submit(
        `${this.sessionPath()}/link-order`,
        { orderId: this.state.orderId },
        () => link.locator('button[type="submit"]').click({ timeout: 15_000 }),
        (data) => {
          requireFact(
            data.callId === this.state.callId &&
              data.linkedOrderId === this.state.orderId &&
              data.recordingId === this.state.recordingId,
            "r08-own-call-link-ack",
          );
        },
      );
      const callback = page
        .locator("form")
        .filter({ has: page.locator('input[type="datetime-local"]') });
      const due = new Date(Date.now() + 3600_000).toISOString().slice(0, 16);
      await callback.locator('input[type="datetime-local"]').fill(due);
      await callback.locator("textarea").fill(`${this.ports.nonce}-INDEX-ONLY`);
      // Browser timezone is read, not assumed when converting datetime-local.
      const dueAt = await page.evaluate(
        (value) => new Date(value).toISOString(),
        due,
      );
      await this.submit(
        `${this.sessionPath()}/callbacks`,
        { dueAt, note: `${this.ports.nonce}-INDEX-ONLY` },
        () =>
          callback.locator('button[type="submit"]').click({ timeout: 15_000 }),
        (data) => {
          // finishCallbackMutation returns the actual callback task record.
          const task = data;
          requireFact(
            task.callId === this.state.callId &&
              task.linkedOrderId === this.state.orderId &&
              task.note === `${this.ports.nonce}-INDEX-ONLY`,
            "r08-own-callback-ack",
          );
          this.state.callbackTaskId = text(task.callbackTaskId);
        },
      );
      this.helper = new R08Callcenter(
        {
          proof: this.expectedProof,
          canonical: this.expectedCanonical,
          owned: {
            callId: text(this.state.callId),
            recordingId: this.state.recordingId,
            callbackTaskId: text(this.state.callbackTaskId),
            orderId: this.state.orderId,
          },
          intent: this.intent(),
        },
        this.helperPorts(),
      );
      await this.save();
      const transfer = page.locator("form").filter({
        has: page.getByRole("button", {
          name: /Transfer to complaint|轉交客訴/,
        }),
      });
      await transfer.locator("select").nth(0).selectOption("other");
      await transfer.locator("select").nth(1).selectOption("normal");
      await transfer.locator("textarea").fill(this.intent().description);
      await this.submit(
        `${this.sessionPath()}/transfer-to-complaint`,
        undefined,
        () =>
          transfer.locator('button[type="submit"]').click({ timeout: 15_000 }),
      );
      await this.helper.replay();
      this.state.result = "verified";
      await this.save();
    } catch (error) {
      await this.stop();
      this.state.result = "failed";
      await this.save();
      throw error;
    } finally {
      await this.stop();
    }
  }
  private intent(): TransferCallToComplaintCommand {
    return {
      category: "other",
      severity: "normal",
      description: `${this.ports.nonce} controlled SYNTHETIC INDEX ONLY`,
      relatedOrderId: this.state.orderId,
    };
  }
  private helperPorts(): R08Ports {
    return {
      proof: () => this.proof(),
      canonical: this.ports.canonical,
      get: (path) => this.request(path),
      postRaw: (command) => this.request(command.path, command),
      checkpoint: async (custody) => {
        this.state.transfer = custody;
        await this.save();
      },
    };
  }
  async stop() {
    this.closed = true;
    await this.page?.close();
  }
  async cleanup() {
    requireFact(!this.cleanupStarted, "r08-own-run-cleanup-at-most-once");
    this.cleanupStarted = true;
    this.state.cleanup = "unknown";
    await this.save();
    try {
      // Read-only reconciliation after unknown producer ACK. Never create a
      // replacement call/index/link/callback or resend a producer command.
      if (
        !this.state.callId &&
        this.state.producers.some((p) => p.command.path === this.path)
      ) {
        const open = object(
          JSON.parse(this.state.producers[0]!.command.rawBody),
        );
        const matches = records(
          object((await this.request(this.path)).data).items,
        ).filter(
          (item) =>
            item.callerPhone === open.callerPhone &&
            item.agentId === open.agentId &&
            item.callType === open.callType &&
            item.agentIdentityAnnounced === true,
        );
        requireFact(
          matches.length === 1,
          "r08-unknown-open-call-unique-own-readback-required",
        );
        this.state.callId = text(matches[0]!.callId);
        this.state.producers[0]!.ack = "acknowledged";
        await this.save();
      }
      if (!this.state.callId) {
        requireFact(
          this.state.producers.length === 0,
          "r08-missing-call-id-retained",
        );
        this.state.cleanup = "verified";
        await this.save();
        return;
      }
      await this.guard();
      const session = object((await this.request(this.sessionPath())).data);
      requireFact(
        session.callId === this.state.callId &&
          session.callerPhone === this.ports.phone &&
          session.agentId === this.expectedProof!.identity.actorId,
        "r08-own-producer-session-readback",
      );
      const task = session.callbackTask
        ? object(session.callbackTask)
        : undefined;
      for (const producer of this.state.producers.filter(
        (p) => p.ack === "ack-unknown",
      )) {
        const body = object(JSON.parse(producer.command.rawBody));
        if (producer.command.path.endsWith("/recording-callback"))
          requireFact(
            session.recordingId === body.recordingId &&
              session.recordingState === "ready" &&
              !session.providerRecordingRef &&
              !session.recordingUrl,
            "r08-unknown-index-readback",
          );
        else if (producer.command.path.endsWith("/link-order"))
          requireFact(
            session.linkedOrderId === body.orderId,
            "r08-unknown-link-readback",
          );
        else if (producer.command.path.endsWith("/callbacks")) {
          requireFact(
            task &&
              task.callId === this.state.callId &&
              task.note === body.note &&
              task.dueAt === body.dueAt &&
              task.linkedOrderId === this.state.orderId,
            "r08-unknown-callback-readback",
          );
          this.state.callbackTaskId = text(task.callbackTaskId);
        } else throw new JourneyFailure("r08-unknown-producer-retained");
        producer.ack = "acknowledged";
        await this.save();
      }
      // The helper exists before the transfer form is touched. Only captured
      // intent or a known case requires transfer reconciliation; an interrupted
      // form with neither still has the ordinary partial-producer custody.
      const transfer = this.helper?.snapshot();
      if (this.helper && (transfer?.command || transfer?.caseNo)) {
        await this.helper.reconcileOwnTransfer();
        await this.helper.cleanup({
          resolutionCode: "resolved_other",
          closingNote: `${this.ports.nonce} controlled synthetic index cleanup`,
        });
      } else {
        requireFact(!session.linkedCaseNo, "r08-unowned-case-retained");
        // Partial producer custody: normal own callback cancel and call close.
        if (task) {
          requireFact(
            task.callbackTaskId === this.state.callbackTaskId &&
              task.callId === this.state.callId,
            "r08-partial-own-callback-only",
          );
          if (task.status !== "cancelled") {
            requireFact(
              ["pending", "claimed", "in_progress"].includes(
                String(task.status),
              ),
              "r08-partial-callback-normal-cancel-state",
            );
            await this.postCleanup(
              `${prefix}/callcenter/callbacks/${encodeURIComponent(text(task.callbackTaskId))}/cancel`,
              { reason: "Controlled synthetic index cleanup" },
            );
          }
          const queue = records(
            object((await this.request(`${prefix}/callcenter/callbacks`)).data)
              .items,
          ).filter((item) => item.callbackTaskId === task.callbackTaskId);
          requireFact(
            queue.length === 1 && queue[0]!.status === "cancelled",
            "r08-partial-callback-terminal",
          );
        }
        if (session.status !== "closed")
          await this.postCleanup(`${this.sessionPath()}/close`, {});
        const closed = object((await this.request(this.sessionPath())).data);
        requireFact(
          closed.status === "closed" &&
            (!task || object(closed.callbackTask).status === "cancelled"),
          "r08-partial-call-terminal",
        );
        await this.guard();
      }
      this.state.cleanup = "verified";
      await this.save();
    } catch (error) {
      await this.save();
      throw error;
    }
  }
  private async postCleanup(path: string, body: unknown) {
    await this.guard();
    await this.save();
    const rawBody = JSON.stringify(body);
    await this.request(path, {
      path,
      rawBody,
      headers: { "Content-Type": "application/json" },
      bodySha256: digest(rawBody),
    });
    await this.guard();
  }
}
