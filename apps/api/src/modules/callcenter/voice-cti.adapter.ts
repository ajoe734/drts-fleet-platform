import * as crypto from "node:crypto";

import { DTMF_DIGIT_REGEX } from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";

/**
 * Provider-neutral CTI boundary for the unattended voice booking effort
 * (SD §3.2 row "CTI adapter", §4.1, §10.1, §10.4, §12.1). This file is a
 * standalone scaffold: it is intentionally not registered on
 * `CallcenterModule`/`CallcenterController`/`CallcenterService` (those stay
 * owned by the legacy callcenter flow and by UV-EXEC-005's race-closing
 * work). Wiring this adapter into the real `/api/voice/providers/{provider}/
 * events` route and a durable replay/call-leg store is left to UV-EXEC-010,
 * which depends on this task plus the recording/session-fencing work.
 *
 * Nothing here selects a telephony vendor or applies for phone service
 * (SD §3.3 is still "未決標"). The only concrete provider implemented is a
 * fixed-fixture `sandbox` adapter; a real provider is represented only as an
 * "unconfigured" slot that fails closed until someone wires an actual
 * signing secret and transport for it.
 */

// ---------------------------------------------------------------------------
// Trusted call admission (SD §4.1 steps 1-2)
// ---------------------------------------------------------------------------

/**
 * The only facts an inbound CTI event can be trusted to carry about routing:
 * the signature-verified provider account and the DID/trunk the call
 * actually reached (`dnis`). There is deliberately no caller-asserted field
 * here that could stand in for brand/tenant/scope.
 */
export interface TrustedCallDestination {
  providerAccountId: string;
  dnis: string;
}

// ---------------------------------------------------------------------------
// Call legs (SD §3.2, §4.1 step 3, §12.1)
// ---------------------------------------------------------------------------

export type VoiceCallLegRole = "customer" | "agent" | "handoff_target";

export const VOICE_HANGUP_REASONS = [
  "caller_hangup",
  "callee_hangup",
  "transferred",
  "system_terminated",
  "provider_failure",
  "timeout",
] as const;
export type VoiceHangupReason = (typeof VOICE_HANGUP_REASONS)[number];

export interface VoiceCallLeg {
  callLegId: string;
  callId: string;
  role: VoiceCallLegRole;
  providerLegId: string;
  startedAt: string;
  endedAt: string | null;
  endReason: VoiceHangupReason | null;
}

// ---------------------------------------------------------------------------
// Raw provider events, decoded from a signature-verified webhook body
// (SD §10.4 event kinds, scoped to the CTI-owned subset: call.started/ended,
// dtmf.received, and the transfer request that SD §12.1/§12.5 route through
// warm transfer).
// ---------------------------------------------------------------------------

export interface VoiceCtiCallStartedRawEvent {
  type: "call.started";
  callId: string;
  callLegId: string;
  providerLegId: string;
  destination: TrustedCallDestination;
  /** SD §4.1 step 5: an admission fact only, never an authorization proof. */
  assertedCallerPhone: string | null;
  occurredAt: string;
}

export interface VoiceCtiCallEndedRawEvent {
  type: "call.ended";
  callId: string;
  callLegId: string;
  reason: VoiceHangupReason;
  occurredAt: string;
}

export interface VoiceCtiDtmfRawEvent {
  type: "dtmf.received";
  callId: string;
  callLegId: string;
  digit: string;
  occurredAt: string;
}

export type VoiceCtiTransferTargetKind =
  | "human_queue"
  | "callback"
  | "external_number";

export interface VoiceCtiTransferRequestedRawEvent {
  type: "call.transfer.requested";
  callId: string;
  fromCallLegId: string;
  toCallLegId: string;
  toProviderLegId: string;
  targetKind: VoiceCtiTransferTargetKind;
  target: string;
  occurredAt: string;
}

