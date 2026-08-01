import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  IAM_STAGE15_ERROR_CODES,
  IAM_STAGE15_OPERATION_CATALOG,
} from "@drts/contracts";

import {
  PUBLIC_PARTNER_AUTH_ERROR_CODE,
  PUBLIC_TENANT_AUTH_ERROR_CODE,
} from "../../apps/api/src/common/iam-error-codes";

const OPENAPI_PATH = resolve(
  process.cwd(),
  "openapi/iam-stage15-contracts-v1.yaml",
);
const SERVICE_CONTRACTS_PATH = resolve(process.cwd(), "phase1_service_contracts_v1.md");

describe("IAM Stage 1.5 contract catalog", () => {
  const openapi = readFileSync(OPENAPI_PATH, "utf8");
  const serviceContracts = readFileSync(SERVICE_CONTRACTS_PATH, "utf8");

  it("publishes every Stage 1.5 IAM operation in OpenAPI", () => {
    for (const operation of IAM_STAGE15_OPERATION_CATALOG) {
      expect(openapi).toContain(`operationId: ${operation.operationId}`);
      expect(openapi).toContain(operation.path);
    }
  });

  it("publishes every stable IAM error code in OpenAPI", () => {
    for (const code of IAM_STAGE15_ERROR_CODES) {
      expect(openapi).toContain(code);
    }
  });

  it("keeps public auth errors anti-enumerating", () => {
    expect(PUBLIC_TENANT_AUTH_ERROR_CODE).toBe("AUTH_SESSION_EXCHANGE_DENIED");
    expect(PUBLIC_PARTNER_AUTH_ERROR_CODE).toBe("AUTH_CREDENTIALS_INVALID");
    expect(openapi).not.toContain("TENANT_USER_NOT_INVITED");
    expect(openapi).not.toContain("TENANT_USER_SUSPENDED");
    expect(openapi).not.toContain("TENANT_SCOPE_MISMATCH");
    expect(openapi).not.toContain("PARTNER_API_KEY_INVALID");
  });

  it("documents mutation metadata as canonical IAM contract requirements", () => {
    expect(openapi).toContain("IamMutationMetadata");
    expect(openapi).toContain("reasonCode");
    expect(openapi).toContain("expectedVersion");
  });

  it("records the canonical Stage 1.5 supplement in service contracts", () => {
    expect(serviceContracts).toContain("Stage 1.5 IAM Contract Supplement");
    expect(serviceContracts).toContain("openapi/iam-stage15-contracts-v1.yaml");
  });
});
