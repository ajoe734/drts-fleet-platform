import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename } from "node:fs/promises";
import { dirname } from "node:path";

export type ObjectData = Record<string, unknown>;
export type Role =
  | "api"
  | "publicApi"
  | "referralApi"
  | "opsApi"
  | "admin"
  | "ops"
  | "fleet"
  | "referral"
  | "driver";
export type Origins = Record<
  "api" | "admin" | "ops" | "fleet" | "referral",
  string
>;
const originRole = (role: Role) =>
  role === "driver" ||
  role === "publicApi" ||
  role === "referralApi" ||
  role === "opsApi"
    ? "api"
    : role;

export class JourneyFailure extends Error {
  constructor(
    public readonly stage: string,
    public readonly status?: number,
    public readonly code?: string,
  ) {
    super(
      `${stage}${status ? `: HTTP ${status}` : ""}${code ? ` ${code}` : ""}`,
    );
  }
}
export function requireFact(value: unknown, stage: string): asserts value {
  if (!value) throw new JourneyFailure(stage);
}
export function object(value: unknown): ObjectData {
  requireFact(
    value && typeof value === "object" && !Array.isArray(value),
    "object response required",
  );
  return value as ObjectData;
}
export function text(
  value: unknown,
  stage = "nonempty identifier required",
): string {
  requireFact(typeof value === "string" && value.trim(), stage);
  return value;
}
export function integer(value: unknown, stage = "integer required"): number {
  requireFact(typeof value === "number" && Number.isSafeInteger(value), stage);
  return value;
}
export function records(value: unknown): ObjectData[] {
  requireFact(Array.isArray(value), "array response required");
  return value.map(object);
}
// Normalize wire property names once. Opaque values, IDs and tokens are unchanged.
export function camelWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelWire);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      camelWire(item),
    ]),
  );
}
export function origin(value: string): string {
  const url = new URL(value);
  requireFact(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/",
    "credential-free HTTPS origin required",
  );
  return url.origin;
}
export function mask(value: string) {
  if (process.env.GITHUB_ACTIONS === "true")
    process.stdout.write(
      `::add-mask::${value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}\n`,
    );
}
export function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// Parsing the new context's own server-issued cookies does not grant authority.
// The caller verifies the genuine bearer and binding through /api/auth/session.
export function readOwnedReferralCookies(
  cookies: readonly {
    name: string;
    value: string;
    httpOnly: boolean;
    secure: boolean;
  }[],
  entrySlug: string,
) {
  const metadata = cookies.find(
    (cookie) => cookie.name === "drts_referral_embed_session",
  );
  const bearer = cookies.find(
    (cookie) => cookie.name === "drts_referral_embed_bearer",
  );
  requireFact(
    metadata?.httpOnly && metadata.secure && bearer?.httpOnly && bearer.secure,
    "active own Referral HttpOnly cookie pair required",
  );
  mask(metadata.value);
  mask(bearer.value);
  const [body, signature, extra] = metadata.value.split(".");
  requireFact(
    body && signature && extra === undefined,
    "signed Referral metadata shape required",
  );
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new JourneyFailure("Referral metadata JSON required");
  }
  const session = object(value);
  requireFact(
    session.identityActive === true &&
      session.partnerEntrySlug === entrySlug &&
      session.tokenType === "Bearer" &&
      typeof session.expiresAt === "string" &&
      Date.parse(session.expiresAt) > Date.now(),
    "active same-entry Referral metadata required",
  );
  const accessToken = text(bearer.value);
  requireFact(
    session.bearerDigest === hash(Buffer.from(accessToken, "utf8")),
    "own Referral cookie bearer binding",
  );
  const sessionId = text(session.sessionId);
  mask(sessionId);
  return { accessToken, sessionId, passengerId: text(session.drtsPassengerId) };
}