export type VoiceCtiRawEvent =
  | VoiceCtiCallStartedRawEvent
  | VoiceCtiCallEndedRawEvent
  | VoiceCtiDtmfRawEvent
  | VoiceCtiTransferRequestedRawEvent;

export interface VoiceCtiDecodedWebhook {
  providerAccountId: string;
  /** Provider-assigned id used as the replay-dedupe key (SD §10.4). */
  eventId: string;
  event: VoiceCtiRawEvent;
}

/** Server-assigned causal metadata layered on top of a decoded event. */
export interface VoiceCtiNormalizedEvent {
  providerName: string;
  providerAccountId: string;
  eventId: string;
  /** Server-observed receipt time; never provider/client supplied. */
  receivedAt: string;
  /** Monotonically increasing per `callId`, assigned at receipt time. */
  sequence: number;
  event: VoiceCtiRawEvent;
}

export interface VoiceCtiIngestResult {
  /** True when this `eventId` was already seen; `normalized` is the original. */
  deduped: boolean;
  normalized: VoiceCtiNormalizedEvent;
  callLeg?: VoiceCallLeg;
}

// ---------------------------------------------------------------------------
// Provider adapter boundary
// ---------------------------------------------------------------------------

export interface VoiceCtiWebhookRequest {
  headers: Readonly<Record<string, string | undefined>>;
  rawBody: string;
}

export interface VoiceCtiTransferCommand {
  callId: string;
  fromCallLegId: string;
  targetKind: VoiceCtiTransferTargetKind;
  target: string;
}

export interface VoiceCtiTransferResult {
  accepted: boolean;
  providerTransferId: string | null;
}

export interface VoiceCtiProviderAdapter {
  readonly providerName: string;
  /**
   * SD acceptance: sandbox/fixture adapters must be structurally
   * distinguishable from a real, validated provider. This flag -- not a
   * naming convention -- is what `VoiceCtiAdapter` checks before letting a
   * provider serve production traffic.
   */
  readonly isProductionCapable: boolean;
  /** Verifies signature/replay-window and decodes; throws (fail closed) on any mismatch. */
  verifyAndDecode(request: VoiceCtiWebhookRequest): VoiceCtiDecodedWebhook;
  requestTransfer(
    command: VoiceCtiTransferCommand,
  ): Promise<VoiceCtiTransferResult>;
}

// ---------------------------------------------------------------------------
// Generic HMAC signature + timestamp-window verification
// ---------------------------------------------------------------------------

export interface HmacSignatureConfig {
  secret: string;
  signatureHeader: string;
  timestampHeader: string;
  toleranceSeconds: number;
}

/**
 * Shared building block a real provider adapter can reuse if its signing
 * scheme is HMAC-SHA256 over `${timestamp}.${rawBody}` (Stripe/Twilio-style).
 * Throws `ApiRequestError` (fail closed) rather than returning a boolean, so
 * a caller cannot accidentally ignore the result.
 */
export function verifyHmacSignature(
  config: HmacSignatureConfig,
  request: VoiceCtiWebhookRequest,
): void {
  const signatureHeader = request.headers[config.signatureHeader];
  const timestampHeader = request.headers[config.timestampHeader];
  if (!signatureHeader || !timestampHeader) {
    throw new ApiRequestError(
      401,
      "VOICE_CTI_SIGNATURE_INVALID",
      "Missing CTI webhook signature or timestamp header.",
    );
  }

  const timestampSeconds = Number(timestampHeader);
  if (!Number.isFinite(timestampSeconds)) {
    throw new ApiRequestError(
      401,
      "VOICE_CTI_SIGNATURE_INVALID",
      "CTI webhook timestamp header is not a valid number.",
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > config.toleranceSeconds) {
    throw new ApiRequestError(
      401,
      "VOICE_CTI_SIGNATURE_EXPIRED",
      "CTI webhook timestamp is outside the accepted replay window.",
    );
  }

  const expectedSignature = crypto
    .createHmac("sha256", config.secret)
    .update(`${timestampSeconds}.${request.rawBody}`)
    .digest("hex");

  let providedBuffer: Buffer;
  let expectedBuffer: Buffer;
  try {
    providedBuffer = Buffer.from(signatureHeader, "hex");
    expectedBuffer = Buffer.from(expectedSignature, "hex");
  } catch {
    throw new ApiRequestError(
      401,
      "VOICE_CTI_SIGNATURE_INVALID",
      "CTI webhook signature is not valid hex.",
    );
  }

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new ApiRequestError(
      401,
      "VOICE_CTI_SIGNATURE_INVALID",
      "CTI webhook signature does not match.",
    );
  }
}

