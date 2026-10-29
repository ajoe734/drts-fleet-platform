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
    public readonly transportFacts?: NativeTransportFailureFacts,
  ) {
    super(
      `${stage}${status ? `: HTTP ${status}` : ""}${code ? ` ${code}` : ""}`,
    );
  }
}

type NativeTransportFailureFacts = {
  nativeFailureClass: string;
  nativeCauseCode: string;
  requestAborted: boolean;
  requestDurationMs: number;
  requestMethod: string;
  requestRoute: "/" | "OTHER";
};

function nativeTransportFailureFacts(
  error: unknown,
  signal: AbortSignal,
  startedAt: number,
  method: string,
  path: string,
): NativeTransportFailureFacts {
  let nativeFailureClass = "UNKNOWN";
  let nativeCauseCode = "UNKNOWN";
  // Fetch errors can retain credentials in their message, URL, stack or cause.
  // Read only standard names/codes; even an accessor throwing is just unknown.
  try {
    const name = (error as { name?: unknown } | null)?.name;
    if (
      typeof name === "string" &&
      [
        "Error",
        "TypeError",
        "RangeError",
        "SyntaxError",
        "AbortError",
        "TimeoutError",
        "AggregateError",
      ].includes(name)
    )
      nativeFailureClass = name;
  } catch {
    /* unknown native class */
  }
  try {
    const code = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
    if (
      typeof code === "string" &&
      [
        "ECONNRESET",
        "ECONNREFUSED",
        "ETIMEDOUT",
        "ENOTFOUND",
        "EAI_AGAIN",
        "UND_ERR_CONNECT_TIMEOUT",
        "UND_ERR_HEADERS_TIMEOUT",
        "UND_ERR_BODY_TIMEOUT",
        "UND_ERR_SOCKET",
        "CERT_HAS_EXPIRED",
        "ERR_TLS_CERT_ALTNAME_INVALID",
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      ].includes(code)
    )
      nativeCauseCode = code;
  } catch {
    /* unknown native cause */
  }
  const elapsed = performance.now() - startedAt;
  return {
    nativeFailureClass,
    nativeCauseCode,
    requestAborted: signal.aborted,
    requestDurationMs:
      Number.isFinite(elapsed) && elapsed >= 0
        ? Math.min(Math.floor(elapsed), 86_400_000)
        : 0,
    requestMethod: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ].includes(method)
      ? method
      : "OTHER",
    requestRoute: path === "/" ? "/" : "OTHER",
  };
}
export function requireFact(value: unknown, stage: string): asserts value {
  if (!value) throw new JourneyFailure(stage);
}
export type ReceiptPdfParser = (bytes: Buffer) => Promise<{ text: string }>;

/** Validate each actual file independently; PDF creation metadata may differ. */
export async function validateActualReceiptPdfBytes(
  bytes: Buffer,
  expectedText: readonly string[],
  parse: ReceiptPdfParser,
): Promise<void> {
  requireFact(
    bytes.length > 0 && bytes.subarray(0, 5).toString("ascii") === "%PDF-",
    "actual nonformal PDF bytes",
  );
  const parsed = await parse(bytes);
  const compact = (value: string) => value.replace(/\s+/g, "");
  const pdfText = compact(parsed.text);
  for (const expected of expectedText)
    requireFact(
      pdfText.includes(compact(expected)),
      "PDF contains the same completed order and actual recorded fare",
    );
}

type NativeReceiptPdfDownload = {
  url(): string;
  suggestedFilename(): string;
  failure(): Promise<string | null>;
  path(): Promise<string | null>;
};

