import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { GoogleCloudObjectClient } from "../google-cloud/google-cloud-object-client";
import { GcsDocumentArtifactStoreAdapter } from "./gcs-document-artifact-store.adapter";

import type {
  DocumentArtifactEntry,
  DocumentArtifactStore,
  PutIfAbsentDocumentArtifactResult,
  PutIfUnchangedDocumentArtifactResult,
} from "./document-artifact.types";
import { InMemoryDocumentArtifactStore } from "./in-memory-document-artifact-store";
import { S3DocumentArtifactStoreAdapter } from "./s3-document-artifact-store.adapter";

type Env = Record<string, string | undefined>;
const value = (env: Env, key: string) => env[key]?.trim() || "";
function required(env: Env, key: string) {
  const result = value(env, key);
  if (!result) throw new Error(`${key} is required.`);
  return result;
}
function bool(env: Env, key: string, fallback: boolean) {
  const result = value(env, key);
  if (!result) return fallback;
  if (result !== "true" && result !== "false")
    throw new Error(`${key} must be true or false.`);
  return result === "true";
}

/**
 * The fail-closed default for every environment that has not explicitly
 * configured durable storage: every `put`/`get` throws rather than silently
 * falling back to an in-process store that a sibling Cloud Run instance (or
 * this same instance after a restart) could never read from. Mirrors
 * `UnprovisionedRemittanceProofStorageAdapter`.
 */
export class UnprovisionedDocumentArtifactStore implements DocumentArtifactStore {
  private readonly reason =
    "Durable document artifact storage is not configured.";

  async put(): Promise<never> {
    throw new Error(this.reason);
  }

  async putIfAbsent(): Promise<PutIfAbsentDocumentArtifactResult> {
    throw new Error(this.reason);
  }

  async putIfUnchanged(): Promise<PutIfUnchangedDocumentArtifactResult> {
    throw new Error(this.reason);
  }

  async get(): Promise<DocumentArtifactEntry | null> {
    throw new Error(this.reason);
  }
}

export function createDocumentArtifactStore(
  env: Env = process.env,
): DocumentArtifactStore {
  // Any strict deployment marker wins. CI/test flags or a lower-priority
  // environment alias must not turn a staging/production instance into a
  // process-local store. Enforce this at runtime, not only in deploy-dev.
  const strict = ["DRTS_ENV", "APP_ENV", "NODE_ENV"].some((key) =>
    ["prod", "production", "stage", "staging"].includes(
      value(env, key).toLowerCase(),
    ),
  );
  const provider =
    value(env, "DOCUMENT_ARTIFACT_STORAGE_PROVIDER") ||
    (!strict && env.NODE_ENV === "test" ? "memory" : "unprovisioned");
  if (provider === "unprovisioned")
    return new UnprovisionedDocumentArtifactStore();
  // Hosted hermetic fixtures may explicitly opt in without changing
  // unrelated auth settings, but never when any environment is strict.
  if (provider === "memory") {
    if (strict) {
      throw new Error(
        "In-memory document artifact storage is forbidden in staging/production.",
      );
    }
    return new InMemoryDocumentArtifactStore();
  }
  if (provider === "gcs") {
    return new GcsDocumentArtifactStoreAdapter(
      new GoogleCloudObjectClient(
        required(env, "DOCUMENT_ARTIFACT_GCS_BUCKET"),
      ),
    );
  }
  if (provider !== "s3")
    throw new Error(
      "Document artifact storage must be s3 or gcs; memory is test-only.",
    );

  const clientConfig: S3ClientConfig = {
    region: required(env, "DOCUMENT_ARTIFACT_S3_REGION"),
    forcePathStyle: bool(env, "DOCUMENT_ARTIFACT_S3_FORCE_PATH_STYLE", false),
  };
  const endpoint = value(env, "DOCUMENT_ARTIFACT_S3_ENDPOINT");
  if (endpoint) {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error(
        "Document artifact S3 endpoint must use HTTPS without embedded credentials/query/fragment.",
      );
    }
    clientConfig.endpoint = endpoint;
  }
  const accessKeyId = value(env, "DOCUMENT_ARTIFACT_S3_ACCESS_KEY_ID");
  const secretAccessKey = value(env, "DOCUMENT_ARTIFACT_S3_SECRET_ACCESS_KEY");
  const sessionToken = value(env, "DOCUMENT_ARTIFACT_S3_SESSION_TOKEN");
  if (
    Boolean(accessKeyId) !== Boolean(secretAccessKey) ||
    (sessionToken && !accessKeyId)
  ) {
    throw new Error(
      "Document artifact S3 credentials must be supplied as a complete pair.",
    );
  }
  if (accessKeyId && secretAccessKey)
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };

  return new S3DocumentArtifactStoreAdapter({
    bucket: required(env, "DOCUMENT_ARTIFACT_S3_BUCKET"),
    clientConfig,
  });
}