// ---------------------------------------------------------------------------
// Sandbox (fixture) provider -- never production-capable
// ---------------------------------------------------------------------------

/** Fixed fixture secret. Not a real credential; sandbox never talks to a real network. */
export const SANDBOX_CTI_SIGNING_SECRET = "uv-exec-008-sandbox-fixture-secret";
export const SANDBOX_CTI_SIGNATURE_HEADER = "x-cti-signature";
export const SANDBOX_CTI_TIMESTAMP_HEADER = "x-cti-timestamp";
const SANDBOX_CTI_TOLERANCE_SECONDS = 300;

export interface SandboxCtiWebhookBody {
  eventId: string;
  providerAccountId: string;
  callId: string;
  callLegId: string;
  occurredAt: string;
  type: VoiceCtiRawEvent["type"];
  providerLegId?: string;
  dnis?: string;
  assertedCallerPhone?: string | null;
  reason?: VoiceHangupReason;
  digit?: string;
  fromCallLegId?: string;
  toCallLegId?: string;
  toProviderLegId?: string;
  targetKind?: VoiceCtiTransferTargetKind;
  target?: string;
}

function decodeSandboxBody(body: SandboxCtiWebhookBody): VoiceCtiRawEvent {
  switch (body.type) {
    case "call.started": {
      if (!body.providerLegId || !body.dnis) {
        throw new ApiRequestError(
          400,
          "VOICE_CTI_EVENT_MALFORMED",
          "call.started requires providerLegId and dnis.",
        );
      }
      return {
        type: "call.started",
        callId: body.callId,
        callLegId: body.callLegId,
        providerLegId: body.providerLegId,
        destination: {
          providerAccountId: body.providerAccountId,
          dnis: body.dnis,
        },
        assertedCallerPhone: body.assertedCallerPhone ?? null,
        occurredAt: body.occurredAt,
      };
    }
    case "call.ended": {
      if (!body.reason) {
        throw new ApiRequestError(
          400,
          "VOICE_CTI_EVENT_MALFORMED",
          "call.ended requires a reason code.",
        );
      }
      if (!VOICE_HANGUP_REASONS.includes(body.reason)) {
        throw new ApiRequestError(
          400,
          "VOICE_CTI_EVENT_MALFORMED",
          `Unsupported hangup reason '${body.reason}'.`,
        );
      }
      return {
        type: "call.ended",
        callId: body.callId,
        callLegId: body.callLegId,
        reason: body.reason,
        occurredAt: body.occurredAt,
      };
    }
    case "dtmf.received": {
      if (!body.digit || !DTMF_DIGIT_REGEX.test(body.digit)) {
        throw new ApiRequestError(
          400,
          "VOICE_CTI_EVENT_MALFORMED",
          "dtmf.received requires a single valid DTMF digit.",
        );
      }
      return {
        type: "dtmf.received",
        callId: body.callId,
        callLegId: body.callLegId,
        digit: body.digit,
        occurredAt: body.occurredAt,
      };
    }
    case "call.transfer.requested": {
      if (
        !body.fromCallLegId ||
        !body.toCallLegId ||
        !body.toProviderLegId ||
        !body.targetKind ||
        !body.target
      ) {
        throw new ApiRequestError(
          400,
          "VOICE_CTI_EVENT_MALFORMED",
          "call.transfer.requested requires from/to leg ids, targetKind and target.",
        );
      }
      return {
        type: "call.transfer.requested",
        callId: body.callId,
        fromCallLegId: body.fromCallLegId,
        toCallLegId: body.toCallLegId,
        toProviderLegId: body.toProviderLegId,
        targetKind: body.targetKind,
        target: body.target,
        occurredAt: body.occurredAt,
      };
    }
    default:
      throw new ApiRequestError(
        400,
        "VOICE_CTI_EVENT_UNSUPPORTED",
        `Unsupported sandbox CTI event type '${String((body as { type?: unknown }).type)}'.`,
      );
  }
}

