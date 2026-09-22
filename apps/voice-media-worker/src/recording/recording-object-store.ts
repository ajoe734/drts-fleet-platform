import { createHash } from "node:crypto";

/**
 * Object-store boundary for sealed recording segments (SD §8.2: "每個已封閉
 * 片段有 object key、immutable version、checksum ... Recorder 以認證介面回報；
 * evidence service 驗證 object 版本、可讀性、雜湊 ..."). Mirrors the fail-closed
 * provider-selection shape used by `media-provider.ts` and the CTI adapter:
 * no vendor is selected here, only a sandbox (non-production) fixture and an
 * "unconfigured" fail-closed slot.
 *
 * A put is immutable: the same `objectKey` never gets overwritten. Each call
 * receives a new, monotonically increasing `objectVersion`, and every
 * previously issued version stays independently readable so a later
 * readback/audit can always re-fetch exactly the bytes that were checksummed
 * at seal time.
 */

export class RecordingObjectStoreError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RecordingObjectStoreError";
  }
}

export interface RecordingObjectPutResult {
  objectKey: string;
  objectVersion: number;
  checksum: string;
  byteSize: number;
}

export interface RecordingObjectReadbackResult {
  readable: boolean;
  checksumMatches: boolean;
  byteSize: number | null;
}

export interface RecordingObjectStore {
  readonly providerName: string;
  readonly isProductionCapable: boolean;
  /** Writes an immutable object version and returns its checksum/size. */
  putSealedObject(
    objectKey: string,
    bytes: Uint8Array,
  ): Promise<RecordingObjectPutResult>;
  /**
   * Re-reads a previously sealed object version and independently confirms
   * it is readable and its bytes still hash to `expectedChecksum`. This is
   * the "可讀性...驗證" step -- a caller must never treat the checksum
   * returned at `putSealedObject` time as sufficient evidence on its own.
   */
  verifyReadback(
    objectKey: string,
    objectVersion: number,
    expectedChecksum: string,
  ): Promise<RecordingObjectReadbackResult>;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Deterministic in-memory fixture store. Never production-capable: it holds
 * bytes in process memory only, with no durability across a restart, so it
 * must never be selected to back a real gate decision.
 */
export class InMemoryRecordingObjectStore implements RecordingObjectStore {
  readonly providerName = "sandbox";
  readonly isProductionCapable = false as const;

  private readonly versionsByKey = new Map<string, Uint8Array[]>();

  async putSealedObject(
    objectKey: string,
    bytes: Uint8Array,
  ): Promise<RecordingObjectPutResult> {
    const existing = this.versionsByKey.get(objectKey) ?? [];
    // Immutable append: prior versions are never replaced or removed.
    const nextVersions = [...existing, bytes.slice()];
    this.versionsByKey.set(objectKey, nextVersions);
    return {
      objectKey,
      objectVersion: nextVersions.length,
      checksum: sha256Hex(bytes),
      byteSize: bytes.byteLength,
    };
  }

  async verifyReadback(
    objectKey: string,
    objectVersion: number,
    expectedChecksum: string,
  ): Promise<RecordingObjectReadbackResult> {
    const versions = this.versionsByKey.get(objectKey);
    const stored = versions?.[objectVersion - 1];
    if (!stored) {
      return { readable: false, checksumMatches: false, byteSize: null };
    }
    const actualChecksum = sha256Hex(stored);
    return {
      readable: true,
      checksumMatches: actualChecksum === expectedChecksum,
      byteSize: stored.byteLength,
    };
  }
}

export function createUnconfiguredRecordingObjectStore(
  providerName: string,
): RecordingObjectStore {
  return {
    providerName,
    isProductionCapable: false,
    async putSealedObject(): Promise<RecordingObjectPutResult> {
      throw new RecordingObjectStoreError(
        "VOICE_RECORDING_OBJECT_STORE_NOT_CONFIGURED",
        `Recording object store '${providerName}' has no adapter configuration; refusing to seal segments until a real store is selected and configured.`,
        { providerName },
      );
    },
    async verifyReadback(): Promise<RecordingObjectReadbackResult> {
      throw new RecordingObjectStoreError(
        "VOICE_RECORDING_OBJECT_STORE_NOT_CONFIGURED",
        `Recording object store '${providerName}' has no adapter configuration; refusing to verify readback until a real store is selected and configured.`,
        { providerName },
      );
    },
  };
}