// This file contains only the exact, allowlisted synthetic business command.
// Credentials and request headers are deliberately not accepted by this API.
export async function persistPrivateJson(path: string, value: unknown) {
  const directory = dirname(path);
  await mkdir(directory, { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporary, path);
  const parent = await open(directory, "r");
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
}

export type BookingJournalContext = {
  definitionSha: string;
  runtimeSha: string;
  nonce: string;
  entrySlug: string;
  partnerUserRef: string;
  quoteId: string;
  pickupAddress: string;
  dropoffAddress: string;
  passengerName: string;
  passengerPhone: string;
  vehicleType: string | null;
};
export type BookingJournalSnapshot = Readonly<{
  version: 1;
  state: "ack_unknown" | "acknowledged";
  definitionSha: string;
  runtimeSha: string;
  nonce: string;
  entrySlug: string;
  partnerUserRef: string;
  quoteId: string;
  body: string;
  bodySha256: string;
  idempotencyKey: string;
  orderId?: string;
  syntheticData: true;
  recovery: string;
}>;
const bookingBusinessFields = new Set([
  "entrySlug",
  "quoteId",
  "pickupAddress",
  "dropoffAddress",
  "vehicleType",
  "passengerName",
  "passengerPhone",
  "partnerUserRef",
  "idempotencyKey",
  "scheduledAt",
]);
export class BookingWriteJournal {
  private attempted = false;
  private snapshot: BookingJournalSnapshot | undefined;
  constructor(
    private readonly expected: BookingJournalContext,
    private readonly persist: (
      snapshot: BookingJournalSnapshot,
    ) => Promise<void>,
  ) {
    requireFact(
      /^[a-f0-9]{40}$/.test(expected.definitionSha) &&
        /^[a-f0-9]{40}$/.test(expected.runtimeSha),
      "booking journal immutable sources required",
    );
  }
  get current(): BookingJournalSnapshot | undefined {
    return this.snapshot;
  }
  async beforeSend(
    rawBody: string,
    headerKey: string,
    send: () => Promise<void>,
  ) {
    requireFact(
      !this.attempted,
      "one frozen booking send only; recover with the original key separately",
    );
    this.attempted = true;
    requireFact(
      Buffer.byteLength(rawBody, "utf8") <= 16 * 1024,
      "bounded business command required",
    );
    let value: unknown;
    try {
      value = JSON.parse(rawBody);
    } catch {
      throw new JourneyFailure("booking body must be JSON");
    }
    const body = object(value);
    requireFact(
      Object.keys(body).every((key) => bookingBusinessFields.has(key)),
      "booking journal forbids credential or unknown fields",
    );
    requireFact(
      Object.values(body).every(
        (item) => typeof item === "string" && item.length <= 2048,
      ),
      "booking business fields must be bounded strings",
    );
    for (const key of [
      "entrySlug",
      "quoteId",
      "pickupAddress",
      "dropoffAddress",
      "passengerName",
      "passengerPhone",
    ] as const) {
      requireFact(
        body[key] === this.expected[key],
        `booking:${key}:current-intent`,
      );
    }
    requireFact(
      body.vehicleType === (this.expected.vehicleType ?? undefined),
      "booking:vehicleType:current-intent",
    );
    requireFact(
      body.partnerUserRef === undefined ||
        body.partnerUserRef === this.expected.partnerUserRef,
      "booking fixed Demo subject binding",
    );
    requireFact(
      body.scheduledAt === undefined,
      "booking immediate intent required",
    );
    const key = text(body.idempotencyKey, "booking idempotency key required");
    requireFact(
      /^[a-zA-Z0-9_-]{1,255}$/.test(key) && key === headerKey,
      "booking body/header original key binding",
    );
    const pending: BookingJournalSnapshot = Object.freeze({
      version: 1,
      state: "ack_unknown",
      definitionSha: this.expected.definitionSha,
      runtimeSha: this.expected.runtimeSha,
      nonce: this.expected.nonce,
      entrySlug: this.expected.entrySlug,
      partnerUserRef: this.expected.partnerUserRef,
      quoteId: this.expected.quoteId,
      body: rawBody,
      bodySha256: hash(Buffer.from(rawBody, "utf8")),
      idempotencyKey: key,
      syntheticData: true,
      recovery:
        "Possible own write. Preserve this exact body/key; after normal same-subject authentication, resend only this body to /api/referral/booking with the same Idempotency-Key to recover its original ACK. Do not create a replacement key, clear the subject, or claim cleanup complete.",
    });
    // Durable intent must exist before any network continuation. A failed write
    // never invokes send, and a lost response retains the original command/key.
    await this.persist(pending);
    this.snapshot = pending;
    await send();
  }
  async acknowledge(orderId: string, quoteId: string) {
    const pending = this.snapshot;
    requireFact(
      pending && pending.state === "ack_unknown",
      "frozen booking intent required before ACK",
    );
    requireFact(
      quoteId === pending.quoteId,
      "booking ACK consumed frozen quote",
    );
    const acknowledged: BookingJournalSnapshot = Object.freeze({
      ...pending,
      state: "acknowledged",
      orderId: text(orderId),
    });
    await this.persist(acknowledged);
    this.snapshot = acknowledged;
  }
}

type BookingObservationPhase =
  | "booking-ui-click"
  | "booking-response-wait"
  | "booking-response-request"
  | "booking-response-json"
  | "booking-ack-persist";

function bookingObservationFailure(
  phase: BookingObservationPhase,
  error: unknown,
): JourneyFailure {
  if (error instanceof JourneyFailure) return error;
  const name = error instanceof Error ? error.name : "";
  const safeClass = [
    "TimeoutError",
    "SyntaxError",
    "TypeError",
    "Error",
  ].includes(name)
    ? name
    : "UnknownError";
  // Native messages/stacks can contain URLs, request bodies or authority.
  return new JourneyFailure(`${phase}:${safeClass}`);
}

export type BookingAckResponse = {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  json(): Promise<unknown>;
  request(): {
    url(): string;
    method(): string;
    headers(): Record<string, string>;
    postData(): string | null;
  };
};

/** Attach before clicking; consume ACK bytes while the UI action can still run. */
export async function observeOriginalBookingAck(
  responsePromise: Promise<BookingAckResponse>,
  frozen: () => {
    url: string;
    runtimeSha: string;
    journal: BookingWriteJournal | undefined;
    quote: ObjectData | undefined;
  },
  claim: (orderId: string) => void,
  evidence: Evidence,
): Promise<{ orderId: string; quoteId: string }> {
  let phase: BookingObservationPhase = "booking-response-wait";
  try {
    const response = await responsePromise;
    const status = response.status();
    evidence.record({ stage: "booking-response-observed", status });
    phase = "booking-response-request";
    const current = frozen();
    const journal = current.journal;
    const quote = current.quote;
    requireFact(
      journal && quote,
      "frozen current booking proposal required before ACK",
    );
    const pending = journal.current;
    requireFact(
      pending?.state === "ack_unknown",
      "original pending booking journal required",
    );
    const request = response.request();
    requireFact(
      response.url() === current.url &&
        request.url() === current.url &&
        request.method() === "POST",
      "booking ACK exact original endpoint",
    );
    requireFact(
      response.headers()["x-drts-candidate-sha"] === current.runtimeSha,
      "booking ACK exact served runtime",
    );
    requireFact(
      current.runtimeSha === pending.runtimeSha,
      "booking ACK original journal runtime binding",
    );
    const raw = text(
      request.postData(),
      "booking ACK original request body required",
    );
    requireFact(
      raw === pending.body &&
        hash(Buffer.from(raw, "utf8")) === pending.bodySha256 &&
        request.headers()["idempotency-key"] === pending.idempotencyKey,
      "booking ACK exact frozen bytes and header key",
    );
    const command = object(JSON.parse(raw));
    requireFact(
      command.quoteId === quote.quoteId &&
        command.quoteId === pending.quoteId &&
        command.idempotencyKey === pending.idempotencyKey,
      "one actual UI quote/idempotency binding",
    );
    phase = "booking-response-json";
    const payload = object(await response.json());
    if (status < 200 || status >= 300 || payload.ok !== true) {
      const error = payload.error;
      const code =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      throw new JourneyFailure(
        "booking-response-http",
        status,
        typeof code === "string" && /^[A-Z0-9_]{1,100}$/.test(code)
          ? code
          : undefined,
      );
    }
    const created = object(payload.data);
    const orderId = text(created.orderId);
    const quoteId = text(object(created.quote).quoteId);
    requireFact(quoteId === pending.quoteId, "create consumed exact quote");
    // Recognition follows all ownership bindings. Even a disk ACK failure leaves
    // this known own ID available to the normal same-subject cleanup readback.
    claim(orderId);
    phase = "booking-ack-persist";
    await journal.acknowledge(orderId, quoteId);
    evidence.record({
      stage: "booking-ack-durable",
      status,
      orderId,
      quoteId,
      result: "observed",
    });
    return { orderId, quoteId };
  } catch (error) {
    const failure = bookingObservationFailure(phase, error);
    evidence.failure(failure);
    throw failure;
  }
}

/** A failed click stays failed; settle its one observer before owned cleanup. */
export async function clickAndSettleOriginalBookingAck<T>(
  click: () => Promise<void>,
  observation: Promise<T>,
): Promise<T> {
  // Attach the rejection handler immediately, before waiting for the UI action.
  // Keep the failure as data until this same observation is awaited below.
  const settled = observation.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  let clickFailure: JourneyFailure | undefined;
  try {
    await click();
  } catch (error) {
    clickFailure = bookingObservationFailure("booking-ui-click", error);
  }
  const result = await settled;
  if (clickFailure) throw clickFailure;
  if (!result.ok) throw result.error;
  return result.value;
}

export type SafeEvent = {
  stage: string;
  status?: number;
  code?: string;
  orderId?: string;
  taskId?: string;
  driverId?: string;
  vehicleId?: string;
  submissionId?: string;
  documentId?: string;
  objectKey?: string;
  sha256?: string;
  bytes?: number;
  caseNo?: string;
  principalId?: string;
  membershipId?: string;
  realm?: string;
  actorType?: string;
  quoteId?: string;
  estimatedMinMinor?: number;
  estimatedMaxMinor?: number;
  result?: "observed" | "retained" | "unexecuted" | "failed" | "cleaned";
};
const eventFields = new Set([
  "stage",
  "status",
  "code",
  "orderId",
  "taskId",
  "driverId",
  "vehicleId",
  "submissionId",
  "documentId",
  "objectKey",
  "sha256",
  "bytes",
  "caseNo",
  "principalId",
  "membershipId",
  "realm",
  "actorType",
  "quoteId",
  "estimatedMinMinor",
  "estimatedMaxMinor",
  "result",
]);
export class Evidence {
  readonly events: SafeEvent[] = [];
  record(event: SafeEvent) {
    requireFact(
      Object.keys(event).every((key) => eventFields.has(key)),
      "evidence field not allowlisted",
    );
    requireFact(
      /^[a-z0-9_.:-]{1,100}$/i.test(event.stage),
      "safe evidence stage required",
    );
    this.events.push({ ...event });
  }
  failure(error: unknown) {
    this.record(
      error instanceof JourneyFailure
        ? {
            stage: error.stage.replace(/[^a-z0-9_.:-]/gi, "-").slice(0, 100),
            ...(error.status === undefined ? {} : { status: error.status }),
            ...(error.code === undefined ? {} : { code: error.code }),
            result: "failed",
          }
        : { stage: "unexpected-consumer-failure", result: "failed" },
    );
  }
}
export type CallResult = {
  status: number;
  data: unknown;
  headers: Headers;
  bytes: Uint8Array;
};
export type CallOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  expected?: number[];
  raw?: boolean;
};
export class NativeTransport {
  private readonly sessions = new Map<Role, string>();
  constructor(
    readonly origins: Origins,
    readonly expectedRuntime: string,
    private readonly invocation: Partial<Record<Role, string>>,
    private readonly fetcher: typeof fetch = fetch,
    private readonly fleetHeaders?: (url: string) => Record<string, string>,
  ) {
    requireFact(
      /^[a-f0-9]{40}$/.test(expectedRuntime),
      "immutable runtime SHA required",
    );
    Object.values(origins).forEach(origin);
  }
  setSession(role: Role, token: string) {
    requireFact(
      role !== "publicApi",
      "public exchange must not carry an application session",
    );
    mask(token);
    this.sessions.set(role, token);
  }
  headers(role: Role, url: string): Record<string, string> {
    const target = new URL(url, this.origins[originRole(role)]);
    const expectedOrigin = this.origins[originRole(role)];
    requireFact(
      target.origin === expectedOrigin &&
        !target.username &&
        !target.password &&
        !target.hash,
      "role origin isolation",
    );
    if (role === "fleet") {
      requireFact(this.fleetHeaders, "normal Fleet helper required");
      return this.fleetHeaders(target.toString());
    }
    const token = this.sessions.get(role);
    const cloud = this.invocation[originRole(role)];
    const headers: Record<string, string> = {};
    if (cloud) headers["X-Serverless-Authorization"] = `Bearer ${cloud}`;
    if (token)
      headers[
        role === "admin" || role === "ops"
          ? "x-drts-authorization"
          : "Authorization"
      ] = `Bearer ${token}`;
    return headers;
  }
  async call(
    role: Role,
    path: string,
    options: CallOptions = {},
  ): Promise<CallResult> {
    const base = this.origins[originRole(role)];
    const url = new URL(path, base).toString();
    const credentials = this.headers(role, url);
    const extra = options.headers ?? {};
    requireFact(
      !Object.keys(extra).some((key) =>
        /^(authorization|x-serverless-authorization|x-drts-authorization|x-actor-id|x-roles|x-scopes|x-realm|x-fleet-partner-id)$/i.test(
          key,
        ),
      ),
      "caller cannot replace authority headers",
    );
    requireFact(
      !Object.keys(extra).some((key) => key.toLowerCase() === "cookie") ||
        role === "referral",
      "cookie stays on Referral origin",
    );
    requireFact(
      !Object.keys(extra).some(
        (key) => key.toLowerCase() === "x-drts-google-id-token",
      ) || role === "publicApi",
      "handoff assertion stays on public API exchange",
    );
    requireFact(
      !Object.keys(extra).some((key) => key.toLowerCase() === "origin"),
      "caller cannot replace browser origin",
    );
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: options.method ?? "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
        headers: {
          "Content-Type": "application/json",
          ...credentials,
          ...(role === "referral" ? { Origin: base } : {}),
          ...extra,
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });
    } catch {
      throw new JourneyFailure(`${role}:transport`);
    }
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      if (reader)
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          requireFact(length <= 1024 * 1024, "bounded response exceeded");
          chunks.push(part.value);
        }
    } finally {
      if (reader) {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
    const bytes = Buffer.concat(chunks);
    let payload: unknown = null;
    if (!options.raw) {
      try {
        payload = camelWire(JSON.parse(bytes.toString("utf8")));
      } catch {
        /* handled by envelope guard */
      }
    }
    if (!(options.expected ?? [200, 201]).includes(response.status)) {
      const code =
        payload && typeof payload === "object"
          ? (payload as ObjectData).error
          : null;
      const value =
        code && typeof code === "object"
          ? (code as ObjectData).code
          : undefined;
      // Only this explicit application denial can authorize the retained-order
      // recovery's next normal dispatch action. An edge/mixed-version response
      // must never be interpreted as that application's cancellation decision.
      if (value === "ORDER_NOT_CANCELABLE")
        requireFact(
          response.headers.get("x-drts-candidate-sha") === this.expectedRuntime,
          `${role}:runtime SHA mismatch`,
        );
      throw new JourneyFailure(
        `${role}:request`,
        response.status,
        typeof value === "string" &&
          [
            "SCOPE_REQUIRED",
            "WORKLOAD_ROUTE_SCOPE_DENIED",
            "AUTH_REQUIRED",
            "SESSION_REVOKED",
            "SESSION_EXPIRED",
            "CONFLICT",
            "NOT_FOUND",
            "FORBIDDEN",
            "VALIDATION_ERROR",
            "ORDER_NOT_CANCELABLE",
            "AUTH_REALM_DENIED",
            "AUTH_SCOPE_DENIED",
            "DEV_WORKFORCE_SESSION_EXCHANGE_DENIED",
          ].includes(value)
          ? value
          : undefined,
      );
    }
    requireFact(
      response.headers.get("x-drts-candidate-sha") === this.expectedRuntime,
      `${role}:runtime SHA mismatch`,
    );
    const data = options.raw
      ? null
      : response.status >= 400
        ? payload
        : object(payload).data;
    if (!options.raw && response.status < 400)
      requireFact(
        data !== undefined ||
          object(payload).ok !== undefined ||
          ((role === "admin" || role === "ops") &&
            new URL(url).pathname === "/control-plane-proxy/auth/token" &&
            options.method?.toUpperCase() === "POST" &&
            typeof object(payload).token === "string" &&
            Boolean(object(payload).token) &&
            typeof object(payload).sessionId === "string" &&
            Boolean(object(payload).sessionId)),
        `${role}:response envelope`,
      );
    return {
      status: response.status,
      data: data === undefined ? payload : data,
      headers: response.headers,
      bytes,
    };
  }
}
export function assertOwnPair(
  candidate: ObjectData,
  own: { driverId: string; vehicleId: string },
) {
  requireFact(
    candidate.driverId === own.driverId &&
      candidate.vehicleId === own.vehicleId,
    "exact own candidate pair",
  );
  requireFact(
    Array.isArray(candidate.serviceBuckets) &&
      candidate.serviceBuckets.includes("business_dispatch"),
    "own business bucket required",
  );
  requireFact(
    candidate.eligibilityDecision === undefined ||
      candidate.eligibilityDecision === "eligible",
    "own candidate must pass normal eligibility",
  );
  requireFact(
    !Array.isArray(candidate.hardReasonCodes) ||
      candidate.hardReasonCodes.length === 0,
    "own candidate has hard eligibility blocks",
  );
  requireFact(
    typeof candidate.etaMinutes === "number" &&
      Number.isFinite(candidate.etaMinutes) &&
      candidate.etaMinutes >= 0,
    "real ETA required",
  );
}
export function assertNoForeignActive(value: unknown, ownOrderId?: string) {
  if (value === null) return;
  const active = object(value);
  if (active.active === false && active.trip === null) return;
  requireFact(
    active.active === true &&
      ownOrderId &&
      object(active.trip).orderId === ownOrderId,
    "fixed Demo subject has an unknown active order; preserve it",
  );
}
export async function terminalizeOwnOrder(
  orderId: string,
  readOwn: () => Promise<ObjectData>,
  terminate: (action: "resolve-exception-hold" | "cancel") => Promise<unknown>,
) {
  const before = await readOwn();
  requireFact(before.orderId === orderId, "cleanup exact owned order binding");
  if (before.status === "cancelled" || before.status === "completed") return;
  await terminate(
    before.status === "exception_hold" ? "resolve-exception-hold" : "cancel",
  );
  const after = await readOwn();
  requireFact(
    after.orderId === orderId &&
      (after.status === "cancelled" || after.status === "completed"),
    "own order cleanup terminal readback",
  );
}
export function assertTask(
  task: ObjectData,
  own: { taskId: string; orderId: string; driverId: string; vehicleId: string },
) {
  for (const key of ["taskId", "orderId", "driverId", "vehicleId"] as const)
    requireFact(task[key] === own[key], `task:${key}:binding`);
}
export function assertRatingReplay(
  first: ObjectData,
  next: ObjectData,
  orderId: string,
) {
  requireFact(
    first.orderId === orderId && next.orderId === orderId,
    "rating order binding",
  );
  requireFact(
    typeof first.complaintCaseNo === "string" &&
      first.complaintCaseNo.trim() &&
      first.complaintCaseNo === next.complaintCaseNo,
    "rating same canonical case",
  );
  requireFact(
    first.contactRequested === false && next.contactRequested === false,
    "rating contactfalse retained",
  );
}
export function simulationCompletion(order: ObjectData, photo: string) {
  requireFact(
    order.fixedPrice === false,
    "nonfixed actual-fare contract required",
  );
  const proof = object(order.proofRequirements);
  const minPhotoCount = integer(proof.minPhotoCount);
  requireFact(
    minPhotoCount >= 0 &&
      minPhotoCount <= 1 &&
      proof.signoffRequired !== true &&
      proof.expenseProofRequired !== true,
    "unsupported actual completion proof requirements",
  );
  requireFact(
    photo.startsWith("data:image/png;base64,"),
    "actual labeled PNG bytes required",
  );
  // Explicit driver-declared simulation, independent of estimate and payment.
  const actualFareBreakdown = {
    startMinor: 8500,
    distanceMinor: 3000,
    delayMinor: 500,
    nightMinor: 0,
  };
  return {
    completedAt: new Date().toISOString(),
    actualDistanceKm: 2.4,
    actualDurationSec: 360,
    fare: { currency: "TWD", amountMinor: 12000 },
    actualFareBreakdown,
    proof: { photos: [photo] },
  };
}