/**
 * Fixture-only adapter. `isProductionCapable` is hard-coded `false` -- it is
 * not derived from whether a secret happens to be configured, so this
 * provider can never be mistaken for a validated production adapter
 * (SD acceptance: "正式電話 provider 與 sandbox adapter 明確區隔").
 */
export class SandboxVoiceCtiProviderAdapter implements VoiceCtiProviderAdapter {
  readonly providerName = "sandbox";
  readonly isProductionCapable = false as const;

  verifyAndDecode(request: VoiceCtiWebhookRequest): VoiceCtiDecodedWebhook {
    verifyHmacSignature(
      {
        secret: SANDBOX_CTI_SIGNING_SECRET,
        signatureHeader: SANDBOX_CTI_SIGNATURE_HEADER,
        timestampHeader: SANDBOX_CTI_TIMESTAMP_HEADER,
        toleranceSeconds: SANDBOX_CTI_TOLERANCE_SECONDS,
      },
      request,
    );

    let body: SandboxCtiWebhookBody;
    try {
      body = JSON.parse(request.rawBody) as SandboxCtiWebhookBody;
    } catch {
      throw new ApiRequestError(
        400,
        "VOICE_CTI_EVENT_MALFORMED",
        "Sandbox CTI webhook body is not valid JSON.",
      );
    }

    if (!body.eventId || !body.providerAccountId || !body.callId) {
      throw new ApiRequestError(
        400,
        "VOICE_CTI_EVENT_MALFORMED",
        "Sandbox CTI webhook body is missing eventId/providerAccountId/callId.",
      );
    }

    return {
      providerAccountId: body.providerAccountId,
      eventId: body.eventId,
      event: decodeSandboxBody(body),
    };
  }

  async requestTransfer(
    command: VoiceCtiTransferCommand,
  ): Promise<VoiceCtiTransferResult> {
    return {
      accepted: true,
      providerTransferId: `sandbox-transfer-${command.callId}-${command.fromCallLegId}`,
    };
  }
}

/** Signs a sandbox fixture body for tests/local tooling; mirrors what a real provider would send. */
export function signSandboxCtiRequest(
  body: SandboxCtiWebhookBody,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): VoiceCtiWebhookRequest {
  const rawBody = JSON.stringify(body);
  const signature = crypto
    .createHmac("sha256", SANDBOX_CTI_SIGNING_SECRET)
    .update(`${timestampSeconds}.${rawBody}`)
    .digest("hex");
  return {
    rawBody,
    headers: {
      [SANDBOX_CTI_SIGNATURE_HEADER]: signature,
      [SANDBOX_CTI_TIMESTAMP_HEADER]: String(timestampSeconds),
    },
  };
}

