import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_EICAR_BYTES,
  CANONICAL_EICAR_SHA256,
  SYNTHETIC_CLEAN_PDF_BYTES,
  SYNTHETIC_CLEAN_PDF_SHA256,
  inspectGcsObjectGenerationAndBytes,
  inspectSharedDevProviderActivation,
  redactExecutionLogText,
  runSharedDevArtifactRoundtrip,
  sha256Hex,
  // @ts-expect-error -- TS7016: no declaration file for shared-dev-artifact-roundtrip.mjs
} from '../../../e2e/system-remediation/sr-live-doc-001/shared-dev-artifact-roundtrip.mjs';

const OBSERVED_RUNTIME_SHA = '134df5cc4a436dce36fd2359f089217665d10b80';
const CANDIDATE_SHA = 'e5a23a98bf275126e41c7b95252df13493ca1e9f';
const API_ORIGIN = 'https://drts-dev-api-r6ykdme3wa-uc.a.run.app';
const PLATFORM_ADMIN_ORIGIN =
  'https://drts-dev-platform-admin-web-r6ykdme3wa-uc.a.run.app';
const PROJECT_ID = 'drts-dev-devcc-20260825';
const REGION = 'us-central1';
const RUNTIME_SA =
  'drts-dev-runtime@drts-dev-devcc-20260825.iam.gserviceaccount.com';
const REMITTANCE_BUCKET = 'drts-dev-devcc-20260825-remittance-proofs';
const DOCUMENT_BUCKET = 'drts-dev-devcc-20260825-document-artifacts';
const SCANNER_URL = 'https://drts-dev-scanner-r6ykdme3wa-uc.a.run.app';

const PLACARD_PDF_BYTES = Buffer.from(
  '%PDF-1.4\n% synthetic controlled placard artifact\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
  'utf8'
);
const PLACARD_MANIFEST_HASH = sha256Hex(PLACARD_PDF_BYTES);

interface MockFeePlanItem {
  fee_plan_id?: string;
  plan_name?: string;
  version?: string;
  status?: string;
  service_fee_bps?: number;
  reimbursement_mode?: string;
}

const APPROVED_FIXTURE_FEE_PLAN: MockFeePlanItem = {
  fee_plan_id: 'fee-plan-fixture-001',
  plan_name: 'fixture-platform-funded-reimbursement',
  version: 'v1',
  status: 'published',
  service_fee_bps: 0,
  reimbursement_mode: 'platform_funded',
};

interface MockHarnessOptions {
  providerEnvOverrides?: Record<string, string>;
  cleanInitialScanState?: 'clean' | 'pending_scan';
  eicarInitialScanState?: 'rejected' | 'pending_scan';
  eicarFinalVerdict?: {
    scan_state: string;
    rejection_reason: string | null;
  };
  eicarDownloadStatus?: number;
  eicarDownloadErrorCode?: string;
  cleanDownloadBytes?: Buffer;
  placardDownloadBytes?: Buffer;
  gcsCleanGeneration?: string;
  gcsPlacardBytes?: Buffer;
  publicInfoItems?: Array<{ publicInfoVersionId: string; status: string }>;
  responseCandidateShaHeader?: string | null;
  perPathCandidateShaHeader?: Record<string, string | null>;
  feePlanItems?: MockFeePlanItem[];
  feePlanReadbackSequence?: MockFeePlanItem[][];
  placardCreateStatus?: number;
  placardCreatePayload?: unknown;
  opsJwtToken?: string;
  driverJwtToken?: string;
  registrationCode?: string;
}