/** Native attachment downloads can bypass Playwright's user routing entirely. */
export async function consumeNativeReceiptPdfDownload(
  ports: {
    waitForDownload(): Promise<NativeReceiptPdfDownload>;
    click(): Promise<void>;
    readFile(path: string): Promise<Buffer>;
  },
  expected: { url: string; filename: string },
  validateBytes: (bytes: Buffer) => Promise<void>,
): Promise<Buffer> {
  // Attach the rejection handler before the action; a failed click cannot leave
  // an unhandled waiter while the normal owned-resource cleanup runs.
  const pending = ports.waitForDownload();
  void pending.catch(() => undefined);
  await ports.click();
  const download = await pending;
  requireFact(
    download.url() === expected.url &&
      download.suggestedFilename() === expected.filename &&
      (await download.failure()) === null,
    "actual browser same-order PDF download",
  );
  const path = text(
    await download.path(),
    "browser PDF download file required",
  );
  const bytes = await ports.readFile(path);
  await validateBytes(bytes);
  return bytes;
}

type OriginalUiCancellationResponse = {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  body(): Promise<Buffer>;
};

/** Read the one original UI POST before releasing its navigation-causing ACK. */
export async function captureOriginalUiCancellation<
  Response extends OriginalUiCancellationResponse,
>(
  route: {
    request(): {
      method(): string;
      url(): string;
      postDataJSON(): unknown;
    };
    fetch(options: {
      maxRedirects: 0;
      maxRetries: 0;
      timeout: 15000;
    }): Promise<Response>;
    fulfill(options: { response: Response; body: Buffer }): Promise<void>;
  },
  expected: { url: string; orderId: string; runtime: string },
): Promise<CallResult & { command: ObjectData; payload: ObjectData }> {
  const request = route.request();
  requireFact(
    request.method() === "POST" && request.url() === expected.url,
    "actual UI cancellation exact original POST",
  );
  const command = object(request.postDataJSON());
  requireFact(
    typeof command.idempotencyKey === "string",
    "actual UI cancellation command key",
  );
  // Explicitly no request retries or replacement business command.
  const response = await route.fetch({
    maxRedirects: 0,
    maxRetries: 0,
    timeout: 15000,
  });
  const bytes = await response.body();
  const headers = response.headers();
  const status = response.status();
  requireFact(
    response.url() === expected.url &&
      headers["x-drts-candidate-sha"] === expected.runtime,
    "actual UI cancellation response runtime binding",
  );
  requireFact(
    bytes.length <= 1024 * 1024,
    "bounded actual UI cancellation response",
  );
  const payload = object(JSON.parse(bytes.toString("utf8")));
  if (status === 200) {
    requireFact(payload.ok === true, "actual UI cancellation success envelope");
    requireFact(
      object(payload.data).orderId === expected.orderId,
      "actual UI cancellation same owned order",
    );
  } else requireFact(payload.ok === false, "actual UI denial envelope");
  const captured = {
    status,
    data: status >= 400 ? payload : payload.data,
    headers: new Headers(headers),
    bytes,
    command,
    payload,
  };
  // After this release the product may perform full-page navigation. Never read
  // a response/request method again; only the captured RAM values are returned.
  await route.fulfill({ response, body: bytes });
  return captured;
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
  feeDisclosureVersion?: string;
  // Only new reservation callers set this, from the actual UI quote intent.
  // Historical immediate journals and their recovery parser remain unchanged.
  expectedScheduledAt?: string;
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
  "feeDisclosureVersion",
  "feeConfirmed",
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
      Object.entries(body).every(([key, item]) =>
        key === "feeConfirmed"
          ? typeof item === "boolean"
          : typeof item === "string" && item.length <= 2048,
      ),
      "booking business fields must be bounded strings",
    );
    // Historical original journals omit both fields; never upgrade their body/key.
    // Every new caller supplies an expected version from its actual quote.
    requireFact(
      this.expected.feeDisclosureVersion === undefined
        ? body.feeDisclosureVersion === undefined &&
            body.feeConfirmed === undefined
        : body.feeDisclosureVersion === this.expected.feeDisclosureVersion &&
            body.feeConfirmed === true,
      "booking exact explicit fee confirmation",
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
    if (this.expected.expectedScheduledAt === undefined) {
      requireFact(
        body.scheduledAt === undefined,
        "booking immediate intent required",
      );
    } else {
      const scheduled = this.expected.expectedScheduledAt;
      requireFact(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(scheduled) &&
          Number.isFinite(Date.parse(scheduled)) &&
          new Date(scheduled).toISOString() === scheduled &&
          body.scheduledAt === scheduled &&
          Boolean(this.expected.quoteId.trim()) &&
          Boolean(this.expected.feeDisclosureVersion?.trim()),
        "booking exact quoted scheduled intent and fee confirmation required",
      );
    }
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
  | "booking-response-body"
  | "booking-response-release"
  | "booking-original-route"
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

export function originalBookingRouteFailure(error: unknown): JourneyFailure {
  return bookingObservationFailure("booking-original-route", error);
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
    if (command.feeConfirmed === true) {
      const confirmation = object(created.feeConfirmation);
      requireFact(
        confirmation.orderId === orderId &&
          confirmation.quoteId === quoteId &&
          confirmation.disclosureVersion === command.feeDisclosureVersion &&
          confirmation.contentHash === quote.feeContentHash &&
          typeof confirmation.feeConfirmedAt === "string" &&
          Number.isFinite(Date.parse(confirmation.feeConfirmedAt)),
        "actual server per-order fee confirmation",
      );
    }
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

/** Keep the real server ACK available until durable recognition precedes UI navigation. */
export async function settleRoutedOriginalBookingAck<T>(
  response: {
    url(): string;
    status(): number;
    headers(): Record<string, string>;
    body(): Promise<Buffer>;
  },
  request: ReturnType<BookingAckResponse["request"]>,
  observe: (original: BookingAckResponse) => Promise<T>,
  release: (bytes: Buffer) => Promise<void>,
): Promise<T> {
  let bytes: Buffer;
  try {
    bytes = await response.body();
    requireFact(bytes.length <= 1024 * 1024, "bounded booking ACK required");
  } catch (error) {
    throw bookingObservationFailure("booking-response-body", error);
  }
  // The response is from this route's one real network fetch. There is no
  // replacement request, response, credential, payload or inferred order ID.
  const result = await observe({
    url: () => response.url(),
    status: () => response.status(),
    headers: () => response.headers(),
    json: async () => JSON.parse(bytes.toString("utf8")),
    request: () => request,
  }).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  let releaseError: unknown;
  try {
    // Deliver those exact server bytes even if the observer rejected them.
    // A refused or malformed ACK must not become a fabricated browser success.
    await release(bytes);
  } catch (error) {
    releaseError = error;
  }
  if (!result.ok) throw result.error;
  if (releaseError)
    throw bookingObservationFailure("booking-response-release", releaseError);
  return result.value;
}

/**
 * A failed click stays failed; settle its one observer before owned cleanup.
 * An observation that already failed, or the caller's own existing operation
 * deadline (`expired`), ends the wait for a UI click that never settles.
 */
export async function clickAndSettleOriginalBookingAck<T>(
  click: () => Promise<void>,
  observation: Promise<T>,
  expired?: AbortSignal,
): Promise<T> {
  // Attach the rejection handler immediately, before waiting for the UI action.
  // Keep the failure as data until this same observation is awaited below.
  const settled = observation.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
  // The click's own late outcome stays observed after this join has returned.
  const clicked = new Promise<void>((resolve) => resolve(click())).then(
    () => ({ kind: "clicked" as const }),
    (error: unknown) => ({
      kind: "click-failed" as const,
      failure: bookingObservationFailure("booking-ui-click", error),
    }),
  );
  const observationFailed = settled.then((result) =>
    result.ok
      ? new Promise<never>(() => undefined)
      : { kind: "observation-failed" as const, error: result.error },
  );
  let onExpired: (() => void) | undefined;
  const deadline = new Promise<{ kind: "expired"; failure: JourneyFailure }>(
    (resolve) => {
      if (!expired) return;
      onExpired = () =>
        resolve({
          kind: "expired",
          failure: bookingObservationFailure(
            "booking-ui-click",
            expired.reason,
          ),
        });
      if (expired.aborted) onExpired();
      else expired.addEventListener("abort", onExpired, { once: true });
    },
  );
  try {
    const first = await Promise.race([clicked, observationFailed, deadline]);
    if (first.kind === "observation-failed") throw first.error;
    // The operation deadline already expired with the click still pending. A
    // received ACK stays durable through its own observer; it is not success.
    if (first.kind === "expired") throw first.failure;
    const result = await Promise.race([settled, deadline]);
    if (first.kind === "click-failed") throw first.failure;
    if ("kind" in result) throw result.failure;
    if (!result.ok) throw result.error;
    return result.value;
  } finally {
    if (onExpired) expired?.removeEventListener("abort", onExpired);
  }
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
  nativeFailureClass?: string;
  nativeCauseCode?: string;
  requestAborted?: boolean;
  requestDurationMs?: number;
  requestMethod?: string;
  requestRoute?: "/" | "OTHER";
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
  "nativeFailureClass",
  "nativeCauseCode",
  "requestAborted",
  "requestDurationMs",
  "requestMethod",
  "requestRoute",
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
            ...error.transportFacts,
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
const DEFAULT_RESPONSE_BYTE_LIMIT = 1024 * 1024;
// TEN02 reads all committed orders, including historical/sibling rows, in RAM.
// 8 MiB gives this growing source bounded headroom; chunks and the concatenated
// buffer each retain at most 8 MiB (JSON parsing/conversion also uses memory).
// Never expose a caller-selected limit or widen ordinary JSON/binary downloads.
const CANONICAL_ORDERS_RESPONSE_BYTE_LIMIT = 8 * DEFAULT_RESPONSE_BYTE_LIMIT;
const NATIVE_REQUEST_TIMEOUT_MS = 15_000;
// Mirrors deploy-dev.yml curl_ready/curl_ready_auth --max-time 30 (readiness,
// not a business deadline). No retry is added; one request, one deadline.
const STARTUP_OPS_READINESS_TIMEOUT_MS = 30_000;
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
    // Only the startup served-runtime GET of the raw Ops dashboard HTML, before
    // any Ops application session exists, uses the existing deploy-dev
    // curl_ready_auth Ops readiness budget (30s per request). Every business,
    // POST/ACK, authenticated page, other role/route or variant keeps 15s.
    const preSessionOpsStartupProbe =
      role === "ops" &&
      path === "/dashboard" &&
      (options.method ?? "GET") === "GET" &&
      options.body === undefined &&
      options.raw === true &&
      options.expected?.length === 1 &&
      options.expected[0] === 200 &&
      !this.sessions.has("ops");
    const requestSignal = AbortSignal.timeout(
      preSessionOpsStartupProbe
        ? STARTUP_OPS_READINESS_TIMEOUT_MS
        : NATIVE_REQUEST_TIMEOUT_MS,
    );
    const requestStartedAt = performance.now();
    let response: Response;
    try {
      response = await this.fetcher(url, {
        method: options.method ?? "GET",
        redirect: "manual",
        signal: requestSignal,
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
    } catch (error) {
      throw new JourneyFailure(
        `${role}:transport`,
        undefined,
        undefined,
        nativeTransportFailureFacts(
          error,
          requestSignal,
          requestStartedAt,
          options.method ?? "GET",
          path,
        ),
      );
    }
    const canonicalOrdersRead =
      ((role === "ops" && path === "/control-plane-proxy/orders") ||
        (role === "opsApi" && path === "/api/orders")) &&
      (options.method ?? "GET") === "GET" &&
      options.body === undefined &&
      !options.raw &&
      response.status === 200 &&
      /^application\/json(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? "",
      );
    // headers() has already enforced the role's exact configured origin before
    // fetch. These are the existing Ops BFF and same-session direct API caller;
    // literal paths exclude sibling routes, queries and URL-normalized aliases.
    const responseByteLimit = canonicalOrdersRead
      ? CANONICAL_ORDERS_RESPONSE_BYTE_LIMIT
      : DEFAULT_RESPONSE_BYTE_LIMIT;
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      if (reader)
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          requireFact(length <= responseByteLimit, "bounded response exceeded");
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
export function assertBusinessOrderProduct(
  order: ObjectData,
  expectedQuoteId: string,
) {
  // OwnedOrderRecord permits an absent/null precise code. Its existing
  // compatibility contract derives that code from the bucket/subtype only.
  // An explicit contradictory code must still fail, including falsy values.
  requireFact(
    order.serviceBucket === "business_dispatch" &&
      order.businessDispatchSubtype === "enterprise_dispatch" &&
      (order.serviceProductCode == null ||
        order.serviceProductCode === "enterprise_dispatch"),
    "actual business order qualification",
  );
  const quote = object(object(order.referralPassengerLifecycle).quote);
  requireFact(
    typeof expectedQuoteId === "string" &&
      expectedQuoteId.trim().length > 0 &&
      quote.quoteId === expectedQuoteId &&
      quote.businessDispatchSubtype === "enterprise_dispatch" &&
      quote.serviceProductCode === "enterprise_dispatch" &&
      (order.serviceProductCode ?? order.businessDispatchSubtype) ===
        quote.serviceProductCode,
    "same committed business quote qualification",
  );
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

/** Real future instants; never dependent on browser/runner local time. */
export function futureTaipeiReservationIntents(
  nowMs = Date.now(),
): readonly string[] {
  requireFact(Number.isFinite(nowMs), "reservation real clock required");
  const day = new Date(nowMs + 2 * 86_400_000 + 8 * 3600_000)
    .toISOString()
    .slice(0, 10);
  const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);
  return Object.freeze([`${day}T23:55:00+08:00`, `${next}T00:05:00+08:00`]);
}

export async function verifyOwnedReservationCancellation(p: {
  intendedInput: string;
  journal: BookingWriteJournal;
  quote: ObjectData;
  orderId: string;
  readOrder: () => Promise<ObjectData>;
  readWindow: () => Promise<ObjectData>;
  cancel: () => Promise<ObjectData>;
  persist: (facts: ObjectData) => Promise<void>;
}) {
  const scheduled = new Date(p.intendedInput).toISOString();
  requireFact(
    p.intendedInput.endsWith("+08:00"),
    "explicit Taipei offset input required",
  );
  const snapshot = p.journal.current;
  requireFact(
    snapshot?.state === "acknowledged" && snapshot.orderId === p.orderId,
    "scheduled original independent acknowledged journal required",
  );
  const command = object(JSON.parse(snapshot.body));
  const before = await p.readOrder();
  requireFact(
    command.scheduledAt === scheduled &&
      command.quoteId === p.quote.quoteId &&
      p.quote.requestedScheduledAt === scheduled &&
      p.quote.timingMode === "scheduled" &&
      before.orderId === p.orderId &&
      before.reservationWindowStart === scheduled &&
      object(object(before.referralPassengerLifecycle).quote).quoteId ===
        p.quote.quoteId,
    "scheduled exact UI quote canonical reservation binding",
  );
  const window = await p.readWindow();
  const facts: ObjectData = {
    orderId: p.orderId,
    intendedInput: p.intendedInput,
    scheduledAt: scheduled,
    quoteId: p.quote.quoteId,
    journalBodySha256: snapshot.bodySha256,
    before: {
      status: before.status,
      reservationWindowStart: before.reservationWindowStart,
      cancelableUntil: before.cancelableUntil,
    },
    window,
    observedAt: new Date().toISOString(),
    terminal: false,
  };
  // Persist before policy-dependent action. A closed window retains custody;
  // no early completion, fake clock or replacement order is permitted.
  await p.persist(facts);
  requireFact(
    window.canCancel === true &&
      typeof window.cancelableUntil === "string" &&
      window.cancelableUntil === before.cancelableUntil &&
      Date.parse(window.cancelableUntil) > Date.now(),
    "scheduled cancellation window closed; retain unresolved custody",
  );
  const ack = await p.cancel();
  const after = await p.readOrder();
  requireFact(
    ack.orderId === p.orderId &&
      ack.status === "cancelled" &&
      after.orderId === p.orderId &&
      after.status === "cancelled" &&
      typeof ack.cancelledAt === "string" &&
      after.cancelledAt === ack.cancelledAt,
    "scheduled same-order cancellation ACK canonical readback",
  );
  await p.persist({
    ...facts,
    cancelACK: ack,
    terminal: true,
    after: { status: after.status, cancelledAt: after.cancelledAt },
  });
  return after;
}

/** Actual redispatch endpoint; each Driver port belongs to a different actor. */
export async function runOwnedRedispatchToSecond(p: {
  orderId: string;
  nonce: string;
  first: { driverId: string; vehicleId: string };
  second: { driverId: string; vehicleId: string };
  ops: (path: string, options?: CallOptions) => Promise<ObjectData>;
  firstDriver: (path: string, options?: CallOptions) => Promise<ObjectData>;
  secondDriver: (path: string, options?: CallOptions) => Promise<ObjectData>;
  completeSecond: (task: ObjectData) => Promise<ObjectData>;
  persist: (facts: ObjectData) => Promise<void>;
}) {
  requireFact(
    p.first.driverId !== p.second.driverId &&
      p.first.vehicleId !== p.second.vehicleId,
    "redispatch requires two distinct owned approved pairs",
  );
  const firstJob = await p.ops(
    `/orders/${encodeURIComponent(p.orderId)}/dispatch`,
    {
      method: "POST",
      body: { mode: "auto" },
      headers: { "Idempotency-Key": `${p.nonce}-dispatch` },
    },
  );
  const firstJobId = text(firstJob.dispatchJobId);
  const candidates = records(
    (
      await p.ops(
        `/dispatch/tasks/${encodeURIComponent(firstJobId)}/candidates?includeIneligible=true`,
      )
    ).items,
  );
  // Prove BOTH available candidates before redispatch; a quote is not supply proof.
  for (const pair of [p.first, p.second]) {
    const candidate = candidates.find(
      (c) => c.driverId === pair.driverId && c.vehicleId === pair.vehicleId,
    );
    requireFact(
      candidate,
      "both approved available owned candidates required before redispatch",
    );
    assertOwnPair(candidate, pair);
    requireFact(
      candidate.eligibilityDecision === "eligible",
      "explicit actual owned candidate eligibility required",
    );
  }
  const firstAck = await p.ops("/dispatch/assign", {
    method: "POST",
    body: { dispatchJobId: firstJobId, ...p.first },
    headers: { "Idempotency-Key": `${p.nonce}-assign-first` },
  });
  const firstTask = await p.firstDriver(
    `/api/driver/tasks/${encodeURIComponent(text(firstAck.taskId))}`,
  );
  requireFact(
    firstTask.orderId === p.orderId &&
      firstTask.driverId === p.first.driverId &&
      firstTask.vehicleId === p.first.vehicleId &&
      firstTask.taskId === firstAck.taskId &&
      firstTask.dispatchJobId === firstJobId &&
      firstTask.assignmentId === firstAck.assignmentId &&
      firstTask.status === "pending_acceptance",
    "redispatch original first assignment/task binding",
  );
  // The normal enterprise task contract exposes no assignmentVersion. This is
  // the sole original assignment in this journaled sequence; guard against any
  // newer assignment with version 1, never omit the guard or invent a readback.
  const version = 1;
  const command = {
    reasonCode: "synthetic_owned_second_supply",
    reasonNote: "合成同單真重派驗證",
    expectedAssignmentVersion: version,
    idempotencyKey: `${p.nonce}-redispatch`,
  };
  await p.persist({
    phase: "before-redispatch",
    orderId: p.orderId,
    firstAck,
    firstTask,
    secondPair: p.second,
    command,
    traceAuthority: "instance-local-memory-only",
    assignmentVersionProvenance:
      "version 1 guard from this sole original assignment ACK; task API has no assignmentVersion field",
  });
  const redispatched = await p.ops(
    `/orders/${encodeURIComponent(p.orderId)}/redispatch`,
    {
      method: "POST",
      body: command,
      headers: { "Idempotency-Key": command.idempotencyKey },
    },
  );
  const nextJobId = text(redispatched.dispatchJobId);
  requireFact(
    nextJobId !== firstJobId,
    "redispatch distinct new dispatch job required",
  );
  const nextCandidate = records(
    (
      await p.ops(
        `/dispatch/tasks/${encodeURIComponent(nextJobId)}/candidates?includeIneligible=true`,
      )
    ).items,
  ).find(
    (c) =>
      c.driverId === p.second.driverId && c.vehicleId === p.second.vehicleId,
  );
  requireFact(
    nextCandidate,
    "second candidate required after actual redispatch",
  );
  assertOwnPair(nextCandidate, p.second);
  const secondAck = await p.ops("/dispatch/assign", {
    method: "POST",
    body: { dispatchJobId: nextJobId, ...p.second },
    headers: { "Idempotency-Key": `${p.nonce}-assign-second` },
  });
  const secondTask = await p.secondDriver(
    `/api/driver/tasks/${encodeURIComponent(text(secondAck.taskId))}`,
  );
  const oldTask = await p.firstDriver(
    `/api/driver/tasks/${encodeURIComponent(text(firstTask.taskId))}`,
  );
  requireFact(
    oldTask.orderId === p.orderId &&
      oldTask.assignmentId === firstTask.assignmentId &&
      oldTask.taskId === firstTask.taskId &&
      oldTask.driverId === p.first.driverId &&
      oldTask.vehicleId === p.first.vehicleId &&
      oldTask.dispatchJobId === firstJobId &&
      oldTask.status === "cancelled" &&
      secondTask.orderId === p.orderId &&
      secondTask.driverId === p.second.driverId &&
      secondTask.vehicleId === p.second.vehicleId &&
      secondTask.assignmentId === secondAck.assignmentId &&
      secondTask.taskId === secondAck.taskId &&
      secondTask.status === "pending_acceptance" &&
      secondTask.dispatchJobId === nextJobId &&
      secondTask.taskId !== firstTask.taskId &&
      secondTask.assignmentId !== firstTask.assignmentId,
    "redispatch old/new same-order task assignment readback",
  );
  const completedTask = await p.completeSecond(secondTask);
  const trace = await p.ops(
    `/orders/${encodeURIComponent(p.orderId)}/dispatch-trace`,
  );
  const events = records(trace.items).filter((e) => e.orderId === p.orderId);
  await p.persist({
    phase: "completed",
    orderId: p.orderId,
    command,
    firstAck,
    oldTask,
    secondAck,
    completedTask,
    trace: events,
    traceAuthority: "instance-local-memory-only; durable completeness pending",
  });
  requireFact(
    completedTask.status === "completed" &&
      completedTask.orderId === p.orderId &&
      completedTask.taskId === secondTask.taskId &&
      completedTask.assignmentId === secondTask.assignmentId &&
      completedTask.dispatchJobId === nextJobId &&
      completedTask.driverId === p.second.driverId &&
      completedTask.vehicleId === p.second.vehicleId,
    "redispatch second driver normal completion readback",
  );
  // Missing per-instance events are diagnostic, never proof of global absence.
  return {
    completedTask,
    traceObservedRedispatchCount: events.filter(
      (e) => e.eventType === "dispatch.redispatch_required",
    ).length,
  };
}