/** Fixed fixture bodies (SD acceptance: "固定 fixture，不自行決標或申請電話服務"). */
export const SANDBOX_CTI_FIXTURES = {
  callStarted: {
    eventId: "sbx-evt-call-started-001",
    providerAccountId: "sbx-account-001",
    callId: "sbx-call-001",
    callLegId: "sbx-leg-customer-001",
    providerLegId: "sbx-provider-leg-001",
    dnis: "0800111222",
    assertedCallerPhone: "0911000111",
    type: "call.started",
    occurredAt: "2026-09-06T02:00:00.000Z",
  } satisfies SandboxCtiWebhookBody,
  dtmf: {
    eventId: "sbx-evt-dtmf-001",
    providerAccountId: "sbx-account-001",
    callId: "sbx-call-001",
    callLegId: "sbx-leg-customer-001",
    digit: "1",
    type: "dtmf.received",
    occurredAt: "2026-09-06T02:00:05.000Z",
  } satisfies SandboxCtiWebhookBody,
  transferRequested: {
    eventId: "sbx-evt-transfer-001",
    providerAccountId: "sbx-account-001",
    callId: "sbx-call-001",
    callLegId: "sbx-leg-customer-001",
    fromCallLegId: "sbx-leg-customer-001",
    toCallLegId: "sbx-leg-handoff-001",
    toProviderLegId: "sbx-provider-leg-002",
    targetKind: "human_queue",
    target: "ops-default-queue",
    type: "call.transfer.requested",
    occurredAt: "2026-09-06T02:01:00.000Z",
  } satisfies SandboxCtiWebhookBody,
  callEnded: {
    eventId: "sbx-evt-call-ended-001",
    providerAccountId: "sbx-account-001",
    callId: "sbx-call-001",
    callLegId: "sbx-leg-handoff-001",
    reason: "transferred",
    type: "call.ended",
    occurredAt: "2026-09-06T02:02:00.000Z",
  } satisfies SandboxCtiWebhookBody,
} as const;

// ---------------------------------------------------------------------------
// Unconfigured production slot (no vendor decided; SD §3.3 "未決標")
// ---------------------------------------------------------------------------

/**
 * Represents a real provider name that has no signing/transport wired up
 * yet. It is never production-capable and rejects every call -- this is the
 * fail-closed leg of the acceptance criterion, not a working adapter.
 */
export function createUnconfiguredVoiceCtiProvider(
  providerName: string,
): VoiceCtiProviderAdapter {
  const notConfigured = () =>
    new ApiRequestError(
      503,
      "VOICE_CTI_PROVIDER_NOT_CONFIGURED",
      `CTI provider '${providerName}' has no signing/transport configuration; refusing to accept webhooks or place calls until a real adapter is selected and configured.`,
      { providerName },
    );

  return {
    providerName,
    isProductionCapable: false,
    verifyAndDecode(): VoiceCtiDecodedWebhook {
      throw notConfigured();
    },
    async requestTransfer(): Promise<VoiceCtiTransferResult> {
      throw notConfigured();
    },
  };
}

// ---------------------------------------------------------------------------
// Replay guard (webhook resend dedupe; SD §10.4)
// ---------------------------------------------------------------------------

export interface VoiceCtiReplayGuard {
  /**
   * Atomically checks `dedupeKey`; if unseen, calls `build()` to materialize
   * the normalized event (so sequence numbers are only consumed for events
   * that are actually new) and stores it. Returns the stored/original event
   * either way.
   */
  recordIfNew(
    dedupeKey: string,
    build: () => VoiceCtiNormalizedEvent,
  ): { deduped: boolean; normalized: VoiceCtiNormalizedEvent };
}

/**
 * Process-local scaffold. A production deployment needs a durable (DB-backed)
 * replay guard so dedupe survives worker restarts -- left to UV-EXEC-010,
 * which owns the durable recorder/checkpoint store this adapter hands off to.
 */
export class InMemoryVoiceCtiReplayGuard implements VoiceCtiReplayGuard {
  private readonly seen = new Map<string, VoiceCtiNormalizedEvent>();

  recordIfNew(
    dedupeKey: string,
    build: () => VoiceCtiNormalizedEvent,
  ): { deduped: boolean; normalized: VoiceCtiNormalizedEvent } {
    const existing = this.seen.get(dedupeKey);
    if (existing) {
      return { deduped: true, normalized: existing };
    }
    const normalized = build();
    this.seen.set(dedupeKey, normalized);
    return { deduped: false, normalized };
  }
}

