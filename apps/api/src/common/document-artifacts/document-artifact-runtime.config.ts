import type { S3ClientConfig } from "@aws-sdk/client-s3";

import type {
  DocumentArtifactEntry,
  DocumentArtifactStore,
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

  async get(): Promise<DocumentArtifactEntry | null> {
    throw new Error(this.reason);
  }
}

export function createDocumentArtifactStore(
  env: Env = process.env,
): DocumentArtifactStore {
  const provider =
    value(env, "DOCUMENT_ARTIFACT_STORAGE_PROVIDER") ||
    (env.NODE_ENV === "test" ? "memory" : "unprovisioned");
  if (provider === "unprovisioned")
    return new UnprovisionedDocumentArtifactStore();
  if (provider === "memory" && env.NODE_ENV === "test")
    return new InMemoryDocumentArtifactStore();
  if (provider !== "s3")
    throw new Error(
      "Document artifact storage must be s3; memory is test-only.",
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
