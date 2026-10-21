export interface FleetDocumentUploadIntent {
  uploadUrl: string;
  method: string;
  headers: Record<string, string>;
}

export type FleetUploadStage =
  | "intent_created"
  | "put_completed"
  | "confirm_completed";

export interface FleetStagedUploadSession<
  TIntent extends FleetDocumentUploadIntent = FleetDocumentUploadIntent,
> {
  file: File;
  scopeKey: string;
  intent: TIntent;
  stage: FleetUploadStage;
}

export interface FleetDocumentRequestError extends Error {
  status?: number;
  code?: string;
}

export function createFleetDocumentError(
  message: string,
  status?: number,
  code?: string,
): FleetDocumentRequestError {
  const error = new Error(message) as FleetDocumentRequestError;
  if (typeof status === "number") error.status = status;
  if (typeof code === "string" && code.length > 0) error.code = code;
  return error;
}

export function isFleetUploadIntentExpiredError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    status?: unknown;
    code?: unknown;
    message?: unknown;
  };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message =
    typeof candidate.message === "string" ? candidate.message : "";
  if (code === "UPLOAD_URL_EXPIRED" || code === "UPLOAD_URL_INVALID") {
    return true;
  }
  return (
    candidate.status === 409 &&
    /expired|過期|UPLOAD_URL_EXPIRED|UPLOAD_URL_INVALID|upload intent is missing/i.test(
      message,
    )
  );
}

const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 409, 413, 422]);
const NON_RETRYABLE_ERROR_CODES = new Set([
  "DOCUMENT_SCAN_REJECTED",
  "DOCUMENT_TOO_LARGE",
  "DOCUMENT_CONTENT_MISMATCH",
  "CASE_ATTACHMENT_TOO_LARGE",
  "CASE_CLOSED_NO_REPLY",
  "CASE_PLATFORM_OWNED",
  "FLEET_SCOPE_DENIED",
  "SUPPLY_SUBMISSION_NOT_EDITABLE",
  "VALIDATION_ERROR",
]);

export function isFleetUploadRetryableError(error: unknown): boolean {
  if (isFleetUploadIntentExpiredError(error)) return false;
  if (!error || typeof error !== "object") return true;
  const candidate = error as { status?: unknown; code?: unknown };
  if (
    typeof candidate.code === "string" &&
    NON_RETRYABLE_ERROR_CODES.has(candidate.code)
  ) {
    return false;
  }
  if (
    typeof candidate.status === "number" &&
    NON_RETRYABLE_STATUS_CODES.has(candidate.status)
  ) {
    return false;
  }
  return true;
}

export function canReuseFleetUploadSession<
  TIntent extends FleetDocumentUploadIntent,
>(
  session: FleetStagedUploadSession<TIntent> | null | undefined,
  file: File,
  scopeKey: string,
): session is FleetStagedUploadSession<TIntent> {
  return Boolean(
    session && session.file === file && session.scopeKey === scopeKey,
  );
}

export interface ExecuteStagedFleetUploadOptions<
  TIntent extends FleetDocumentUploadIntent,
  TResult,
> {
  file: File;
  scopeKey: string;
  getSession: () => FleetStagedUploadSession<TIntent> | undefined;
  setSession: (session: FleetStagedUploadSession<TIntent> | undefined) => void;
  isActive?: () => boolean;
  createIntent: () => Promise<TIntent>;
  putContent?: (intent: TIntent, file: File) => Promise<void>;
  readCanonical: (intent: TIntent) => Promise<TResult | null>;
  confirmUpload: (intent: TIntent) => Promise<TResult>;
  finalizeResult?: (result: TResult, intent: TIntent) => Promise<void> | void;
}

export async function executeStagedFleetUpload<
  TIntent extends FleetDocumentUploadIntent,
  TResult,