// ---------------------------------------------------------------------------
// Call leg tracker (in-memory scaffold; SD §3.2, §12.1 causal leg history)
// ---------------------------------------------------------------------------

export interface VoiceCtiCallLegTracker {
  applyEvent(event: VoiceCtiRawEvent): VoiceCallLeg | undefined;
  listLegs(callId: string): VoiceCallLeg[];
}

export class InMemoryVoiceCallLegTracker implements VoiceCtiCallLegTracker {
  private readonly legsByCall = new Map<string, Map<string, VoiceCallLeg>>();

  applyEvent(event: VoiceCtiRawEvent): VoiceCallLeg | undefined {
    switch (event.type) {
      case "call.started": {
        const leg: VoiceCallLeg = {
          callLegId: event.callLegId,
          callId: event.callId,
          role: "customer",
          providerLegId: event.providerLegId,
          startedAt: event.occurredAt,
          endedAt: null,
          endReason: null,
        };
        this.putLeg(leg);
        return leg;
      }
      case "call.ended": {
        const leg = this.getLeg(event.callId, event.callLegId);
        if (!leg) {
          return undefined;
        }
        const updated: VoiceCallLeg = {
          ...leg,
          endedAt: event.occurredAt,
          endReason: event.reason,
        };
        this.putLeg(updated);
        return updated;
      }
      case "call.transfer.requested": {
        const fromLeg = this.getLeg(event.callId, event.fromCallLegId);
        if (fromLeg && !fromLeg.endedAt) {
          this.putLeg({
            ...fromLeg,
            endedAt: event.occurredAt,
            endReason: "transferred",
          });
        }
        const toLeg: VoiceCallLeg = {
          callLegId: event.toCallLegId,
          callId: event.callId,
          role: "handoff_target",
          providerLegId: event.toProviderLegId,
          startedAt: event.occurredAt,
          endedAt: null,
          endReason: null,
        };
        this.putLeg(toLeg);
        return toLeg;
      }
      case "dtmf.received":
        return undefined;
    }
  }

  listLegs(callId: string): VoiceCallLeg[] {
    return [...(this.legsByCall.get(callId)?.values() ?? [])];
  }

  private getLeg(callId: string, callLegId: string): VoiceCallLeg | undefined {
    return this.legsByCall.get(callId)?.get(callLegId);
  }

  private putLeg(leg: VoiceCallLeg): void {
    let legs = this.legsByCall.get(leg.callId);
    if (!legs) {
      legs = new Map();
      this.legsByCall.set(leg.callId, legs);
    }
    legs.set(leg.callLegId, leg);
  }
}

// ---------------------------------------------------------------------------
// Orchestrator: provider selection, fail-closed production gating, dedupe,
// call-leg bookkeeping, causal sequencing.
// ---------------------------------------------------------------------------

export interface VoiceCtiAdapterConfig {
  providers: readonly VoiceCtiProviderAdapter[];
  /**
   * Caller-supplied, not read from `process.env` here, so this class stays
   * host/environment agnostic and unit-testable without env mutation.
   */
  productionMode: boolean;
  /** A verified backup provider SD acceptance allows switching to when the
   * requested provider is not production-capable ("切已驗證備援"). */
  productionFallbackProviderName?: string;
  replayGuard?: VoiceCtiReplayGuard;
  callLegTracker?: VoiceCtiCallLegTracker;
}

export class VoiceCtiAdapter {
  private readonly providers = new Map<string, VoiceCtiProviderAdapter>();
  private readonly replayGuard: VoiceCtiReplayGuard;
  private readonly callLegTracker: VoiceCtiCallLegTracker;
  private readonly sequenceByCall = new Map<string, number>();

