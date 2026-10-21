import type {
  PassengerReceiptResponse,
  MultiTaxiElectronicReceipt,
} from "@drts/contracts";
import type { PassengerClient, FetchFn } from "../client.js";
import { decodeBookingWire } from "../booking/wire.js";
import { PassengerApiError } from "../auth/errors.js";
import type { NativePassengerSession } from "./session.js";

export interface NativePassengerBinaryRequest {
  status: number;
  response: unknown;
  responseType: string;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  open(method: string, url: string, async: boolean): void;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  send(): void;
  abort(): void;
}
export interface NativePassengerBinaryResponse {
  status: number;
  contentType: string;
  disposition: string | null;
  bytes: Uint8Array;
}
export interface NativePassengerBinaryFlight {
  result: Promise<NativePassengerBinaryResponse>;
  abort(): void;
}
/** Real RN arraybuffer XHR adapter; bytes are never reconstructed from metadata. */
export function createNativePassengerBinaryTransport(
  createRequest: () => NativePassengerBinaryRequest,
) {
  return {
    get(
      url: string,
      headers: Record<string, string>,
    ): NativePassengerBinaryFlight {
      const xhr = createRequest();
      let settle: (error: unknown) => void = () => undefined;
      let done = false;
      const clean = () => {
        xhr.onload = xhr.onerror = xhr.onabort = null;
        done = true;
      };
      const result = new Promise<NativePassengerBinaryResponse>(
        (resolve, reject) => {
          settle = (error) => {
            if (done) return;
            clean();
            reject(error);
          };
          xhr.onload = () => {
            if (done) return;
            if (xhr.status < 200 || xhr.status >= 300) {
              settle(
                new PassengerApiError(
                  xhr.status,
                  "receipt_download_failed",
                  "目前無法下載乘車證明。",
                ),
              );
              return;
            }
            if (!(xhr.response instanceof ArrayBuffer)) {
              settle(
                new PassengerApiError(
                  502,
                  "invalid_receipt_bytes",
                  "乘車證明內容尚未確認。",
                ),
              );
              return;
            }
            const response = {
              status: xhr.status,
              bytes: new Uint8Array(xhr.response),
              contentType: xhr.getResponseHeader("Content-Type") ?? "",
              disposition: xhr.getResponseHeader("Content-Disposition"),
            };
            clean();
            resolve(response);
          };
          xhr.onerror = () =>
            settle(
              new PassengerApiError(503, "unavailable", "乘車證明下載中斷。"),
            );
          xhr.onabort = () =>
            settle(new PassengerApiError(499, "cancelled", "已取消下載。"));
          try {
            xhr.open("GET", url, true);
            xhr.responseType = "arraybuffer";
            for (const [name, value] of Object.entries(headers))
              xhr.setRequestHeader(name, value);
            xhr.send();
          } catch (error) {
            settle(error);
          }
        },
      );
      return {
        result,
        abort() {
          if (done) return;
          settle(new PassengerApiError(499, "cancelled", "已取消下載。"));
          xhr.abort();
        },
      };
    },
  };
}
export interface NativePassengerReceiptFilePort {
  write(input: {
    fileName: string;
    contentType: string;
    bytes: Uint8Array;
  }): Promise<string>;
  remove(uri: string): Promise<void>;
  /** Open/share the saved local artifact, not an API URL without its Bearer. */
  open(uri: string, contentType: string): Promise<void>;
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function fail(status: number, code: string): never {
  throw new PassengerApiError(
    status,
    code,
    "目前無法確認乘車證明，請重新查詢。",
  );
}
export class NativePassengerReceiptDownloads {
  private epoch = 0;
  private disposed = false;
  private flights = new Set<NativePassengerBinaryFlight>();
  constructor(
    private readonly options: {
      baseUrl: string;
      client: Pick<PassengerClient, "getRide">;
      /** Existing createNativePassengerFetch supplies persisted Bearer and refresh. */
      fetchFn: FetchFn;
      session: Pick<NativePassengerSession, "snapshot">;
      binary: ReturnType<typeof createNativePassengerBinaryTransport>;
      files: NativePassengerReceiptFilePort;
    },
  ) {}
  dispose(): void {
    this.disposed = true;
    ++this.epoch;
    for (const flight of this.flights) flight.abort();
    this.flights.clear();
  }
  async download(
    orderId: string,
    format: "html" | "pdf",
    open = true,
  ): Promise<{
    uri: string;
    receipt: MultiTaxiElectronicReceipt;
    downloads: PassengerReceiptResponse;
    contentType: string;
    byteLength: number;
  }> {
    const epoch = this.epoch;
    const before = await this.options.session.snapshot();
    if (!before) fail(401, "unauthorized");
    const assertLive = async () => {
      const current = await this.options.session.snapshot();
      if (this.disposed || epoch !== this.epoch) fail(499, "cancelled");
      if (!current || current.generation !== before.generation)
        fail(401, "session_changed");
      return current;
    };
    await assertLive();
    const { ride } = await this.options.client.getRide(orderId);
    await assertLive();
    if (!ride.actions.canReadReceipt)
      fail(403, "PASSENGER_RECEIPT_SCOPE_FORBIDDEN");
    if (!ride.receipt) fail(409, "PASSENGER_RECEIPT_PENDING");
    const base = this.options.baseUrl.replace(/\/+$/, "");
    const metadataSession = await assertLive();
    const response = await this.options.fetchFn(
      `${base}/api/passenger-app/rides/${encodeURIComponent(orderId)}/receipt/downloads`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${metadataSession.tokens.accessToken}`,
        },
      },
    );
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (response.ok) fail(502, "invalid_receipt_metadata");
    }
    const envelope = object(payload);
    if (!response.ok) {
      const error = object(envelope?.error);
      fail(
        response.status,
        typeof error?.code === "string"
          ? error.code
          : "receipt_download_failed",
      );
    }
    const downloads = object(decodeBookingWire(envelope?.data));
    const url =
      format === "pdf"
        ? downloads?.pdfUrl
        : (downloads?.htmlUrl ?? downloads?.receiptUrl);
    if (!downloads || typeof url !== "string" || !url.trim())
      fail(409, "receipt_format_unavailable");
    const current = await assertLive();
    const flight = this.options.binary.get(
      url.startsWith("/") ? `${base}${url}` : url,
      {
        Authorization: `Bearer ${current.tokens.accessToken}`,
        Accept: format === "pdf" ? "application/pdf" : "text/html",
      },
    );
    this.flights.add(flight);
    let artifact: NativePassengerBinaryResponse;
    try {
      artifact = await flight.result;
    } finally {
      this.flights.delete(flight);
    }
    await assertLive();
    const type = artifact.contentType.split(";")[0]?.trim().toLowerCase();
    if (
      type !== (format === "pdf" ? "application/pdf" : "text/html") ||
      artifact.bytes.length === 0
    )
      fail(502, "invalid_receipt_bytes");
    const supplied = artifact.disposition
      ?.match(/filename="?([^";]+)"?/i)?.[1]
      ?.trim();
    const fileName = supplied?.split(/[\\/]/).pop() || `receipt.${format}`;
    const uri = await this.options.files.write({
      fileName,
      contentType: artifact.contentType,
      bytes: artifact.bytes,
    });
    try {
      await assertLive();
      if (open) await this.options.files.open(uri, artifact.contentType);
    } catch (error) {
      await this.options.files.remove(uri);
      throw error;
    }
    return {
      uri,
      receipt: ride.receipt,
      downloads: downloads as unknown as PassengerReceiptResponse,
      contentType: artifact.contentType,
      byteLength: artifact.bytes.byteLength,
    };
  }
}