export function assertCompletedFare(
  command: ReturnType<typeof simulationCompletion>,
  task: ObjectData,
  history: ObjectData,
  receipt: ObjectData,
  receiptText: string,
) {
  const expected = command.actualFareBreakdown;
  const fare = object(task.fare);
  const breakdown = object(task.actualFareBreakdown);
  requireFact(
    fare.currency === command.fare.currency &&
      fare.amountMinor === command.fare.amountMinor &&
      Object.entries(expected).every(
        ([key, amount]) => breakdown[key] === amount,
      ) &&
      Object.values(expected).reduce((sum, amount) => sum + amount, 0) ===
        command.fare.amountMinor,
    "canonical Driver actual fare and breakdown readback",
  );
  const total = command.fare.amountMinor / 100;
  requireFact(history.fareTotal === total, "history actual fare readback");
  const components = {
    fareBase: expected.startMinor / 100,
    fareDistance: expected.distanceMinor / 100,
    fareTime: expected.delayMinor / 100,
    fareNight: expected.nightMinor / 100,
  };
  requireFact(
    receipt.totalFare === total &&
      receipt.formattedTotal === `NT$ ${total}` &&
      Object.entries(components).every(
        ([key, amount]) => receipt[key] === amount,
      ) &&
      receipt.paymentChannel === "付款及結算狀態未提供",
    "receipt actual fare without payment assertion",
  );
  const lines = new Set(receiptText.split(/\r?\n/).map((line) => line.trim()));
  for (const line of [
    `Base Fare: NT$ ${components.fareBase}`,
    `Distance Fare: NT$ ${components.fareDistance}`,
    `Time Fare: NT$ ${components.fareTime}`,
    `Night Fare: NT$ ${components.fareNight}`,
    `TOTAL FARE: NT$ ${total}`,
  ])
    requireFact(lines.has(line), "downloaded TXT actual fare readback");
}

