import { createHash, randomUUID } from "node:crypto";

export interface GoogleCloudTokens {
  accessToken(signal: AbortSignal): Promise<string>;
  identityToken(audience: string, signal: AbortSignal): Promise<string>;
}
export class GoogleCloudHttpError extends Error {
  constructor(
    readonly status: number,
    readonly service: "storage" | "metadata" | "scanner",
  ) {
    super(`Google Cloud ${service} request failed (${status}).`);
  }
}

/** Bounds the entire operation, including token acquisition and body reads. */
export async function withCloudDeadline<T>(
  ms: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Google Cloud operation timed out."));
    }, ms);
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer!);
    controller.abort();
  }
}

export async function readCloudBody(
  response: Response,
  limit: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing Google Cloud response body.");
  const chunks: Buffer[] = [];
  let size = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("Google Cloud response exceeds limit.");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Cloud Run's official metadata credentials, not AWS keys or fixture tokens. */
export class GoogleMetadataTokens implements GoogleCloudTokens {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  private async metadata(path: string, signal: AbortSignal): Promise<Buffer> {
    const response = await this.fetchImpl(
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/${path}`,
      { headers: { "Metadata-Flavor": "Google" }, redirect: "error", signal },
    );
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new GoogleCloudHttpError(response.status, "metadata");
    }
    if (response.headers.get("metadata-flavor") !== "Google")
      throw new Error("Invalid metadata response.");
    return readCloudBody(response, 32 * 1024, signal);
  }
  async accessToken(signal: AbortSignal): Promise<string> {
    const body = JSON.parse(
      (await this.metadata("token", signal)).toString("utf8"),
    );
    if (
      body.token_type !== "Bearer" ||
      typeof body.access_token !== "string" ||
      !/^[\x21-\x7e]+$/.test(body.access_token) ||
      !Number.isFinite(body.expires_in) ||
      body.expires_in <= 0
    ) {
      throw new Error("Invalid metadata access token response.");
    }
    return body.access_token;
  }
  async identityToken(audience: string, signal: AbortSignal): Promise<string> {
    const token = (
      await this.metadata(
        `identity?audience=${encodeURIComponent(audience)}&format=full`,
        signal,
      )
    )
      .toString("utf8")
      .trim();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
      throw new Error("Invalid metadata identity token response.");
    return token;
  }
}

export interface GoogleObject {
  generation: string;
  contentType: string;
  bytes: Buffer;
  metadata: Record<string, string>;
  updated: string;
}
interface ObjectMetadata {
  generation: string;
  size: number;
  contentType: string;
  metadata: Record<string, string>;
  updated: string;
  md5Hash: string;
}
const generation = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[1-9][0-9]{0,19}$/.test(value) &&
  BigInt(value) <= 18446744073709551615n;

/** Native JSON API: generation preconditions, never S3 compatibility assumptions. */
export class GoogleCloudObjectClient {
  constructor(
    readonly bucket: string,
    private readonly tokens: GoogleCloudTokens = new GoogleMetadataTokens(),
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 30_000,
  ) {
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
      throw new Error("Invalid GCS bucket name.");
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000)
      throw new Error("Invalid GCS deadline.");
  }
  private async request(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<Response> {
    signal.throwIfAborted();
    const token = await this.tokens.accessToken(signal);
    signal.throwIfAborted();
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new GoogleCloudHttpError(response.status, "storage");
    }
    return response;
  }
  private async metadata(
    response: Response,
    key: string,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<ObjectMetadata> {
    const raw = JSON.parse(
      (await readCloudBody(response, 64 * 1024, signal)).toString("utf8"),
    );
    const size =
      typeof raw.size === "string" && /^[0-9]+$/.test(raw.size)
        ? Number(raw.size)
        : NaN;
    if (
      raw.bucket !== this.bucket ||
      raw.name !== key ||
      !generation(raw.generation) ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > maxBytes ||
      typeof raw.contentType !== "string" ||
      !raw.contentType ||
      typeof raw.updated !== "string" ||
      !Number.isFinite(Date.parse(raw.updated)) ||
      typeof raw.md5Hash !== "string" ||
      !/^[A-Za-z0-9+/]{22}==$/.test(raw.md5Hash)
    ) {
      throw new Error("Invalid GCS object metadata.");
    }
    const metadata = raw.metadata ?? {};
    if (
      typeof metadata !== "object" ||
      Array.isArray(metadata) ||
      metadata === null ||
      Object.values(metadata).some((v) => typeof v !== "string")
    )
      throw new Error("Invalid GCS custom metadata.");
    return {
      generation: raw.generation,
      size,
      contentType: raw.contentType,
      updated: raw.updated,
      md5Hash: raw.md5Hash,
      metadata,
    };
  }
  async put(
    key: string,
    input: Buffer,
    contentType: string,
    metadata: Record<string, string>,
    expected?: string | null,
  ): Promise<string> {
    if (!key || !input.length) throw new Error("Empty GCS object.");
    // This value is now also a multipart header, not only JSON metadata.
    // Preserve MIME parameters, but reject header injection/control characters
    // and unbounded values before acquiring credentials or issuing any I/O.
    if (
      typeof contentType !== "string" ||
      contentType.length > 1024 ||
      !/^[\x21-\x7e][\x20-\x7e]*$/.test(contentType) ||
      contentType.trim() !== contentType
    )
      throw new Error("Invalid GCS content type.");
    if (expected !== undefined && expected !== null && !generation(expected))
      throw new Error("Invalid GCS generation fence.");
    const bytes = Buffer.from(input);
    const digest = createHash("md5").update(bytes).digest("base64"); // Transfer integrity; domain identity remains SHA256.
    const boundary = `drts-${randomUUID()}`;
    const descriptor = JSON.stringify({
      name: key,
      contentType,
      metadata: { ...metadata },
      md5Hash: digest,
    });
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${descriptor}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    return withCloudDeadline(this.timeoutMs, async (signal) => {
      const url = new URL(
        `https://storage.googleapis.com/upload/storage/v1/b/${this.bucket}/o`,
      );
      url.searchParams.set("uploadType", "multipart");
      if (expected !== undefined)
        url.searchParams.set("ifGenerationMatch", expected ?? "0");
      const response = await this.request(
        url.toString(),
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: new Uint8Array(payload),
        },
        signal,
      );
      const stored = await this.metadata(response, key, bytes.length, signal);
      if (
        stored.size !== bytes.length ||
        stored.contentType !== contentType ||
        stored.md5Hash !== digest
      ) {
        throw new Error(
          "GCS upload acknowledgement does not match submitted bytes.",
        );
      }
      return stored.generation;
    });
  }
  async get(key: string, maxBytes: number): Promise<GoogleObject | null> {
    return withCloudDeadline(this.timeoutMs, async (signal) => {
      const url = new URL(
        `https://storage.googleapis.com/storage/v1/b/${this.bucket}/o/${encodeURIComponent(key)}`,
      );
      let response: Response;
      try {
        response = await this.request(url.toString(), {}, signal);
      } catch (error) {
        if (
          error instanceof GoogleCloudHttpError &&
          error.service === "storage" &&
          error.status === 404
        )
          return null;
        throw error;
      }
      const info = await this.metadata(response, key, maxBytes, signal);
      url.searchParams.set("alt", "media");
      url.searchParams.set("generation", info.generation); // Metadata and body must describe ONE immutable generation.
      const bytes = await readCloudBody(
        await this.request(url.toString(), {}, signal),
        info.size,
        signal,
      );
      if (
        bytes.length !== info.size ||
        createHash("md5").update(bytes).digest("base64") !== info.md5Hash
      ) {
        throw new Error("GCS download integrity mismatch.");
      }
      return {
        generation: info.generation,
        contentType: info.contentType,
        metadata: info.metadata,
        updated: info.updated,
        bytes,
      };
    });
  }
}