function createMockSharedDevHarness(options: MockHarnessOptions = {}) {
  const calls: {
    fetch: Array<{
      url: string;
      method: string;
      headers: Record<string, string>;
      body: string | null;
    }>;
    gcloud: Array<string[]>;
  } = {
    fetch: [],
    gcloud: [],
  };

  let cleanScans = 0;
  let eicarScans = 0;
  let feePlanGetCount = 0;
  const currentCleanStagedRef = 'staged-clean-001';
  const currentEicarStagedRef = 'staged-eicar-001';
  const currentPlacardVersionId = 'placard-version-uat-001';
  const opsJwtToken = options.opsJwtToken ?? 'ops-jwt-token-001';
  const driverJwtToken = options.driverJwtToken ?? 'driver-jwt-token-001';
  const registrationCode =
    options.registrationCode ?? 'reg-code-drv-demo-001';

  const envList = [
    { name: 'DRTS_CANDIDATE_SHA', value: OBSERVED_RUNTIME_SHA },
    { name: 'REMITTANCE_PROOF_STORAGE_PROVIDER', value: 'gcs' },
    { name: 'REMITTANCE_PROOF_GCS_BUCKET', value: REMITTANCE_BUCKET },
    { name: 'DOCUMENT_ARTIFACT_STORAGE_PROVIDER', value: 'gcs' },
    { name: 'DOCUMENT_ARTIFACT_GCS_BUCKET', value: DOCUMENT_BUCKET },
    { name: 'REMITTANCE_PROOF_SCANNER_PROVIDER', value: 'cloud-run-clamd' },
    { name: 'REMITTANCE_PROOF_SCANNER_URL', value: SCANNER_URL },
  ].map((entry) => ({
    ...entry,
    value:
      options.providerEnvOverrides &&
      Object.prototype.hasOwnProperty.call(
        options.providerEnvOverrides,
        entry.name
      )
        ? options.providerEnvOverrides[entry.name]
        : entry.value,
  }));

  const execFileImpl = async (file: string, args: string[]) => {
    expect(file).toBe('gcloud');
    calls.gcloud.push(args);

    if (args[0] === 'run' && args[1] === 'services' && args[2] === 'describe') {
      return {
        stdout: JSON.stringify({
          status: {
            latestReadyRevisionName: 'drts-dev-api-00252-xnr',
          },
          spec: {
            template: {
              spec: {
                serviceAccountName: RUNTIME_SA,
                containers: [
                  {
                    name: 'api',
                    env: envList,
                  },
                ],
              },
            },
          },
        }),
        stderr: '',
      };
    }

    const storageIdx = args.indexOf('storage');
    if (storageIdx !== -1 && args[storageIdx + 1] === 'objects') {
      const uri = args[storageIdx + 3] ?? '';
      let generation = '1775640000123456';
      if (uri.includes(SYNTHETIC_CLEAN_PDF_SHA256)) {
        generation = options.gcsCleanGeneration ?? '1775640000111111';
      } else if (uri.includes(CANONICAL_EICAR_SHA256)) {
        generation = '1775640000222222';
      } else if (uri.includes('document-artifacts/placard/')) {
        generation = '1775640000333333';
      }
      return {
        stdout: JSON.stringify({
          generation,
          size: String(SYNTHETIC_CLEAN_PDF_BYTES.byteLength),
        }),
        stderr: '',
      };
    }

    if (storageIdx !== -1 && args[storageIdx + 1] === 'cat') {
      const uriWithGen = args[storageIdx + 2] ?? '';
      if (
        uriWithGen.includes(
          `remittance-proof/content/${SYNTHETIC_CLEAN_PDF_SHA256}`
        )
      ) {
        return { stdout: SYNTHETIC_CLEAN_PDF_BYTES, stderr: '' };
      }
      if (
        uriWithGen.includes(`remittance-proof/consumed/${currentCleanStagedRef}`)
      ) {
        return {
          stdout: Buffer.from(
            JSON.stringify({
              stagedContentRef: currentCleanStagedRef,
              contentHash: SYNTHETIC_CLEAN_PDF_SHA256,
              sizeBytes: SYNTHETIC_CLEAN_PDF_BYTES.byteLength,
            }),
            'utf8'
          ),
          stderr: '',
        };
      }
      if (
        uriWithGen.includes(
          `remittance-proof/content/${CANONICAL_EICAR_SHA256}`
        )
      ) {
        return { stdout: CANONICAL_EICAR_BYTES, stderr: '' };
      }
      if (
        uriWithGen.includes(`remittance-proof/consumed/${currentEicarStagedRef}`)
      ) {
        return {
          stdout: Buffer.from(
            JSON.stringify({
              stagedContentRef: currentEicarStagedRef,
              contentHash: CANONICAL_EICAR_SHA256,
              sizeBytes: CANONICAL_EICAR_BYTES.byteLength,
            }),
            'utf8'
          ),
          stderr: '',
        };
      }
      if (
        uriWithGen.includes(
          `document-artifacts/placard/${currentPlacardVersionId}`
        )
      ) {
        return {
          stdout: options.gcsPlacardBytes ?? PLACARD_PDF_BYTES,
          stderr: '',
        };
      }
      throw new Error(`Unexpected GCS storage cat URI: ${uriWithGen}`);
    }

    throw new Error(`Unexpected gcloud invocation: ${args.join(' ')}`);
  };

  function resolveCandidateShaHeaderForPath(pathname?: string): string | null {
    if (
      pathname &&
      options.perPathCandidateShaHeader &&
      Object.prototype.hasOwnProperty.call(
        options.perPathCandidateShaHeader,
        pathname
      )
    ) {
      return options.perPathCandidateShaHeader[pathname] ?? null;
    }
    if (options.responseCandidateShaHeader !== undefined) {
      return options.responseCandidateShaHeader;
    }
    return OBSERVED_RUNTIME_SHA;
  }

  function jsonResponse(
    status: number,
    payload: unknown,
    extraHeaders: Record<string, string> = {},
    pathname?: string
  ) {
    const bodyBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    const resolvedShaHeader = resolveCandidateShaHeaderForPath(pathname);
    const headersInit: Record<string, string> = {
      'content-type': 'application/json',
      ...extraHeaders,
    };
    if (resolvedShaHeader !== null) {
      headersInit['x-drts-candidate-sha'] = resolvedShaHeader;
    }
    const headers = new Headers(headersInit);
    return {
      status,
      headers,
      arrayBuffer: async () =>
        bodyBytes.buffer.slice(
          bodyBytes.byteOffset,
          bodyBytes.byteOffset + bodyBytes.byteLength
        ),
    };
  }

  function binaryResponse(
    status: number,
    bytes: Buffer,
    contentType = 'application/pdf',
    pathname?: string
  ) {
    const resolvedShaHeader = resolveCandidateShaHeaderForPath(pathname);
    const headersInit: Record<string, string> = {
      'content-type': contentType,
    };
    if (resolvedShaHeader !== null) {
      headersInit['x-drts-candidate-sha'] = resolvedShaHeader;
    }
    const headers = new Headers(headersInit);
    return {
      status,
      headers,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ),
    };
  }

  const fetchImpl = async (
    urlInput: string | URL,
    init: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {}
  ) => {
    const url = String(urlInput);
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = { ...(init.headers ?? {}) };
    const body = typeof init.body === 'string' ? init.body : null;
    calls.fetch.push({ url, method, headers, body });

    const parsedUrl = new URL(url);

    // Enforce @OpenRoute() guard rule: open routes on apiOrigin must not carry Google WIF ID token in Authorization
    const isOpenApiRoute =
      parsedUrl.origin === API_ORIGIN &&
      (parsedUrl.pathname === '/api/auth/driver/device/register' ||
        parsedUrl.pathname.startsWith(
          '/api/reimbursements/proof-downloads/remittance-proof/'
        ) ||
        parsedUrl.pathname.startsWith('/api/downloads/placard/'));
    if (isOpenApiRoute && headers.Authorization) {
      return jsonResponse(401, {
        code: 'JWT_INVALID',
        message: '@OpenRoute() must not receive WIF token in Authorization',
      });
    }

    if (
      parsedUrl.origin === PLATFORM_ADMIN_ORIGIN &&
      parsedUrl.pathname === '/control-plane-proxy/auth/token' &&
      method === 'POST'
    ) {
      return jsonResponse(201, {
        data: {
          token: opsJwtToken,
          sessionId: 'ops-session-001',
        },
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/auth/session' &&
      method === 'GET'
    ) {
      if (headers.Authorization === `Bearer ${opsJwtToken}`) {
        return jsonResponse(200, {
          data: {
            active: true,
            identity: {
              sessionId: 'ops-session-001',
              actorId: 'principal_platform_admin_default',
              actorType: 'platform_admin',
              realm: 'platform',
              role: 'platform_admin',
              scopes: [
                'billing:read',
                'billing:write',
                'foundation:read',
                'foundation:write',
                'driver:provision',
              ],
            },
          },
        });
      }
      if (headers.Authorization === `Bearer ${driverJwtToken}`) {
        return jsonResponse(200, {
          data: {
            active: true,
            identity: {
              sessionId: 'driver-session-001',
              actorId: 'drv-demo-001',
              actorType: 'driver_user',
              realm: 'driver',
              role: 'driver',
              scopes: ['driver:read', 'driver:write'],
            },
          },
        });
      }
      return jsonResponse(401, { code: 'UNAUTHORIZED' });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/auth/driver/device/invite' &&
      method === 'POST'
    ) {
      return jsonResponse(201, {
        registration_code: registrationCode,
        driver_id: 'drv-demo-001',
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/auth/driver/device/register' &&
      method === 'POST'
    ) {
      return jsonResponse(201, {
        access_token: driverJwtToken,
        driver_id: 'drv-demo-001',
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/driver-fee-plans' &&
      method === 'GET'
    ) {
      const sequenceItems =
        options.feePlanReadbackSequence?.[feePlanGetCount];
      feePlanGetCount += 1;
      return jsonResponse(
        200,
        {
          items: sequenceItems ?? options.feePlanItems ?? [
            APPROVED_FIXTURE_FEE_PLAN,
          ],
        },
        {},
        parsedUrl.pathname
      );
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/driver-statements' &&
      method === 'GET'
    ) {
      return jsonResponse(
        200,
        {
          items: [
            {
              statement_id: 'stmt-drv-demo-001-2026-03',
              driver_id: 'drv-demo-001',
              period_month: '2026-03',
              fee_plan_version: 'v1',
              status: 'generated',
            },
          ],
        },
        {},
        parsedUrl.pathname
      );
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/reimbursements' &&
      method === 'GET'
    ) {
      return jsonResponse(
        200,
        {
          items: [
            {
              batch_id: 'reimb-drv-demo-001-2026-03',
              driver_id: 'drv-demo-001',
              period_month: '2026-03',
              statement_id: 'stmt-drv-demo-001-2026-03',
              status: 'pending',
              workflow_state: 'pending_approval',
            },
          ],
        },
        {},
        parsedUrl.pathname
      );
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/audit' &&
      method === 'GET'
    ) {
      return jsonResponse(
        200,
        {
          items: [
            {
              audit_id: 'audit-fee-plan-001',
              action_name: 'publish_driver_fee_plan',
              resource_type: 'driver_fee_plan',
              resource_id: 'fee-plan-fixture-001',
              actor_type: 'platform_admin',
            },
          ],
        },
        {},
        parsedUrl.pathname
      );
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/driver-fee-plans/publish' &&
      method === 'POST'
    ) {
      return jsonResponse(201, {});
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/driver-statements/generate' &&
      method === 'POST'
    ) {
      return jsonResponse(200, {
        reimbursementBatch: {
          batchId: 'reimb-drv-demo-001-2026-03',
          driverId: 'drv-demo-001',
          billingPeriod: '2026-03',
        },
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/reimbursements/reimb-drv-demo-001-2026-03' &&
      method === 'GET'
    ) {
      return jsonResponse(200, {
        batchId: 'reimb-drv-demo-001-2026-03',
        driverId: 'drv-demo-001',
        billingPeriod: '2026-03',
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/platform-admin/public-info' &&
      method === 'GET'
    ) {
      return jsonResponse(200, {
        items: options.publicInfoItems ?? [
          {
            publicInfoVersionId: 'public-info-demo-001',
            status: 'published',
          },
        ],
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/reimbursements/proofs/staged-content' &&
      method === 'POST'
    ) {
      const parsedBody = JSON.parse(body ?? '{}');
      const rawBytes = Buffer.from(parsedBody.contentBase64 ?? '', 'base64');
      const hash = sha256Hex(rawBytes);
      const isClean = hash === SYNTHETIC_CLEAN_PDF_SHA256;
      const stagedRef = isClean
        ? currentCleanStagedRef
        : currentEicarStagedRef;
      return jsonResponse(201, {
        staged_content_ref: stagedRef,
        content_hash: hash,
        size_bytes: rawBytes.byteLength,
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/reimbursements/proofs' &&
      method === 'POST'
    ) {
      const parsedBody = JSON.parse(body ?? '{}');
      if (parsedBody.contentHash === SYNTHETIC_CLEAN_PDF_SHA256) {
        const initialState = options.cleanInitialScanState ?? 'clean';
        return jsonResponse(201, {
          remittance_proof_id: 'proof-clean-001',
          reimbursement_batch_id: parsedBody.reimbursementBatchId,
          scan_state: initialState,
          rejection_reason: null,
          content: {
            staged_content_ref: currentCleanStagedRef,
            content_hash: SYNTHETIC_CLEAN_PDF_SHA256,
            size_bytes: SYNTHETIC_CLEAN_PDF_BYTES.byteLength,
          },
        });
      }
      const initialEicarState = options.eicarInitialScanState ?? 'rejected';
      const finalVerdict = options.eicarFinalVerdict ?? {
        scan_state: 'rejected',
        rejection_reason: 'MALWARE_DETECTED',
      };
      return jsonResponse(201, {
        remittance_proof_id: 'proof-eicar-001',
        reimbursement_batch_id: parsedBody.reimbursementBatchId,
        scan_state:
          initialEicarState === 'pending_scan'
            ? 'pending_scan'
            : finalVerdict.scan_state,
        rejection_reason:
          initialEicarState === 'pending_scan'
            ? null
            : finalVerdict.rejection_reason,
        content: {
          staged_content_ref: currentEicarStagedRef,
          content_hash: CANONICAL_EICAR_SHA256,
          size_bytes: CANONICAL_EICAR_BYTES.byteLength,
        },
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/reimbursements/proofs/proof-clean-001/scan' &&
      method === 'POST'
    ) {
      cleanScans += 1;
      return jsonResponse(200, {
        remittance_proof_id: 'proof-clean-001',
        reimbursement_batch_id: 'reimb-drv-demo-001-2026-03',
        scan_state: cleanScans >= 1 ? 'clean' : 'pending_scan',
        rejection_reason: null,
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/reimbursements/proofs/proof-eicar-001/scan' &&
      method === 'POST'
    ) {
      eicarScans += 1;
      const finalVerdict = options.eicarFinalVerdict ?? {
        scan_state: 'rejected',
        rejection_reason: 'MALWARE_DETECTED',
      };
      return jsonResponse(200, {
        remittance_proof_id: 'proof-eicar-001',
        reimbursement_batch_id: 'reimb-drv-demo-001-2026-03',
        scan_state: eicarScans >= 1 ? finalVerdict.scan_state : 'pending_scan',
        rejection_reason:
          eicarScans >= 1 ? finalVerdict.rejection_reason : null,
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname ===
        '/api/reimbursements/proofs/proof-clean-001/readback' &&
      method === 'POST'
    ) {
      return jsonResponse(200, {
        remittance_proof_id: 'proof-clean-001',
        readback_url:
          '/api/reimbursements/proof-downloads/remittance-proof/proof-clean-001?expires=1893456000&signature=sig-clean',
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname ===
        '/api/reimbursements/proofs/proof-eicar-001/readback' &&
      method === 'POST'
    ) {
      return jsonResponse(200, {
        remittance_proof_id: 'proof-eicar-001',
        readback_url:
          '/api/reimbursements/proof-downloads/remittance-proof/proof-eicar-001?expires=1893456000&signature=sig-eicar',
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname ===
        '/api/reimbursements/proof-downloads/remittance-proof/proof-clean-001' &&
      method === 'GET'
    ) {
      return binaryResponse(
        200,
        options.cleanDownloadBytes ?? SYNTHETIC_CLEAN_PDF_BYTES
      );
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname ===
        '/api/reimbursements/proof-downloads/remittance-proof/proof-eicar-001' &&
      method === 'GET'
    ) {
      const status = options.eicarDownloadStatus ?? 409;
      if (status === 200) {
        return binaryResponse(200, CANONICAL_EICAR_BYTES);
      }
      return jsonResponse(status, {
        error: {
          code:
            options.eicarDownloadErrorCode ?? 'REMITTANCE_PROOF_NOT_CLEAN',
          message: 'Remittance proof is not in clean scan_state',
        },
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/platform-admin/placards' &&
      method === 'POST'
    ) {
      if (options.placardCreateStatus && options.placardCreateStatus !== 201) {
        return jsonResponse(
          options.placardCreateStatus,
          options.placardCreatePayload ?? {
            error: {
              code: 'PLACARD_GENERATION_FAILED',
              message: 'Failed to create placard',
            },
          }
        );
      }
      return jsonResponse(201, {
        placard_version_id: currentPlacardVersionId,
        artifact_download_url: `/downloads/placard/${currentPlacardVersionId}?expires=1893456000&signature=sig-placard`,
        artifact_manifest_hash: PLACARD_MANIFEST_HASH,
        download_metadata: {
          download_url: `/downloads/placard/${currentPlacardVersionId}?expires=1893456000&signature=sig-placard`,
          manifest_hash: PLACARD_MANIFEST_HASH,
        },
      });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname ===
        `/api/downloads/placard/${currentPlacardVersionId}` &&
      method === 'GET'
    ) {
      return binaryResponse(
        200,
        options.placardDownloadBytes ?? PLACARD_PDF_BYTES
      );
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/auth/driver/device/invite/revoke' &&
      method === 'POST'
    ) {
      return jsonResponse(200, { revoked: true });
    }

    if (
      parsedUrl.origin === API_ORIGIN &&
      parsedUrl.pathname === '/api/auth/sessions/revoke' &&
      method === 'POST'
    ) {
      return jsonResponse(200, { revoked: true });
    }

    throw new Error(`Unhandled fetch request in mock harness: ${method} ${url}`);
  };

  return {
    calls,
    execFileImpl,
    fetchImpl,
  };
}

describe('SR-GCP-ARTIFACT-ACTIVATION-20261004 item 4 shared-dev artifact roundtrip', () => {
  const tempDirs: string[] = [];

  function makeTempEvidencePath() {
    const dir = mkdtempSync(join(tmpdir(), 'sr-live-doc-roundtrip-'));
    tempDirs.push(dir);
    return join(dir, 'shared-dev-artifact-roundtrip.json');
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('completes clean remittance proof upload/download, EICAR rejection/409 denial, placard readback, GCS generation verification, and session teardown', async () => {
    const evidencePath = makeTempEvidencePath();
    const harness = createMockSharedDevHarness();

    const result = await runSharedDevArtifactRoundtrip({
      evidencePath,
      candidateSha: CANDIDATE_SHA,
      apiOrigin: API_ORIGIN,
      platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
      projectId: PROJECT_ID,
      region: REGION,
      runtimeServiceAccount: RUNTIME_SA,
      expectedRemittanceBucket: REMITTANCE_BUCKET,
      expectedDocumentBucket: DOCUMENT_BUCKET,
      expectedScannerUrl: SCANNER_URL,
      apiIdToken: 'wif-id-token-api',
      platformIdToken: 'wif-id-token-platform',
      fetchImpl: harness.fetchImpl,
      execFileImpl: harness.execFileImpl,
      mask: () => {},
      scanPollIntervalMs: 1,
    });

    expect(result.status).toBe('passed');
    expect(result.candidate_sha).toBe(CANDIDATE_SHA);
    expect(result.observed_runtime_sha).toBe(OBSERVED_RUNTIME_SHA);
    expect(result.clean_remittance_proof).toMatchObject({
      remittance_proof_id: 'proof-clean-001',
      scan_state: 'clean',
      rejection_reason: null,
      uploaded_byte_length: SYNTHETIC_CLEAN_PDF_BYTES.byteLength,
      downloaded_byte_length: SYNTHETIC_CLEAN_PDF_BYTES.byteLength,
      uploaded_sha256: SYNTHETIC_CLEAN_PDF_SHA256,
      downloaded_sha256: SYNTHETIC_CLEAN_PDF_SHA256,
      bytes_equal: true,
    });
    expect(result.eicar_remittance_proof).toMatchObject({
      remittance_proof_id: 'proof-eicar-001',
      scan_state: 'rejected',
      rejection_reason: 'MALWARE_DETECTED',
      byte_length: 68,
      sha256: CANONICAL_EICAR_SHA256,
      readback_download_denied_status: 409,
      readback_download_denied_code: 'REMITTANCE_PROOF_NOT_CLEAN',
    });
    expect(result.controlled_placard).toMatchObject({
      placard_version_id: 'placard-version-uat-001',
      public_info_version_id: 'public-info-demo-001',
      pdf_header: '%PDF-',
      byte_length: PLACARD_PDF_BYTES.byteLength,
      manifest_hash: PLACARD_MANIFEST_HASH,
      downloaded_sha256: PLACARD_MANIFEST_HASH,
      hash_matches_manifest: true,
    });
    expect(result.gcs_objects?.clean_remittance_content.generation).toBe(
      '1775640000111111'
    );
    expect(result.gcs_objects?.eicar_remittance_content.generation).toBe(
      '1775640000222222'
    );
    expect(result.gcs_objects?.placard_document_artifact.generation).toBe(
      '1775640000333333'
    );
    expect(result.teardown).toEqual({
      driver_invitation_revoked: true,
      ops_session_revoked: true,
    });

    const persisted = JSON.parse(readFileSync(evidencePath, 'utf8'));
    expect(persisted.status).toBe('passed');
    expect(persisted.observed_runtime_sha).toBe(OBSERVED_RUNTIME_SHA);
  });

  it('polls Ops re-scan endpoint when initial upload returns pending_scan during scanner cold start', async () => {
    const evidencePath = makeTempEvidencePath();
    const harness = createMockSharedDevHarness({
      cleanInitialScanState: 'pending_scan',
      eicarInitialScanState: 'pending_scan',
    });

    const result = await runSharedDevArtifactRoundtrip({
      evidencePath,
      apiOrigin: API_ORIGIN,
      platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
      projectId: PROJECT_ID,
      region: REGION,
      apiIdToken: 'wif-id-token-api',
      platformIdToken: 'wif-id-token-platform',
      fetchImpl: harness.fetchImpl,
      execFileImpl: harness.execFileImpl,
      mask: () => {},
      scanPollIntervalMs: 1,
    });

    expect(result.status).toBe('passed');
    expect(result.clean_remittance_proof?.scan_attempts).toBe(2);
    expect(result.eicar_remittance_proof?.scan_attempts).toBe(2);
  });

  it('fails closed and records concrete missing items when required configuration or session inputs are missing', async () => {
    const evidencePath = makeTempEvidencePath();

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath,
        env: {},
        mask: () => {},
      })
    ).rejects.toThrow(/Missing required shared-dev roundtrip inputs/);

    const persisted = JSON.parse(readFileSync(evidencePath, 'utf8'));
    expect(persisted.status).toBe('failed');
    expect(persisted.missing).toContain(
      'SHARED_DEV_API_ORIGIN (or DEV_CONTROL_PLANE_API_ORIGIN)'
    );
    expect(persisted.missing).toContain('DEV_GCP_PROJECT_ID');
    expect(persisted.missing).toContain('DEV_GCP_REGION');
  });

  it('fails closed when Cloud Run provider activation env vars are unprovisioned or drifted', async () => {
    const harness = createMockSharedDevHarness({
      providerEnvOverrides: {
        REMITTANCE_PROOF_GCS_BUCKET: 'unprovisioned',
      },
    });

    await expect(
      inspectSharedDevProviderActivation({
        projectId: PROJECT_ID,
        region: REGION,
        execFileImpl: harness.execFileImpl,
      })
    ).rejects.toThrow(/REMITTANCE_PROOF_GCS_BUCKET is not activated/);
  });

  it('fails closed and still revokes temporary sessions when EICAR fixture is not rejected or readback is not denied with 409', async () => {
    const evidencePath = makeTempEvidencePath();
    const harness = createMockSharedDevHarness({
      eicarDownloadStatus: 200,
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: harness.fetchImpl,
        execFileImpl: harness.execFileImpl,
        mask: () => {},
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(/409 REMITTANCE_PROOF_NOT_CLEAN/);

    const persisted = JSON.parse(readFileSync(evidencePath, 'utf8'));
    expect(persisted.status).toBe('failed');
    expect(persisted.teardown).toEqual({
      driver_invitation_revoked: true,
      ops_session_revoked: true,
    });
  });

  it('fails closed when GCS object generation is invalid or stored bytes diverge from manifest hash', async () => {
    const harnessBadGen = createMockSharedDevHarness({
      gcsCleanGeneration: '0',
    });

    await expect(
      inspectGcsObjectGenerationAndBytes({
        bucket: REMITTANCE_BUCKET,
        objectKey: `remittance-proof/content/${SYNTHETIC_CLEAN_PDF_SHA256}`,
        runtimeServiceAccount: RUNTIME_SA,
        execFileImpl: harnessBadGen.execFileImpl,
      })
    ).rejects.toThrow(/did not return a positive numeric generation/);

    const evidencePath = makeTempEvidencePath();
    const harnessTamperedGcs = createMockSharedDevHarness({
      gcsPlacardBytes: Buffer.from('%PDF-1.4\ntampered\n%%EOF\n', 'utf8'),
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: harnessTamperedGcs.fetchImpl,
        execFileImpl: harnessTamperedGcs.execFileImpl,
        mask: () => {},
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(/GCS placard artifact object .* byte\/hash mismatch/);
  });

  it('R1: never emits raw secrets or ::add-mask:: values into console stdout/stderr, execution-log.txt, or evidence JSON on success and failure', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sr-live-doc-r1-redaction-'));
    tempDirs.push(dir);
    const successEvidencePath = join(dir, 'success-evidence.json');
    const successLogPath = join(dir, 'success-execution-log.txt');
    const failureEvidencePath = join(dir, 'failure-evidence.json');
    const failureLogPath = join(dir, 'failure-execution-log.txt');

    const apiWifJwt = 'eyJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJhcGkifQ.wifApiSigSecret1';
    const platformWifJwt =
      'eyJhbGciOiJSUzI1NiJ9.eyJhdWQiOiJwbGF0Zm9ybSJ9.wifPlatformSigSecret2';
    const opsJwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJvcHMifQ.opsSessionSigSecret3';
    const driverJwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJdrvIn0.driverSessionSigSecret4';
    const regCode = 'regcode_e3b0c44298fc1c149afbf4c8996fb924';
    const allSecrets = [
      apiWifJwt,
      platformWifJwt,
      opsJwt,
      driverJwt,
      regCode,
    ];

    // Pre-seed execution-log.txt as if tee captured stdout prior to finalization
    writeFileSync(
      successLogPath,
      `Runner start\n::add-mask::${apiWifJwt}\nBearer ${opsJwt}\nreg=${regCode}\n`,
      'utf8'
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const successHarness = createMockSharedDevHarness({
        opsJwtToken: opsJwt,
        driverJwtToken: driverJwt,
        registrationCode: regCode,
      });

      // Omit options.mask to exercise the real default mask behavior
      const successResult = await runSharedDevArtifactRoundtrip({
        evidencePath: successEvidencePath,
        executionLogPath: successLogPath,
        candidateSha: CANDIDATE_SHA,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: apiWifJwt,
        platformIdToken: platformWifJwt,
        fetchImpl: successHarness.fetchImpl,
        execFileImpl: successHarness.execFileImpl,
        scanPollIntervalMs: 1,
      });

      expect(successResult.status).toBe('passed');

      const consoleOutput = [
        ...logSpy.mock.calls.map((args) => args.join(' ')),
        ...errorSpy.mock.calls.map((args) => args.join(' ')),
      ].join('\n');
      const persistedSuccessLog = readFileSync(successLogPath, 'utf8');
      const persistedSuccessEvidence = readFileSync(
        successEvidencePath,
        'utf8'
      );

      for (const secret of allSecrets) {
        expect(consoleOutput).not.toContain(secret);
        expect(persistedSuccessLog).not.toContain(secret);
        expect(persistedSuccessEvidence).not.toContain(secret);
      }
      expect(consoleOutput).not.toContain('::add-mask::');
      expect(persistedSuccessLog).toContain('::add-mask::[REDACTED]');
      expect(persistedSuccessLog).not.toMatch(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/
      );

      // Failure path where upstream error body echoes all 5 credentials and tee log captured them
      writeFileSync(
        failureLogPath,
        `Failure run\n::add-mask::${platformWifJwt}\n::add-mask::${driverJwt}\n::add-mask::${regCode}\n`,
        'utf8'
      );

      const failureHarness = createMockSharedDevHarness({
        opsJwtToken: opsJwt,
        driverJwtToken: driverJwt,
        registrationCode: regCode,
        placardCreateStatus: 500,
        placardCreatePayload: {
          error: {
            code: 'INTERNAL_ERROR',
            message: `Debug dump: api=${apiWifJwt} platform=${platformWifJwt} ops=${opsJwt} driver=${driverJwt} code=${regCode}`,
          },
        },
      });

      await expect(
        runSharedDevArtifactRoundtrip({
          evidencePath: failureEvidencePath,
          executionLogPath: failureLogPath,
          candidateSha: CANDIDATE_SHA,
          apiOrigin: API_ORIGIN,
          platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
          projectId: PROJECT_ID,
          region: REGION,
          apiIdToken: apiWifJwt,
          platformIdToken: platformWifJwt,
          fetchImpl: failureHarness.fetchImpl,
          execFileImpl: failureHarness.execFileImpl,
          scanPollIntervalMs: 1,
        })
      ).rejects.toThrow(/Failed to create controlled placard version/);

      const persistedFailureLog = readFileSync(failureLogPath, 'utf8');
      const persistedFailureEvidence = readFileSync(
        failureEvidencePath,
        'utf8'
      );

      for (const secret of allSecrets) {
        expect(persistedFailureLog).not.toContain(secret);
        expect(persistedFailureEvidence).not.toContain(secret);
      }
      expect(persistedFailureLog).not.toMatch(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/
      );
      expect(persistedFailureEvidence).not.toMatch(
        /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/
      );
      expect(redactExecutionLogText(`::add-mask::${regCode}`, [regCode])).toBe(
        '::add-mask::[REDACTED]'
      );
    } finally {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });

  it('R2: reuses valid active fixture-platform-funded-reimbursement/v1 (0 bps, platform_funded) without publishing and uses deterministic statement idempotency key', async () => {
    const evidencePath = makeTempEvidencePath();
    const harness = createMockSharedDevHarness({
      feePlanItems: [APPROVED_FIXTURE_FEE_PLAN],
    });

    const result = await runSharedDevArtifactRoundtrip({
      evidencePath,
      apiOrigin: API_ORIGIN,
      platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
      projectId: PROJECT_ID,
      region: REGION,
      apiIdToken: 'wif-id-token-api',
      platformIdToken: 'wif-id-token-platform',
      fetchImpl: harness.fetchImpl,
      execFileImpl: harness.execFileImpl,
      scanPollIntervalMs: 1,
    });

    expect(result.status).toBe('passed');
    const publishCalls = harness.calls.fetch.filter((call) =>
      call.url.endsWith('/api/driver-fee-plans/publish')
    );
    expect(publishCalls).toHaveLength(0);

    const generateCalls = harness.calls.fetch.filter((call) =>
      call.url.endsWith('/api/driver-statements/generate')
    );
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]?.headers['Idempotency-Key']).toBe(
      'fixture-driver-statements-drv-demo-001-2026-03'
    );
    expect(JSON.parse(generateCalls[0]?.body ?? '{}')).toEqual({
      driverId: 'drv-demo-001',
      periodMonth: '2026-03',
    });
  });

  it('R2: publishes approved fixture-platform-funded-reimbursement/v1 (0 bps, platform_funded) when no fee plan exists and confirms activation via readback', async () => {
    const evidencePath = makeTempEvidencePath();
    const harness = createMockSharedDevHarness({
      feePlanReadbackSequence: [[], [APPROVED_FIXTURE_FEE_PLAN]],
    });

    const result = await runSharedDevArtifactRoundtrip({
      evidencePath,
      apiOrigin: API_ORIGIN,
      platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
      projectId: PROJECT_ID,
      region: REGION,
      apiIdToken: 'wif-id-token-api',
      platformIdToken: 'wif-id-token-platform',
      fetchImpl: harness.fetchImpl,
      execFileImpl: harness.execFileImpl,
      scanPollIntervalMs: 1,
    });

    expect(result.status).toBe('passed');
    const publishCalls = harness.calls.fetch.filter((call) =>
      call.url.endsWith('/api/driver-fee-plans/publish')
    );
    expect(publishCalls).toHaveLength(1);
    expect(JSON.parse(publishCalls[0]?.body ?? '{}')).toEqual({
      planName: 'fixture-platform-funded-reimbursement',
      version: 'v1',
      serviceFeeBps: 0,
      reimbursementMode: 'platform_funded',
    });
  });

  it('R2: fails closed when a different active fee plan shadows fixture-platform-funded-reimbursement/v1 instead of publishing a new plan', async () => {
    const evidencePath = makeTempEvidencePath();
    const harness = createMockSharedDevHarness({
      feePlanItems: [
        {
          fee_plan_id: 'fee-plan-other-009',
          plan_name: 'someone-elses-plan',
          version: 'v9',
          status: 'published',
          service_fee_bps: 1500,
          reimbursement_mode: 'mixed',
        },
        APPROVED_FIXTURE_FEE_PLAN,
      ],
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: harness.fetchImpl,
        execFileImpl: harness.execFileImpl,
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(
      /already exists but a different, more recently published fee plan \(someone-elses-plan\/v9\) is now active/
    );

    const publishCalls = harness.calls.fetch.filter((call) =>
      call.url.endsWith('/api/driver-fee-plans/publish')
    );
    const generateCalls = harness.calls.fetch.filter((call) =>
      call.url.endsWith('/api/driver-statements/generate')
    );
    expect(publishCalls).toHaveLength(0);
    expect(generateCalls).toHaveLength(0);

    const persisted = JSON.parse(readFileSync(evidencePath, 'utf8'));
    expect(persisted.status).toBe('failed');
    expect(persisted.missing).toContain(
      'driver_fee_plan:fixture-platform-funded-reimbursement/v1:shadowed'
    );
    expect(persisted.fee_plan_readback_audit).toMatchObject({
      active_plan: {
        plan_name: 'someone-elses-plan',
        version: 'v9',
        service_fee_bps: 1500,
        reimbursement_mode: 'mixed',
      },
      previous_plan: APPROVED_FIXTURE_FEE_PLAN,
      total_plans: 2,
    });
    expect(persisted.teardown).toEqual({
      driver_invitation_revoked: true,
      ops_session_revoked: true,
    });
  });

  it('R2: fails closed when active fixture-platform-funded-reimbursement/v1 has mismatched economics or when a conflicting active plan is present', async () => {
    const evidencePathBps = makeTempEvidencePath();
    const harnessMismatchedBps = createMockSharedDevHarness({
      feePlanItems: [
        {
          ...APPROVED_FIXTURE_FEE_PLAN,
          service_fee_bps: 1200,
          reimbursement_mode: 'platform_funded',
        },
      ],
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath: evidencePathBps,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: harnessMismatchedBps.fetchImpl,
        execFileImpl: harnessMismatchedBps.execFileImpl,
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(/does not carry the fixture's expected content/);

    expect(
      harnessMismatchedBps.calls.fetch.filter((call) =>
        call.url.endsWith('/api/driver-fee-plans/publish')
      )
    ).toHaveLength(0);

    const evidencePathMode = makeTempEvidencePath();
    const harnessMismatchedMode = createMockSharedDevHarness({
      feePlanItems: [
        {
          ...APPROVED_FIXTURE_FEE_PLAN,
          service_fee_bps: 0,
          reimbursement_mode: 'mixed',
        },
      ],
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath: evidencePathMode,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: harnessMismatchedMode.fetchImpl,
        execFileImpl: harnessMismatchedMode.execFileImpl,
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(/does not carry the fixture's expected content/);

    const evidencePathConflicting = makeTempEvidencePath();
    const harnessConflicting = createMockSharedDevHarness({
      feePlanItems: [
        {
          fee_plan_id: 'fee-plan-other-009',
          plan_name: 'someone-elses-plan',
          version: 'v9',
          status: 'published',
          service_fee_bps: 1500,
          reimbursement_mode: 'mixed',
        },
      ],
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath: evidencePathConflicting,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: harnessConflicting.fetchImpl,
        execFileImpl: harnessConflicting.execFileImpl,
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(
      /Conflicting active fee plan someone-elses-plan\/v9 is currently active/
    );

    expect(
      harnessConflicting.calls.fetch.filter((call) =>
        call.url.endsWith('/api/driver-fee-plans/publish')
      )
    ).toHaveLength(0);
  });

  it('R3: requires non-empty exact observed runtime SHA header on every API/readback and audit response, preserving candidate_sha vs observed_runtime_sha separation and failure teardown', async () => {
    // 1. Matching observed runtime SHA (distinct from candidate definition SHA) with audit reads enabled
    const matchingEvidencePath = makeTempEvidencePath();
    const matchingHarness = createMockSharedDevHarness();

    const matchingResult = await runSharedDevArtifactRoundtrip({
      evidencePath: matchingEvidencePath,
      candidateSha: CANDIDATE_SHA,
      includeFeePlanImpactAudit: true,
      apiOrigin: API_ORIGIN,
      platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
      projectId: PROJECT_ID,
      region: REGION,
      apiIdToken: 'wif-id-token-api',
      platformIdToken: 'wif-id-token-platform',
      fetchImpl: matchingHarness.fetchImpl,
      execFileImpl: matchingHarness.execFileImpl,
      scanPollIntervalMs: 1,
    });

    expect(matchingResult.status).toBe('passed');
    expect(matchingResult.candidate_sha).toBe(CANDIDATE_SHA);
    expect(matchingResult.observed_runtime_sha).toBe(OBSERVED_RUNTIME_SHA);
    expect(matchingResult.candidate_sha).not.toBe(
      matchingResult.observed_runtime_sha
    );
    expect(
      matchingResult.fee_plan_readback_audit?.driver_statements
    ).toHaveLength(1);
    expect(
      matchingResult.fee_plan_readback_audit?.reimbursement_batches
    ).toHaveLength(1);
    expect(
      matchingResult.fee_plan_readback_audit?.fee_plan_audit_events
    ).toHaveLength(1);

    // 2. Missing x-drts-candidate-sha header rejected at first Ops introspection before progressing
    const missingEvidencePath = makeTempEvidencePath();
    const missingHarness = createMockSharedDevHarness({
      responseCandidateShaHeader: null,
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath: missingEvidencePath,
        candidateSha: CANDIDATE_SHA,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: missingHarness.fetchImpl,
        execFileImpl: missingHarness.execFileImpl,
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(
      /Missing or blank x-drts-candidate-sha header on \/api\/auth\/session \(ops\)/
    );

    expect(
      missingHarness.calls.fetch.filter((call) =>
        call.url.endsWith('/api/driver-fee-plans')
      )
    ).toHaveLength(0);
    expect(
      missingHarness.calls.fetch.filter((call) =>
        call.url.endsWith('/api/driver-statements/generate')
      )
    ).toHaveLength(0);
    const missingPersisted = JSON.parse(
      readFileSync(missingEvidencePath, 'utf8')
    );
    expect(missingPersisted.status).toBe('failed');
    expect(missingPersisted.candidate_sha).toBe(CANDIDATE_SHA);
    expect(missingPersisted.observed_runtime_sha).toBe(OBSERVED_RUNTIME_SHA);
    expect(missingPersisted.teardown.ops_session_revoked).toBe(true);

    // 3. Blank / whitespace x-drts-candidate-sha header rejected at first Ops introspection
    const blankEvidencePath = makeTempEvidencePath();
    const blankHarness = createMockSharedDevHarness({
      responseCandidateShaHeader: '   ',
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath: blankEvidencePath,
        candidateSha: CANDIDATE_SHA,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: blankHarness.fetchImpl,
        execFileImpl: blankHarness.execFileImpl,
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(
      /Missing or blank x-drts-candidate-sha header on \/api\/auth\/session \(ops\)/
    );

    expect(
      blankHarness.calls.fetch.filter((call) =>
        call.url.endsWith('/api/driver-statements/generate')
      )
    ).toHaveLength(0);
    const blankPersisted = JSON.parse(readFileSync(blankEvidencePath, 'utf8'));
    expect(blankPersisted.status).toBe('failed');
    expect(blankPersisted.teardown.ops_session_revoked).toBe(true);

    // 4. Mismatched x-drts-candidate-sha header (e.g., definition SHA instead of observed runtime SHA) rejected at first Ops introspection
    const mismatchEvidencePath = makeTempEvidencePath();
    const mismatchHarness = createMockSharedDevHarness({
      responseCandidateShaHeader: CANDIDATE_SHA,
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath: mismatchEvidencePath,
        candidateSha: CANDIDATE_SHA,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: mismatchHarness.fetchImpl,
        execFileImpl: mismatchHarness.execFileImpl,
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(
      new RegExp(
        `Runtime SHA drift on /api/auth/session \\(ops\\): x-drts-candidate-sha="${CANDIDATE_SHA}" != expected="${OBSERVED_RUNTIME_SHA}"`
      )
    );

    expect(
      mismatchHarness.calls.fetch.filter((call) =>
        call.url.endsWith('/api/driver-statements/generate')
      )
    ).toHaveLength(0);
    const mismatchPersisted = JSON.parse(
      readFileSync(mismatchEvidencePath, 'utf8')
    );
    expect(mismatchPersisted.status).toBe('failed');
    expect(mismatchPersisted.teardown.ops_session_revoked).toBe(true);

    // 5. Missing or drifted x-drts-candidate-sha header on fee-plan audit read (/api/driver-statements) rejected before statement generation
    const auditDriftEvidencePath = makeTempEvidencePath();
    const auditDriftHarness = createMockSharedDevHarness({
      perPathCandidateShaHeader: {
        '/api/driver-statements': null,
      },
    });

    await expect(
      runSharedDevArtifactRoundtrip({
        evidencePath: auditDriftEvidencePath,
        candidateSha: CANDIDATE_SHA,
        includeFeePlanImpactAudit: true,
        apiOrigin: API_ORIGIN,
        platformAdminOrigin: PLATFORM_ADMIN_ORIGIN,
        projectId: PROJECT_ID,
        region: REGION,
        apiIdToken: 'wif-id-token-api',
        platformIdToken: 'wif-id-token-platform',
        fetchImpl: auditDriftHarness.fetchImpl,
        execFileImpl: auditDriftHarness.execFileImpl,
        scanPollIntervalMs: 1,
      })
    ).rejects.toThrow(
      /Missing or blank x-drts-candidate-sha header on \/api\/driver-statements/
    );

    expect(
      auditDriftHarness.calls.fetch.filter((call) =>
        call.url.endsWith('/api/driver-statements/generate')
      )
    ).toHaveLength(0);
    const auditDriftPersisted = JSON.parse(
      readFileSync(auditDriftEvidencePath, 'utf8')
    );
    expect(auditDriftPersisted.status).toBe('failed');
    expect(auditDriftPersisted.teardown).toEqual({
      driver_invitation_revoked: true,
      ops_session_revoked: true,
    });
  });
});
