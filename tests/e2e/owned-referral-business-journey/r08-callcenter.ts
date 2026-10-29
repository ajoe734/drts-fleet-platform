import { createHash } from "node:crypto";
import {
  COMPLAINT_CATEGORY_VALID_RESOLUTIONS,
  type ResolveComplaintCaseCommand,
  type TransferCallToComplaintCommand,
} from "@drts/contracts";
import {
  camelWire,
  object,
  requireFact,
  type CallResult,
  type ObjectData,
} from "./protocol";

// Preparation only: the original FULL caller/finalizer must supply these ports.
// No credentials, browser, role issuance, booking or recording producer here.
export type R08OpsProof = {
  origin: string;
  runtimeSha: string;
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
    const i = proof.identity;
    const origin = new URL(proof.origin);
    requireFact(
      origin.protocol === "https:" &&
        origin.origin === proof.origin &&
        /^[a-f0-9]{40}$/.test(proof.runtimeSha) &&
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
        stable(proof) === stable(this.expected.proof),
      "r08-same-canonical-ops-first-party-bff-runtime",
    );
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
