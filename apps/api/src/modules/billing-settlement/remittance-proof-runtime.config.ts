import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { GoogleCloudObjectClient } from "../../common/google-cloud/google-cloud-object-client";
import { GcsRemittanceProofStorageAdapter } from "./gcs-remittance-proof-storage.adapter";
import { CloudRunRemittanceProofScannerAdapter } from "./cloud-run-remittance-proof-scanner.adapter";
import { ClamdRemittanceProofScannerAdapter } from "./clamd-remittance-proof-scanner.adapter";
import { InMemoryRemittanceProofStorageAdapter } from "./remittance-proof-storage.adapter";
import { UnprovisionedRemittanceProofScannerAdapter } from "./remittance-proof-scanner.adapter";
import type { RemittanceProofStorageProvider } from "./remittance-proof-storage.port";
import { S3RemittanceProofStorageAdapter } from "./s3-remittance-proof-storage.adapter";

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

export class UnprovisionedRemittanceProofStorageAdapter implements RemittanceProofStorageProvider {
  readonly providerName = "unprovisioned";
  availability() {
    return {
      state: "unavailable" as const,
      reason: "Durable proof storage is not configured.",
    };
  }
  async stage(): Promise<never> {
    throw new Error(this.availability().reason);
  }
  async commit(): Promise<never> {
    throw new Error(this.availability().reason);
  }
  async read(): Promise<never> {
    throw new Error(this.availability().reason);
  }
}

export function createRemittanceProofStorage(
  env: Env = process.env,
): RemittanceProofStorageProvider {
  const strict = ["DRTS_ENV", "APP_ENV", "NODE_ENV"].some((key) =>
    ["prod", "production", "stage", "staging"].includes(
      value(env, key).toLowerCase(),
    ),
  );
  const provider =
    value(env, "REMITTANCE_PROOF_STORAGE_PROVIDER") ||
    (!strict && env.NODE_ENV === "test" ? "memory" : "unprovisioned");
  if (provider === "unprovisioned")
    return new UnprovisionedRemittanceProofStorageAdapter();
  if (provider === "memory" && !strict && env.NODE_ENV === "test")
    return new InMemoryRemittanceProofStorageAdapter();
  if (provider === "gcs") {
    return new GcsRemittanceProofStorageAdapter(
      new GoogleCloudObjectClient(required(env, "REMITTANCE_PROOF_GCS_BUCKET")),
    );
  }
  if (provider !== "s3")
    throw new Error("Proof storage must be s3 or gcs; memory is test-only.");
  const clientConfig: S3ClientConfig = {
    region: required(env, "REMITTANCE_PROOF_S3_REGION"),
    forcePathStyle: bool(env, "REMITTANCE_PROOF_S3_FORCE_PATH_STYLE", false),
  };
  const endpoint = value(env, "REMITTANCE_PROOF_S3_ENDPOINT");
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
        "Proof S3 endpoint must use HTTPS without embedded credentials/query/fragment.",
      );
    }
    clientConfig.endpoint = endpoint;
  }
  const accessKeyId = value(env, "REMITTANCE_PROOF_S3_ACCESS_KEY_ID");
  const secretAccessKey = value(env, "REMITTANCE_PROOF_S3_SECRET_ACCESS_KEY");
  const sessionToken = value(env, "REMITTANCE_PROOF_S3_SESSION_TOKEN");
  if (
    Boolean(accessKeyId) !== Boolean(secretAccessKey) ||
    (sessionToken && !accessKeyId)
  ) {
    throw new Error(
      "Proof S3 credentials must be supplied as a complete pair.",
    );
  }
  if (accessKeyId && secretAccessKey)
    clientConfig.credentials = {
      accessKeyId,
      secretAccessKey,
      ...(sessionToken ? { sessionToken } : {}),
    };
  return new S3RemittanceProofStorageAdapter({
    bucket: required(env, "REMITTANCE_PROOF_S3_BUCKET"),
    clientConfig,
  });
}

export function createRemittanceProofScanner(
  storage: RemittanceProofStorageProvider,
  env: Env = process.env,
) {
  const provider =
    value(env, "REMITTANCE_PROOF_SCANNER_PROVIDER") || "unprovisioned";
  if (provider === "unprovisioned")
    return new UnprovisionedRemittanceProofScannerAdapter();
  if (provider === "cloud-run-clamd") {
    return new CloudRunRemittanceProofScannerAdapter(
      storage,
      required(env, "REMITTANCE_PROOF_SCANNER_URL"),
      Number(value(env, "REMITTANCE_PROOF_SCANNER_TIMEOUT_MS") || "60000"),
    );
  }
  if (provider !== "clamd")
    throw new Error(
      "Proof scanner must be clamd or cloud-run-clamd; EICAR-only scanners are not runtime providers.",
    );
  const host = required(env, "REMITTANCE_PROOF_CLAMD_HOST");
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) throw new Error("Invalid clamd host.");
  const port = Number(value(env, "REMITTANCE_PROOF_CLAMD_PORT") || "3310");
  const timeoutMs = Number(
    value(env, "REMITTANCE_PROOF_CLAMD_TIMEOUT_MS") || "15000",
  );
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 60000
  ) {
    throw new Error("Invalid clamd port or timeout.");
  }
  // clamd has no authentication. Default to TLS (e.g. a private verified TLS
  // tunnel); disabling TLS is an explicit private-network operator decision.
  return new ClamdRemittanceProofScannerAdapter(storage, {
    host,
    port,
    timeoutMs,
    tls: bool(env, "REMITTANCE_PROOF_CLAMD_TLS", true),
  });
}
