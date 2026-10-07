export interface ObjectStorePutResult {
  /** Backend-assigned immutable version identifier for this write (e.g. an
   * S3 object version id). Never chosen by the caller. */
  versionId: string;
  /** Backend-observed durability timestamp for this exact version (e.g. an
   * S3 `LastModified`), read from the store's own response -- never the
   * caller's wall clock. */
  storedAt: string;
}

export interface ObjectStoreGetResult {
  body: Uint8Array;
  /** Confirmed by the backend for the version actually returned; callers
   * must verify this equals the version they requested. */
  versionId: string;
  storedAt: string;
  metadata: Readonly<Record<string, string>>;
}

/**
 * Provider-neutral boundary for a real, versioned, durable object-store
 * backend (SD section 10.1; `RecorderObjectStore`'s own doc: "Implementations
 * must use immutable versions and enforce retention/access policy").
 * Mirrors the same provider-neutral pattern `../media-provider.ts` already
 * uses for ASR/TTS: no vendor SDK type leaks into this interface, so
 * `ObjectStoreRecorderObjectStore` (`./object-store-recorder.ts`) can be
 * fully implemented and unit-tested today against this seam.
 *
 * No implementation of this interface is constructed in this worker's
 * production composition today. Reaching a real backend this way (the
 * `S3DriverSosAttachmentStorageAdapter` convention,
 * `apps/api/src/modules/driver-sos/s3-driver-sos-attachment-storage.adapter.ts`)
 * needs `@aws-sdk/client-s3` added to this package's own dependencies --
 * `apps/voice-media-worker/package.json` depends on nothing but
 * `@drts/contracts` today. That is a dependency-manifest/lockfile change
 * outside this task's `write_scopes` and requires the dependency-gates
 * owner's coordination before it is made (see
 * docs/04-uat/audit-voice-application-wiring-20261003.md); it is not,
 * itself, a reason to leave this seam unimplemented in the meantime.
 */
export interface ObjectStoreClient {
  putObjectVersion(
    key: string,
    bytes: Uint8Array,
    metadata: Readonly<Record<string, string>>,
  ): Promise<ObjectStorePutResult>;
  getObjectVersion(
    key: string,
    versionId: string,
  ): Promise<ObjectStoreGetResult>;
}