type ReferralCookieContext = {
  clearCookies(options: { name: string; domain: string }): Promise<void>;
  addCookies(
    cookies: {
      name: string;
      value: string;
      url: string;
      httpOnly: boolean;
      secure: boolean;
      sameSite: "Lax";
      expires?: number;
    }[],
  ): Promise<void>;
};
export async function adoptReferralSession(
  context: ReferralCookieContext,
  headers: Headers,
  target: string,
) {
  const values = headers.getSetCookie();
  requireFact(
    values.some((value) => value.startsWith("drts_referral_embed_session=")),
    "Referral cookie issuance ACK required",
  );
  for (const cookie of values) {
    if (!/^drts_referral_embed_(session|bearer)=/.test(cookie)) continue;
    const parts = cookie.split(";").map((value) => value.trim());
    const first = text(parts[0], "Referral cookie key/value ACK required");
    const equal = first.indexOf("=");
    requireFact(equal > 0, "Referral cookie delimiter required");
    const name = first.slice(0, equal);
    const value = first.slice(equal + 1);
    const maxAgeField = parts.find((part) => /^max-age=/i.test(part));
    const maxAge = maxAgeField ? Number(maxAgeField.split("=")[1]) : undefined;
    if (!value) {
      const expiresField = parts.find((part) => /^expires=/i.test(part));
      const expiresAt = expiresField
        ? Date.parse(expiresField.slice(expiresField.indexOf("=") + 1))
        : NaN;
      requireFact(
        name === "drts_referral_embed_bearer" &&
          (maxAge === 0 ||
            (maxAge === undefined &&
              Number.isFinite(expiresAt) &&
              expiresAt <= Date.now())),
        "only explicit pending-bearer deletion allowed",
      );
      await context.clearCookies({ name, domain: new URL(target).hostname });
      continue;
    }
    mask(value);
    requireFact(
      parts.some((part) => /^httponly$/i.test(part)) &&
        parts.some((part) => /^secure$/i.test(part)),
      "actual Referral HttpOnly Secure cookie required",
    );
    requireFact(
      !parts.some((part) => /^domain=/i.test(part)),
      "Referral cookie must remain host scoped",
    );
    requireFact(
      parts.some((part) => /^samesite=lax$/i.test(part)),
      "actual Referral SameSite cookie required",
    );
    requireFact(
      maxAge === undefined || (Number.isSafeInteger(maxAge) && maxAge > 0),
      "live Referral cookie lifetime required",
    );
    await context.addCookies([
      {
        name,
        value,
        url: target,
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        ...(maxAge === undefined
          ? {}
          : { expires: Date.now() / 1000 + maxAge }),
      },
    ]);
  }
}