>(
  options: ExecuteStagedFleetUploadOptions<TIntent, TResult>,
): Promise<{ aborted: true } | { aborted: false; result: TResult }> {
  const ensureActive = () => (options.isActive ? options.isActive() : true);
  if (!ensureActive()) return { aborted: true };

  const existingSession = options.getSession();
  const canReuse = canReuseFleetUploadSession(
    existingSession,
    options.file,
    options.scopeKey,
  );
  const wasResumedFromPutCompleted =
    canReuse && existingSession.stage === "put_completed";

  let session: FleetStagedUploadSession<TIntent>;
  if (canReuse) {
    session = existingSession;
  } else {
    options.setSession(undefined);
    const intent = await options.createIntent();
    if (!ensureActive()) return { aborted: true };
    session = {
      file: options.file,
      scopeKey: options.scopeKey,
      intent,
      stage: "intent_created",
    };
    options.setSession(session);
  }

  const completeWithCanonical = async (
    result: TResult,
    activeSession: FleetStagedUploadSession<TIntent>,
  ): Promise<{ aborted: true } | { aborted: false; result: TResult }> => {
    const confirmedSession: FleetStagedUploadSession<TIntent> = {
      ...activeSession,
      stage: "confirm_completed",
    };
    options.setSession(confirmedSession);
    if (options.finalizeResult) {
      await options.finalizeResult(result, confirmedSession.intent);
      if (!ensureActive()) return { aborted: true };
    }
    options.setSession(undefined);
    return { aborted: false, result };
  };

  if (session.stage === "intent_created") {
    try {
      await (options.putContent ?? putFleetDocument)(
        session.intent,
        options.file,
      );
    } catch (putError) {
      if (!ensureActive()) return { aborted: true };
      if (isFleetUploadIntentExpiredError(putError)) {
        const canonical = await options
          .readCanonical(session.intent)
          .catch(() => null);
        if (!ensureActive()) return { aborted: true };
        if (canonical !== null) {
          return completeWithCanonical(canonical, session);
        }
        options.setSession(undefined);
        throw putError;
      }
      if (!isFleetUploadRetryableError(putError)) {
        options.setSession(undefined);
      }
      throw putError;
    }
    if (!ensureActive()) return { aborted: true };
    session = { ...session, stage: "put_completed" };
    options.setSession(session);
  }

  if (session.stage === "put_completed") {
    if (wasResumedFromPutCompleted) {
      const existing = await options.readCanonical(session.intent);
      if (!ensureActive()) return { aborted: true };
      if (existing !== null) {
        return completeWithCanonical(existing, session);
      }
    }
    try {
      const confirmed = await options.confirmUpload(session.intent);
      if (!ensureActive()) return { aborted: true };
      return await completeWithCanonical(confirmed, session);
    } catch (confirmError) {
      if (!ensureActive()) return { aborted: true };
      if (options.getSession()?.stage === "confirm_completed") {
        throw confirmError;
      }
      if (isFleetUploadIntentExpiredError(confirmError)) {
        const canonical = await options
          .readCanonical(session.intent)
          .catch(() => null);
        if (!ensureActive()) return { aborted: true };
        if (canonical !== null) {
          return completeWithCanonical(canonical, session);
        }
        options.setSession(undefined);
        throw confirmError;
      }
      if (!isFleetUploadRetryableError(confirmError)) {
        options.setSession(undefined);
      }
      throw confirmError;
    }
  }

  const canonical = await options.readCanonical(session.intent);
  if (!ensureActive()) return { aborted: true };
  if (canonical === null) {
    throw createFleetDocumentError(
      "文件正本讀回尚未就緒，請重試確認",
      503,
      "DOCUMENT_READBACK_UNVERIFIED",
    );
  }
  return completeWithCanonical(canonical, session);
}

/** Carry the existing browser session's CSRF cookie on its mutation requests. */
export function fleetMutationHeaders(init: RequestInit): Headers {
  const headers = new Headers(init.headers);
  if (
    typeof document !== "undefined" &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(
      (init.method ?? "GET").toUpperCase(),
    )
  ) {
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("drts_csrf="));
    if (cookie) {
      try {
        const token = decodeURIComponent(cookie.slice("drts_csrf=".length));
        if (token) headers.set("x-csrf-token", token);
      } catch {
        // An invalid cookie remains subject to the existing middleware check.
      }
    }
  }
  return headers;
}

export function fleetDocumentProxyPath(path: string) {
  if (!/^\/api\/fleet-partner\/(cases|supply-submissions)\//.test(path)) {
    throw new Error("無效的文件傳輸路徑");
  }
  return path.replace(/^\/api\//, "/control-plane-proxy/");
}

function camelize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        camelize(item),
      ]),
    );
  return value;
}

export async function fleetDocumentRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = fleetMutationHeaders(init ?? {});
  if (!headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(fleetDocumentProxyPath(path), {
    ...init,
    headers,
  });
  const payload = camelize(await response.json().catch(() => null)) as {
    data?: T;
    error?: string | { code?: string; message?: string };
  } | null;
  if (!response.ok || !payload || payload.data === undefined) {
    const errorObj =
      payload?.error && typeof payload.error === "object"
        ? payload.error
        : undefined;
    const errorMsg =
      typeof payload?.error === "string" ? payload.error : errorObj?.message;
    throw createFleetDocumentError(
      errorMsg || `文件操作失敗 (${response.status})`,
      response.status,
      errorObj?.code,
    );
  }
  return payload.data;
}

/** A confirmation is legal only after the PUT and server scan both succeed. */
export async function putFleetDocument(
  intent: FleetDocumentUploadIntent,
  file: File,
) {
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw new Error("檔案大小須介於 1 byte 與 10 MiB 之間");
  if (intent.method !== "PUT") throw new Error("無效的上傳方式");
  const response = await fetch(fleetDocumentProxyPath(intent.uploadUrl), {
    method: "PUT",
    headers: Object.fromEntries(
      fleetMutationHeaders({ method: "PUT", headers: intent.headers }),
    ),
    body: file,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string | { code?: string; message?: string };
    } | null;
    const errorObj =
      payload?.error && typeof payload.error === "object"
        ? payload.error
        : undefined;
    const errorMsg =
      typeof payload?.error === "string" ? payload.error : errorObj?.message;
    throw createFleetDocumentError(
      errorMsg || `檔案上傳或掃描失敗 (${response.status})`,
      response.status,
      errorObj?.code,
    );
  }
}