  constructor(private readonly config: VoiceCtiAdapterConfig) {
    for (const provider of config.providers) {
      this.providers.set(provider.providerName, provider);
    }
    this.replayGuard = config.replayGuard ?? new InMemoryVoiceCtiReplayGuard();
    this.callLegTracker =
      config.callLegTracker ?? new InMemoryVoiceCallLegTracker();
  }

  /**
   * SD acceptance: "production 未配置有效 adapter 時 fail closed/切已驗證備援".
   * Outside production mode any registered provider (including sandbox) may
   * serve traffic. In production mode, only an `isProductionCapable`
   * provider may serve traffic; if the requested one is not, an explicitly
   * configured and itself production-capable fallback may be used instead.
   * Otherwise this fails closed rather than silently using sandbox.
   */
  private resolveProviderForTraffic(
    requestedProviderName: string,
  ): VoiceCtiProviderAdapter {
    const requested = this.providers.get(requestedProviderName);

    if (!this.config.productionMode) {
      if (!requested) {
        throw new ApiRequestError(
          400,
          "VOICE_CTI_PROVIDER_UNKNOWN",
          `CTI provider '${requestedProviderName}' is not registered.`,
          { requestedProviderName },
        );
      }
      return requested;
    }

    if (requested?.isProductionCapable) {
      return requested;
    }

    const fallbackName = this.config.productionFallbackProviderName;
    if (fallbackName) {
      const fallback = this.providers.get(fallbackName);
      if (fallback?.isProductionCapable) {
        return fallback;
      }
    }

    throw new ApiRequestError(
      503,
      "VOICE_CTI_PROVIDER_NOT_CONFIGURED",
      `No production-capable CTI provider is configured to serve '${requestedProviderName}' traffic; failing closed rather than falling back to an unverified/sandbox adapter.`,
      { requestedProviderName },
    );
  }

  /**
   * SD §10.1 `POST /api/voice/providers/{provider}/events`: verifies
   * signature (fail closed on mismatch), dedupes by provider-assigned
   * `eventId` (SD §10.4 resend dedupe), and preserves call-leg/DTMF/ended
   * causal order via a per-call monotonic `sequence` plus a server-assigned
   * `receivedAt` -- never a provider- or client-supplied timestamp for
   * ordering.
   */
  ingestWebhookEvent(
    requestedProviderName: string,
    request: VoiceCtiWebhookRequest,
  ): VoiceCtiIngestResult {
    const provider = this.resolveProviderForTraffic(requestedProviderName);
    const decoded = provider.verifyAndDecode(request);

    const dedupeKey = `${provider.providerName}:${decoded.providerAccountId}:${decoded.eventId}`;
    const { deduped, normalized } = this.replayGuard.recordIfNew(
      dedupeKey,
      () => ({
        providerName: provider.providerName,
        providerAccountId: decoded.providerAccountId,
        eventId: decoded.eventId,
        receivedAt: new Date().toISOString(),
        sequence: this.nextSequence(decoded.event.callId),
        event: decoded.event,
      }),
    );

    if (deduped) {
      return { deduped: true, normalized };
    }

    const callLeg = this.callLegTracker.applyEvent(normalized.event);
    return callLeg
      ? { deduped: false, normalized, callLeg }
      : { deduped: false, normalized };
  }

  /** SD §12.1 warm transfer / §12.5 handoff-target leg creation. */
  async requestTransfer(
    requestedProviderName: string,
    command: VoiceCtiTransferCommand,
  ): Promise<VoiceCtiTransferResult> {
    const provider = this.resolveProviderForTraffic(requestedProviderName);
    return provider.requestTransfer(command);
  }

  listCallLegs(callId: string): VoiceCallLeg[] {
    return this.callLegTracker.listLegs(callId);
  }

  private nextSequence(callId: string): number {
    const next = (this.sequenceByCall.get(callId) ?? 0) + 1;
    this.sequenceByCall.set(callId, next);
    return next;
  }
}
