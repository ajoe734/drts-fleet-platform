import { execFile as execFileCallback } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const defaultExecFile = promisify(execFileCallback);

export const SYNTHETIC_CLEAN_PDF_BYTES = Buffer.from(
  '%PDF-1.4\n' +
    '1 0 obj\n' +
    '<< /Type /Catalog /Pages 2 0 R >>\n' +
    'endobj\n' +
    '2 0 obj\n' +
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n' +
    'endobj\n' +
    '3 0 obj\n' +
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>\n' +
    'endobj\n' +
    'xref\n' +
    '0 4\n' +
    '0000000000 65535 f \n' +
    '0000000009 00000 n \n' +
    '0000000058 00000 n \n' +
    '0000000115 00000 n \n' +
    'trailer\n' +
    '<< /Size 4 /Root 1 0 R >>\n' +
    'startxref\n' +
    '200\n' +
    '%%EOF\n',
  'utf8'
);

export const SYNTHETIC_CLEAN_PDF_SHA256 = sha256Hex(SYNTHETIC_CLEAN_PDF_BYTES);

// Canonical 68-byte EICAR standard antivirus test file (harmless transport canary).
export const CANONICAL_EICAR_BYTES = Buffer.from(
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
  'utf8'
);

export const CANONICAL_EICAR_SHA256 = sha256Hex(CANONICAL_EICAR_BYTES);

export const REQUIRED_PROVIDER_ACTIVATION_ENV = Object.freeze({
  REMITTANCE_PROOF_STORAGE_PROVIDER: 'gcs',
  DOCUMENT_ARTIFACT_STORAGE_PROVIDER: 'gcs',
  REMITTANCE_PROOF_SCANNER_PROVIDER: 'cloud-run-clamd',
});

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function normalizeOrigin(raw, label) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    throw new Error(`${label} is required and cannot be empty.`);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${label} is not a valid URL: ${trimmed}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${label} must use https: or http:, got ${parsed.protocol}`);
  }
  return parsed.origin;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export async function inspectSharedDevProviderActivation({
  projectId,
  region,
  apiService = 'drts-dev-api',
  expectedRuntimeSha,
  expectedRemittanceBucket,
  expectedDocumentBucket,
  expectedScannerUrl,
  execFileImpl = defaultExecFile,
}) {
  if (!projectId || !region) {
    throw new Error(
      'inspectSharedDevProviderActivation requires non-empty projectId and region.'
    );
  }

  const { stdout } = await execFileImpl(
    'gcloud',
    [
      'run',
      'services',
      'describe',
      apiService,
      '--project',
      projectId,
      '--region',
      region,
      '--format=json',
    ],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );

  const serviceDesc = JSON.parse(
    Buffer.isBuffer(stdout) ? stdout.toString('utf8') : String(stdout)
  );
  const templateSpec = serviceDesc?.spec?.template?.spec ?? {};
  const containers = Array.isArray(templateSpec.containers)
    ? templateSpec.containers
    : [];
  const primaryContainer = containers[0] ?? {};
  const envEntries = Array.isArray(primaryContainer.env)
    ? primaryContainer.env
    : [];

  const envMap = {};
  for (const item of envEntries) {
    if (item && typeof item.name === 'string' && typeof item.value === 'string') {
      envMap[item.name] = item.value;
    }
  }

  const observedRuntimeSha = (envMap.DRTS_CANDIDATE_SHA ?? '').trim();
  if (!/^[0-9a-f]{40}$/.test(observedRuntimeSha)) {
    throw new Error(
      `Cloud Run service ${apiService} has invalid or missing DRTS_CANDIDATE_SHA: "${observedRuntimeSha}"`
    );
  }
  if (expectedRuntimeSha && observedRuntimeSha !== expectedRuntimeSha.trim()) {
    throw new Error(
      `Cloud Run service ${apiService} DRTS_CANDIDATE_SHA mismatch: expected ${expectedRuntimeSha.trim()}, got ${observedRuntimeSha}`
    );
  }

  for (const [key, expectedValue] of Object.entries(
    REQUIRED_PROVIDER_ACTIVATION_ENV
  )) {
    const actualValue = (envMap[key] ?? '').trim();
    if (actualValue !== expectedValue) {
      throw new Error(
        `Cloud Run service ${apiService} env ${key} expected "${expectedValue}", got "${actualValue || '<unset>'}"`
      );
    }
  }

  const remittanceBucket = (envMap.REMITTANCE_PROOF_GCS_BUCKET ?? '').trim();
  if (!remittanceBucket || remittanceBucket === 'unprovisioned') {
    throw new Error(
      `Cloud Run service ${apiService} REMITTANCE_PROOF_GCS_BUCKET is not activated: "${remittanceBucket || '<unset>'}"`
    );
  }
  if (
    expectedRemittanceBucket &&
    remittanceBucket !== expectedRemittanceBucket.trim()
  ) {
    throw new Error(
      `Cloud Run service ${apiService} REMITTANCE_PROOF_GCS_BUCKET mismatch: expected ${expectedRemittanceBucket.trim()}, got ${remittanceBucket}`
    );
  }

  const documentBucket = (envMap.DOCUMENT_ARTIFACT_GCS_BUCKET ?? '').trim();
  if (!documentBucket || documentBucket === 'unprovisioned') {
    throw new Error(
      `Cloud Run service ${apiService} DOCUMENT_ARTIFACT_GCS_BUCKET is not activated: "${documentBucket || '<unset>'}"`
    );
  }
  if (
    expectedDocumentBucket &&
    documentBucket !== expectedDocumentBucket.trim()
  ) {
    throw new Error(
      `Cloud Run service ${apiService} DOCUMENT_ARTIFACT_GCS_BUCKET mismatch: expected ${expectedDocumentBucket.trim()}, got ${documentBucket}`
    );
  }

  const scannerUrlRaw = (envMap.REMITTANCE_PROOF_SCANNER_URL ?? '').trim();
  if (!scannerUrlRaw || scannerUrlRaw === 'unprovisioned') {
    throw new Error(
      `Cloud Run service ${apiService} REMITTANCE_PROOF_SCANNER_URL is not activated: "${scannerUrlRaw || '<unset>'}"`
    );
  }
  const scannerUrl = normalizeOrigin(
    scannerUrlRaw,
    'REMITTANCE_PROOF_SCANNER_URL'
  );
  if (!scannerUrl.startsWith('https://') || !scannerUrl.endsWith('.run.app')) {
    throw new Error(
      `Cloud Run service ${apiService} REMITTANCE_PROOF_SCANNER_URL must be an https://*.run.app origin, got ${scannerUrl}`
    );
  }
  if (expectedScannerUrl) {
    const normalizedExpectedScanner = normalizeOrigin(
      expectedScannerUrl,
      'expectedScannerUrl'
    );
    if (scannerUrl !== normalizedExpectedScanner) {
      throw new Error(
        `Cloud Run service ${apiService} REMITTANCE_PROOF_SCANNER_URL mismatch: expected ${normalizedExpectedScanner}, got ${scannerUrl}`
      );
    }
  }

  const latestReadyRevisionName =
    serviceDesc?.status?.latestReadyRevisionName ??
    serviceDesc?.status?.latestCreatedRevisionName ??
    null;
  const runtimeServiceAccount =
    typeof templateSpec.serviceAccountName === 'string' &&
    templateSpec.serviceAccountName.trim()
      ? templateSpec.serviceAccountName.trim()
      : null;

  return {
    serviceName: apiService,
    projectId,
    region,
    latestReadyRevisionName,
    runtimeServiceAccount,
    observedRuntimeSha,
    env: {
      DRTS_CANDIDATE_SHA: observedRuntimeSha,
      REMITTANCE_PROOF_STORAGE_PROVIDER:
        envMap.REMITTANCE_PROOF_STORAGE_PROVIDER,
      REMITTANCE_PROOF_GCS_BUCKET: remittanceBucket,
      DOCUMENT_ARTIFACT_STORAGE_PROVIDER:
        envMap.DOCUMENT_ARTIFACT_STORAGE_PROVIDER,
      DOCUMENT_ARTIFACT_GCS_BUCKET: documentBucket,
      REMITTANCE_PROOF_SCANNER_PROVIDER:
        envMap.REMITTANCE_PROOF_SCANNER_PROVIDER,
      REMITTANCE_PROOF_SCANNER_URL: scannerUrl,
    },
  };
}

export async function inspectGcsObjectGenerationAndBytes({
  bucket,
  objectKey,
  runtimeServiceAccount,
  execFileImpl = defaultExecFile,
}) {
  if (!bucket || !objectKey) {
    throw new Error(
      'inspectGcsObjectGenerationAndBytes requires non-empty bucket and objectKey.'
    );
  }

  const uri = `gs://${bucket}/${objectKey}`;
  const impersonateArgs = runtimeServiceAccount
    ? [`--impersonate-service-account=${runtimeServiceAccount}`]
    : [];

  const describeResult = await execFileImpl(
    'gcloud',
    [...impersonateArgs, 'storage', 'objects', 'describe', uri, '--format=json'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
  );
  const metadata = JSON.parse(
    Buffer.isBuffer(describeResult.stdout)
      ? describeResult.stdout.toString('utf8')
      : String(describeResult.stdout)
  );
  const generation = String(metadata?.generation ?? '').trim();
  if (!/^[1-9][0-9]*$/.test(generation)) {
    throw new Error(
      `GCS object ${uri} did not return a positive numeric generation: "${generation}"`
    );
  }

  const catResult = await execFileImpl(
    'gcloud',
    [...impersonateArgs, 'storage', 'cat', `${uri}#${generation}`],
    { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 }
  );
  const bytes = Buffer.isBuffer(catResult.stdout)
    ? catResult.stdout
    : Buffer.from(String(catResult.stdout), 'utf8');
  const sha256 = sha256Hex(bytes);

  return {
    uri,
    bucket,
    objectKey,
    generation,
    byteLength: bytes.byteLength,
    sha256,
    bytes,
  };
}

function buildApiHeaders({ apiIdToken, appSessionToken, extraHeaders = {} }) {
  const headers = { ...extraHeaders };
  if (apiIdToken) {
    headers['X-Serverless-Authorization'] = `Bearer ${apiIdToken}`;
  }
  if (appSessionToken) {
    headers.Authorization = `Bearer ${appSessionToken}`;
  } else if (apiIdToken && !headers['X-Serverless-Authorization']) {
    headers.Authorization = `Bearer ${apiIdToken}`;
  }
  return headers;
}

async function readResponseJsonOrText(response) {
  const arrayBuffer = await response.arrayBuffer();
  const rawBuffer = Buffer.from(arrayBuffer);
  const text = rawBuffer.toString('utf8');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { rawBuffer, text, json };
}

function assertObservedRuntimeHeader(response, url, expectedRuntimeSha) {
  if (!expectedRuntimeSha) {
    return null;
  }
  const headerSha = response.headers?.get?.('x-drts-candidate-sha')?.trim();
  if (headerSha && headerSha !== expectedRuntimeSha) {
    throw new Error(
      `Runtime SHA drift on ${url}: x-drts-candidate-sha="${headerSha}" != expected="${expectedRuntimeSha}"`
    );
  }
  return headerSha || null;
}

export async function runSharedDevArtifactRoundtrip(options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const execFileImpl = options.execFileImpl ?? defaultExecFile;
  const mask =
    options.mask ??
    ((secret) => {
      if (typeof secret === 'string' && secret.trim()) {
        console.log(`::add-mask::${secret.trim()}`);
      }
    });

  const evidencePath = resolve(
    options.evidencePath ??
      env.SR_LIVE_DOC_SHARED_DEV_ROUNDTRIP_EVIDENCE ??
      '.artifacts/live-document-acceptance/shared-dev-artifact-roundtrip.json'
  );

  const candidateSha = (
    options.candidateSha ??
    env.CANDIDATE_SHA ??
    env.WORKFLOW_SHA ??
    ''
  ).trim();
  const expectedRuntimeSha = (
    options.expectedRuntimeSha ??
    env.SR_LIVE_DOC_EXPECTED_RUNTIME_SHA ??
    ''
  ).trim();

  const apiOriginRaw = (
    options.apiOrigin ??
    env.SHARED_DEV_API_ORIGIN ??
    env.SR_LIVE_DOC_LIVE_API_ORIGIN ??
    env.DEV_CONTROL_PLANE_API_ORIGIN ??
    ''
  ).trim();
  const platformAdminOriginRaw = (
    options.platformAdminOrigin ??
    env.SHARED_DEV_PLATFORM_ADMIN_ORIGIN ??
    env.SR_LIVE_DOC_LIVE_PLATFORM_ADMIN_ORIGIN ??
    env.DEV_PLATFORM_ADMIN_ORIGIN ??
    ''
  ).trim();

  const projectId = (
    options.projectId ??
    env.DEV_GCP_PROJECT_ID ??
    ''
  ).trim();
  const region = (options.region ?? env.DEV_GCP_REGION ?? '').trim();
  const apiService = (
    options.apiService ??
    env.DEV_API_SERVICE_NAME ??
    'drts-dev-api'
  ).trim();
  const configuredRuntimeSa = (
    options.runtimeServiceAccount ??
    env.DEV_GCP_RUNTIME_SERVICE_ACCOUNT ??
    ''
  ).trim();
  const expectedRemittanceBucket = (
    options.expectedRemittanceBucket ??
    env.DEV_REMITTANCE_PROOF_GCS_BUCKET ??
    ''
  ).trim();
  const expectedDocumentBucket = (
    options.expectedDocumentBucket ??
    env.DEV_DOCUMENT_ARTIFACT_GCS_BUCKET ??
    ''
  ).trim();
  const expectedScannerUrl = (
    options.expectedScannerUrl ??
    env.DEV_REMITTANCE_PROOF_SCANNER_URL ??
    ''
  ).trim();

  const apiIdToken = (
    options.apiIdToken ??
    env.SR_LIVE_DOC_ID_TOKEN_API ??
    ''
  ).trim();
  const platformIdToken = (
    options.platformIdToken ??
    env.SR_LIVE_DOC_ID_TOKEN_PLATFORM ??
    ''
  ).trim();
  const preSuppliedOpsToken = (
    options.opsSessionToken ??
    env.SR_LIVE_DOC_OPS_SESSION_TOKEN ??
    env.OPS_TOKEN ??
    ''
  ).trim();
  const preSuppliedDriverToken = (
    options.driverSessionToken ??
    env.SR_LIVE_DOC_DRIVER_SESSION_TOKEN ??
    env.DRIVER_TOKEN ??
    ''
  ).trim();

  const driverId = (
    options.driverId ??
    env.SR_LIVE_DOC_DRIVER_ID ??
    'drv-demo-001'
  ).trim();
  const billingPeriod = (
    options.billingPeriod ??
    env.SR_LIVE_DOC_BILLING_PERIOD ??
    '2026-03'
  ).trim();
  const publicInfoVersionId = (
    options.publicInfoVersionId ??
    env.SR_LIVE_DOC_PUBLIC_INFO_VERSION_ID ??
    'public-info-demo-001'
  ).trim();
  const placardTemplateName = (
    options.placardTemplateName ??
    env.SR_LIVE_DOC_PLACARD_TEMPLATE_NAME ??
    'standard-a5'
  ).trim();

  const scanMaxAttempts = Number(
    options.scanMaxAttempts ?? env.SR_LIVE_DOC_SCAN_MAX_ATTEMPTS ?? 15
  );
  const scanPollIntervalMs = Number(
    options.scanPollIntervalMs ?? env.SR_LIVE_DOC_SCAN_POLL_INTERVAL_MS ?? 2000
  );

  const missing = [];
  if (!apiOriginRaw) {
    missing.push('SHARED_DEV_API_ORIGIN (or DEV_CONTROL_PLANE_API_ORIGIN)');
  }
  if (!projectId) {
    missing.push('DEV_GCP_PROJECT_ID');
  }
  if (!region) {
    missing.push('DEV_GCP_REGION');
  }
  if (!preSuppliedOpsToken && !platformAdminOriginRaw) {
    missing.push(
      'SHARED_DEV_PLATFORM_ADMIN_ORIGIN (or SR_LIVE_DOC_OPS_SESSION_TOKEN)'
    );
  }
  if (!apiIdToken && !preSuppliedOpsToken) {
    missing.push('SR_LIVE_DOC_ID_TOKEN_API');
  }
  if (!preSuppliedOpsToken && !platformIdToken) {
    missing.push('SR_LIVE_DOC_ID_TOKEN_PLATFORM');
  }

  const evidence = {
    task_id: 'GCS-ACTUAL-PROOF-AND-PLACARD-ACCEPTANCE-20261123',
    acceptance_item: 'SR-GCP-ARTIFACT-ACTIVATION-20261004#4',
    acceptance_keys: [
      'existing_live_rail_exercises_scoped_artifact_roundtrips',
      'shared_dev_provider_activation_readback_at_observed_runtime',
    ],
    executed_at: new Date().toISOString(),
    candidate_sha: candidateSha || null,
    observed_runtime_sha: null,
    status: 'failed',
    missing,
    provider_activation: null,
    role_sessions: {
      ops: null,
      driver: null,
    },
    synthetic_fixtures: {
      driver_id: driverId,
      billing_period: billingPeriod,
      reimbursement_batch_id: null,
      public_info_version_id: publicInfoVersionId,
    },
    clean_remittance_proof: null,
    eicar_remittance_proof: null,
    controlled_placard: null,
    gcs_objects: null,
    teardown: {
      driver_invitation_revoked: false,
      ops_session_revoked: false,
    },
    error: null,
  };

  function writeEvidenceFile() {
    mkdirSync(dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  }

  if (missing.length > 0) {
    evidence.error = `Missing required shared-dev roundtrip inputs: ${missing.join(', ')}`;
    writeEvidenceFile();
    throw new Error(evidence.error);
  }

  if (apiIdToken) mask(apiIdToken);
  if (platformIdToken) mask(platformIdToken);
  if (preSuppliedOpsToken) mask(preSuppliedOpsToken);
  if (preSuppliedDriverToken) mask(preSuppliedDriverToken);

  const apiOrigin = normalizeOrigin(apiOriginRaw, 'apiOrigin');
  const platformAdminOrigin = platformAdminOriginRaw
    ? normalizeOrigin(platformAdminOriginRaw, 'platformAdminOrigin')
    : null;

  let opsToken = preSuppliedOpsToken || null;
  let issuedOpsSessionId = null;
  let driverToken = preSuppliedDriverToken || null;
  let issuedDriverRegistrationCode = null;
  let observedRuntimeSha = null;

  try {
    // 1. Inspect Cloud Run drts-dev-api provider activation and observed runtime SHA
    const providerActivation = await inspectSharedDevProviderActivation({
      projectId,
      region,
      apiService,
      expectedRuntimeSha: expectedRuntimeSha || undefined,
      expectedRemittanceBucket: expectedRemittanceBucket || undefined,
      expectedDocumentBucket: expectedDocumentBucket || undefined,
      expectedScannerUrl: expectedScannerUrl || undefined,
      execFileImpl,
    });
    observedRuntimeSha = providerActivation.observedRuntimeSha;
    evidence.observed_runtime_sha = observedRuntimeSha;
    evidence.provider_activation = providerActivation;

    const runtimeServiceAccount =
      configuredRuntimeSa || providerActivation.runtimeServiceAccount;
    const remittanceBucket =
      providerActivation.env.REMITTANCE_PROOF_GCS_BUCKET;
    const documentBucket =
      providerActivation.env.DOCUMENT_ARTIFACT_GCS_BUCKET;

    // 2. Acquire & verify Platform Ops role session
    if (!opsToken) {
      const tokenUrl = `${platformAdminOrigin}/control-plane-proxy/auth/token`;
      const tokenResp = await fetchImpl(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${platformIdToken}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });
      const { json: tokenBody, text: tokenText } =
        await readResponseJsonOrText(tokenResp);
      if (tokenResp.status !== 200 || !tokenBody?.token) {
        evidence.missing.push('platform_admin_ops_session');
        throw new Error(
          `Failed to mint platform_admin session via ${tokenUrl}: status=${tokenResp.status} body=${tokenText.slice(0, 300)}`
        );
      }
      opsToken = String(tokenBody.token).trim();
      mask(opsToken);
      issuedOpsSessionId =
        tokenBody.session_id ?? tokenBody.sessionId ?? null;
    }

    const opsSessionResp = await fetchImpl(`${apiOrigin}/api/auth/session`, {
      method: 'GET',
      headers: buildApiHeaders({
        apiIdToken,
        appSessionToken: opsToken,
      }),
    });
    assertObservedRuntimeHeader(
      opsSessionResp,
      '/api/auth/session (ops)',
      observedRuntimeSha
    );
    const { json: opsSessionBody, text: opsSessionText } =
      await readResponseJsonOrText(opsSessionResp);
    if (opsSessionResp.status !== 200 || !opsSessionBody) {
      evidence.missing.push('verified_platform_admin_ops_session');
      throw new Error(
        `Failed to verify Ops session at ${apiOrigin}/api/auth/session: status=${opsSessionResp.status} body=${opsSessionText.slice(0, 300)}`
      );
    }
    const opsScopes = Array.isArray(opsSessionBody.scopes)
      ? opsSessionBody.scopes
      : [];
    for (const requiredScope of [
      'billing:read',
      'billing:write',
      'foundation:read',
      'foundation:write',
    ]) {
      if (!opsScopes.includes(requiredScope)) {
        evidence.missing.push(`ops_scope:${requiredScope}`);
        throw new Error(
          `Ops session is missing required scope "${requiredScope}"; actual scopes: ${opsScopes.join(', ')}`
        );
      }
    }
    if (!issuedOpsSessionId && opsSessionBody.sessionId && !preSuppliedOpsToken) {
      issuedOpsSessionId = opsSessionBody.sessionId;
    }
    evidence.role_sessions.ops = {
      session_id: opsSessionBody.sessionId ?? issuedOpsSessionId ?? null,
      actor_type: opsSessionBody.actorType ?? null,
      realm: opsSessionBody.realm ?? null,
      role: opsSessionBody.role ?? null,
      scopes: opsScopes,
      source: preSuppliedOpsToken
        ? 'pre_supplied_env'
        : 'platform_admin_bff_control_plane_proxy',
    };

    // 3. Acquire & verify Driver role session for drv-demo-001
    if (!driverToken) {
      if (!opsScopes.includes('driver:provision')) {
        evidence.missing.push('ops_scope:driver:provision');
        throw new Error(
          'Ops session is missing driver:provision scope required to issue driver device invitation.'
        );
      }
      const inviteResp = await fetchImpl(
        `${apiOrigin}/api/auth/driver/device/invite`,
        {
          method: 'POST',
          headers: buildApiHeaders({
            apiIdToken,
            appSessionToken: opsToken,
            extraHeaders: { 'Content-Type': 'application/json' },
          }),
          body: JSON.stringify({ driverId }),
        }
      );
      assertObservedRuntimeHeader(
        inviteResp,
        '/api/auth/driver/device/invite',
        observedRuntimeSha
      );
      const { json: inviteBody, text: inviteText } =
        await readResponseJsonOrText(inviteResp);
      const registrationCode =
        inviteBody?.registration_code ?? inviteBody?.registrationCode ?? null;
      if (
        (inviteResp.status !== 200 && inviteResp.status !== 201) ||
        !registrationCode
      ) {
        evidence.missing.push(`driver_device_invitation:${driverId}`);
        throw new Error(
          `Failed to issue driver device invitation for ${driverId}: status=${inviteResp.status} body=${inviteText.slice(0, 300)}`
        );
      }
      issuedDriverRegistrationCode = String(registrationCode).trim();
      mask(issuedDriverRegistrationCode);

      // Note: /api/auth/driver/device/register is @OpenRoute(); never pass Google ID token in Authorization.
      const deviceId = `sr-live-doc-roundtrip-${randomUUID().slice(0, 8)}`;
      const registerResp = await fetchImpl(
        `${apiOrigin}/api/auth/driver/device/register`,
        {
          method: 'POST',
          headers: buildApiHeaders({
            apiIdToken,
            appSessionToken: null,
            extraHeaders: { 'Content-Type': 'application/json' },
          }),
          body: JSON.stringify({
            registrationCode: issuedDriverRegistrationCode,
            deviceId,
          }),
        }
      );
      assertObservedRuntimeHeader(
        registerResp,
        '/api/auth/driver/device/register',
        observedRuntimeSha
      );
      const { json: registerBody, text: registerText } =
        await readResponseJsonOrText(registerResp);
      const mintedDriverToken =
        registerBody?.access_token ?? registerBody?.accessToken ?? null;
      if (
        (registerResp.status !== 200 && registerResp.status !== 201) ||
        !mintedDriverToken
      ) {
        evidence.missing.push(`driver_device_session:${driverId}`);
        throw new Error(
          `Failed to register driver device session for ${driverId}: status=${registerResp.status} body=${registerText.slice(0, 300)}`
        );
      }
      driverToken = String(mintedDriverToken).trim();
      mask(driverToken);
    }

    const driverSessionResp = await fetchImpl(`${apiOrigin}/api/auth/session`, {
      method: 'GET',
      headers: buildApiHeaders({
        apiIdToken,
        appSessionToken: driverToken,
      }),
    });
    assertObservedRuntimeHeader(
      driverSessionResp,
      '/api/auth/session (driver)',
      observedRuntimeSha
    );
    const { json: driverSessionBody, text: driverSessionText } =
      await readResponseJsonOrText(driverSessionResp);
    if (driverSessionResp.status !== 200 || !driverSessionBody) {
      evidence.missing.push(`verified_driver_session:${driverId}`);
      throw new Error(
        `Failed to verify Driver session at ${apiOrigin}/api/auth/session: status=${driverSessionResp.status} body=${driverSessionText.slice(0, 300)}`
      );
    }
    const driverScopes = Array.isArray(driverSessionBody.scopes)
      ? driverSessionBody.scopes
      : [];
    if (!driverScopes.includes('driver:write')) {
      evidence.missing.push('driver_scope:driver:write');
      throw new Error(
        `Driver session is missing required scope "driver:write"; actual scopes: ${driverScopes.join(', ')}`
      );
    }
    if (driverSessionBody.driverId && driverSessionBody.driverId !== driverId) {
      throw new Error(
        `Driver session bound to unexpected driverId "${driverSessionBody.driverId}", expected "${driverId}"`
      );
    }
    evidence.role_sessions.driver = {
      session_id: driverSessionBody.sessionId ?? null,
      driver_id: driverSessionBody.driverId ?? driverId,
      actor_type: driverSessionBody.actorType ?? null,
      realm: driverSessionBody.realm ?? null,
      role: driverSessionBody.role ?? null,
      scopes: driverScopes,
      source: preSuppliedDriverToken
        ? 'pre_supplied_env'
        : 'driver_device_invite_register',
    };

    // 4. Ensure & verify synthetic reimbursement batch for drv-demo-001 and public-info-demo-001
    const feePlansResp = await fetchImpl(`${apiOrigin}/api/driver-fee-plans`, {
      method: 'GET',
      headers: buildApiHeaders({
        apiIdToken,
        appSessionToken: opsToken,
      }),
    });
    assertObservedRuntimeHeader(
      feePlansResp,
      '/api/driver-fee-plans',
      observedRuntimeSha
    );
    const { json: feePlansBody, text: feePlansText } =
      await readResponseJsonOrText(feePlansResp);
    if (feePlansResp.status !== 200 || !Array.isArray(feePlansBody?.items)) {
      throw new Error(
        `Failed to list driver fee plans: status=${feePlansResp.status} body=${feePlansText.slice(0, 300)}`
      );
    }
    const fixturePlanExists = feePlansBody.items.some(
      (item) =>
        item &&
        item.planCode === 'fixture-platform-funded-reimbursement' &&
        item.status === 'published'
    );
    if (!fixturePlanExists) {
      const publishPlanResp = await fetchImpl(
        `${apiOrigin}/api/driver-fee-plans/publish`,
        {
          method: 'POST',
          headers: buildApiHeaders({
            apiIdToken,
            appSessionToken: opsToken,
            extraHeaders: { 'Content-Type': 'application/json' },
          }),
          body: JSON.stringify({
            planCode: 'fixture-platform-funded-reimbursement',
            versionCode: 'v1',
          }),
        }
      );
      assertObservedRuntimeHeader(
        publishPlanResp,
        '/api/driver-fee-plans/publish',
        observedRuntimeSha
      );
      if (publishPlanResp.status !== 200 && publishPlanResp.status !== 201) {
        const { text: publishPlanText } =
          await readResponseJsonOrText(publishPlanResp);
        evidence.missing.push(
          'driver_fee_plan:fixture-platform-funded-reimbursement'
        );
        throw new Error(
          `Failed to publish fixture driver fee plan: status=${publishPlanResp.status} body=${publishPlanText.slice(0, 300)}`
        );
      }
    }

    const statementResp = await fetchImpl(
      `${apiOrigin}/api/driver-statements/generate`,
      {
        method: 'POST',
        headers: buildApiHeaders({
          apiIdToken,
          appSessionToken: opsToken,
          extraHeaders: { 'Content-Type': 'application/json' },
        }),
        body: JSON.stringify({
          driverId,
          billingPeriod,
          planCode: 'fixture-platform-funded-reimbursement',
        }),
      }
    );
    assertObservedRuntimeHeader(
      statementResp,
      '/api/driver-statements/generate',
      observedRuntimeSha
    );
    const { json: statementBody, text: statementText } =
      await readResponseJsonOrText(statementResp);
    const reimbursementBatchId =
      statementBody?.reimbursementBatch?.batchId ?? null;
    if (
      (statementResp.status !== 200 && statementResp.status !== 201) ||
      !reimbursementBatchId
    ) {
      evidence.missing.push(
        `synthetic_reimbursement_batch:${driverId}:${billingPeriod}`
      );
      throw new Error(
        `Failed to resolve synthetic reimbursement batch for ${driverId} (${billingPeriod}): status=${statementResp.status} body=${statementText.slice(0, 300)}`
      );
    }
    evidence.synthetic_fixtures.reimbursement_batch_id = reimbursementBatchId;

    const batchResp = await fetchImpl(
      `${apiOrigin}/api/reimbursements/${encodeURIComponent(reimbursementBatchId)}`,
      {
        method: 'GET',
        headers: buildApiHeaders({
          apiIdToken,
          appSessionToken: opsToken,
        }),
      }
    );
    assertObservedRuntimeHeader(
      batchResp,
      `/api/reimbursements/${reimbursementBatchId}`,
      observedRuntimeSha
    );
    const { json: batchBody, text: batchText } =
      await readResponseJsonOrText(batchResp);
    if (
      batchResp.status !== 200 ||
      batchBody?.batchId !== reimbursementBatchId ||
      batchBody?.driverId !== driverId
    ) {
      evidence.missing.push(
        `verified_reimbursement_batch:${reimbursementBatchId}`
      );
      throw new Error(
        `Failed to verify reimbursement batch ${reimbursementBatchId}: status=${batchResp.status} body=${batchText.slice(0, 300)}`
      );
    }

    const publicInfoResp = await fetchImpl(
      `${apiOrigin}/api/platform-admin/public-info`,
      {
        method: 'GET',
        headers: buildApiHeaders({
          apiIdToken,
          appSessionToken: opsToken,
        }),
      }
    );
    assertObservedRuntimeHeader(
      publicInfoResp,
      '/api/platform-admin/public-info',
      observedRuntimeSha
    );
    const { json: publicInfoBody, text: publicInfoText } =
      await readResponseJsonOrText(publicInfoResp);
    if (publicInfoResp.status !== 200 || !Array.isArray(publicInfoBody?.items)) {
      throw new Error(
        `Failed to list platform-admin public info versions: status=${publicInfoResp.status} body=${publicInfoText.slice(0, 300)}`
      );
    }
    const targetPublicInfo = publicInfoBody.items.find(
      (item) => item && item.publicInfoVersionId === publicInfoVersionId
    );
    if (!targetPublicInfo || targetPublicInfo.status !== 'published') {
      evidence.missing.push(`public_info_version:${publicInfoVersionId}`);
      throw new Error(
        `Required synthetic public info version "${publicInfoVersionId}" is missing or not published.`
      );
    }

    // Helper for staging + uploading remittance proof + bounded scan retry on pending_scan
    async function stageAndUploadRemittanceProof({
      label,
      bytes,
      expectedSha256,
      fileName,
      proofReference,
    }) {
      const stageResp = await fetchImpl(
        `${apiOrigin}/api/reimbursements/proofs/staged-content`,
        {
          method: 'POST',
          headers: buildApiHeaders({
            apiIdToken,
            appSessionToken: driverToken,
            extraHeaders: { 'Content-Type': 'application/json' },
          }),
          body: JSON.stringify({
            contentBase64: bytes.toString('base64'),
          }),
        }
      );
      assertObservedRuntimeHeader(
        stageResp,
        `/api/reimbursements/proofs/staged-content (${label})`,
        observedRuntimeSha
      );
      const { json: stageBody, text: stageText } =
        await readResponseJsonOrText(stageResp);
      const stagedContentRef = stageBody?.staged_content_ref ?? null;
      if (
        (stageResp.status !== 200 && stageResp.status !== 201) ||
        !stagedContentRef
      ) {
        throw new Error(
          `Failed to stage ${label} remittance proof content: status=${stageResp.status} body=${stageText.slice(0, 300)}`
        );
      }
      if (stageBody.content_hash !== expectedSha256) {
        throw new Error(
          `Staged ${label} content_hash mismatch: expected ${expectedSha256}, got ${stageBody.content_hash}`
        );
      }
      if (stageBody.size_bytes !== bytes.byteLength) {
        throw new Error(
          `Staged ${label} size_bytes mismatch: expected ${bytes.byteLength}, got ${stageBody.size_bytes}`
        );
      }

      const uploadResp = await fetchImpl(
        `${apiOrigin}/api/reimbursements/proofs`,
        {
          method: 'POST',
          headers: buildApiHeaders({
            apiIdToken,
            appSessionToken: driverToken,
            extraHeaders: { 'Content-Type': 'application/json' },
          }),
          body: JSON.stringify({
            reimbursementBatchId,
            fileName,
            mimeType: 'application/pdf',
            proofReference,
            stagedContentRef,
            contentHash: expectedSha256,
            sizeBytes: bytes.byteLength,
          }),
        }
      );
      assertObservedRuntimeHeader(
        uploadResp,
        `/api/reimbursements/proofs (${label})`,
        observedRuntimeSha
      );
      let { json: proofBody, text: uploadText } =
        await readResponseJsonOrText(uploadResp);
      if (
        (uploadResp.status !== 200 && uploadResp.status !== 201) ||
        !proofBody?.remittance_proof_id
      ) {
        throw new Error(
          `Failed to upload ${label} remittance proof: status=${uploadResp.status} body=${uploadText.slice(0, 300)}`
        );
      }

      const proofId = proofBody.remittance_proof_id;
      let scanAttempts = 1;
      while (
        proofBody.scan_state === 'pending_scan' &&
        scanAttempts < scanMaxAttempts
      ) {
        await sleep(scanPollIntervalMs);
        scanAttempts += 1;
        const rescanResp = await fetchImpl(
          `${apiOrigin}/api/reimbursements/proofs/${encodeURIComponent(proofId)}/scan`,
          {
            method: 'POST',
            headers: buildApiHeaders({
              apiIdToken,
              appSessionToken: opsToken,
              extraHeaders: { 'Content-Type': 'application/json' },
            }),
            body: JSON.stringify({}),
          }
        );
        assertObservedRuntimeHeader(
          rescanResp,
          `/api/reimbursements/proofs/${proofId}/scan (${label})`,
          observedRuntimeSha
        );
        const rescanParsed = await readResponseJsonOrText(rescanResp);
        if (
          (rescanResp.status !== 200 && rescanResp.status !== 201) ||
          !rescanParsed.json
        ) {
          throw new Error(
            `Failed to re-scan ${label} proof ${proofId}: status=${rescanResp.status} body=${rescanParsed.text.slice(0, 300)}`
          );
        }
        proofBody = rescanParsed.json;
      }

      return {
        proofId,
        stagedContentRef,
        proofBody,
        scanAttempts,
      };
    }

    const runTag = randomUUID().slice(0, 8);

    // 5. Clean remittance proof upload -> scan -> Ops readback -> download -> byte/length/hash equality
    const cleanUpload = await stageAndUploadRemittanceProof({
      label: 'clean',
      bytes: SYNTHETIC_CLEAN_PDF_BYTES,
      expectedSha256: SYNTHETIC_CLEAN_PDF_SHA256,
      fileName: `uat-clean-remittance-${runTag}.pdf`,
      proofReference: `UAT-CLEAN-${runTag}`,
    });

    if (cleanUpload.proofBody.scan_state !== 'clean') {
      throw new Error(
        `Clean remittance proof ${cleanUpload.proofId} did not reach scan_state="clean": got scan_state="${cleanUpload.proofBody.scan_state}" rejection_reason="${cleanUpload.proofBody.rejection_reason}"`
      );
    }
    if (cleanUpload.proofBody.rejection_reason !== null) {
      throw new Error(
        `Clean remittance proof ${cleanUpload.proofId} unexpected rejection_reason: ${cleanUpload.proofBody.rejection_reason}`
      );
    }

    const cleanReadbackResp = await fetchImpl(
      `${apiOrigin}/api/reimbursements/proofs/${encodeURIComponent(cleanUpload.proofId)}/readback`,
      {
        method: 'POST',
        headers: buildApiHeaders({
          apiIdToken,
          appSessionToken: opsToken,
        }),
      }
    );
    assertObservedRuntimeHeader(
      cleanReadbackResp,
      `/api/reimbursements/proofs/${cleanUpload.proofId}/readback`,
      observedRuntimeSha
    );
    const { json: cleanReadbackBody, text: cleanReadbackText } =
      await readResponseJsonOrText(cleanReadbackResp);
    const cleanReadbackPath = cleanReadbackBody?.readback_url ?? null;
    if (
      (cleanReadbackResp.status !== 200 && cleanReadbackResp.status !== 201) ||
      !cleanReadbackPath
    ) {
      throw new Error(
        `Failed to acquire Ops readback URL for clean proof ${cleanUpload.proofId}: status=${cleanReadbackResp.status} body=${cleanReadbackText.slice(0, 300)}`
      );
    }

    // Download endpoint is @OpenRoute() authenticated via signed query parameters;
    // pass Cloud Run invocation token in X-Serverless-Authorization only.
    const cleanDownloadUrl = new URL(cleanReadbackPath, apiOrigin).toString();
    const cleanDownloadResp = await fetchImpl(cleanDownloadUrl, {
      method: 'GET',
      headers: buildApiHeaders({
        apiIdToken,
        appSessionToken: null,
      }),
    });
    assertObservedRuntimeHeader(
      cleanDownloadResp,
      cleanReadbackPath,
      observedRuntimeSha
    );
    const { rawBuffer: cleanDownloadedBytes, text: cleanDownloadText } =
      await readResponseJsonOrText(cleanDownloadResp);
    if (cleanDownloadResp.status !== 200) {
      throw new Error(
        `Failed to download clean remittance proof from ${cleanReadbackPath}: status=${cleanDownloadResp.status} body=${cleanDownloadText.slice(0, 300)}`
      );
    }
    const cleanDownloadedSha256 = sha256Hex(cleanDownloadedBytes);
    const cleanBytesEqual = cleanDownloadedBytes.equals(
      SYNTHETIC_CLEAN_PDF_BYTES
    );
    if (
      !cleanBytesEqual ||
      cleanDownloadedBytes.byteLength !== SYNTHETIC_CLEAN_PDF_BYTES.byteLength ||
      cleanDownloadedSha256 !== SYNTHETIC_CLEAN_PDF_SHA256
    ) {
      throw new Error(
        `Clean remittance proof readback mismatch for ${cleanUpload.proofId}: bytesEqual=${cleanBytesEqual}, length=${cleanDownloadedBytes.byteLength}/${SYNTHETIC_CLEAN_PDF_BYTES.byteLength}, sha256=${cleanDownloadedSha256}/${SYNTHETIC_CLEAN_PDF_SHA256}`
      );
    }

    evidence.clean_remittance_proof = {
      remittance_proof_id: cleanUpload.proofId,
      reimbursement_batch_id: reimbursementBatchId,
      staged_content_ref: cleanUpload.stagedContentRef,
      scan_state: cleanUpload.proofBody.scan_state,
      rejection_reason: cleanUpload.proofBody.rejection_reason,
      scan_attempts: cleanUpload.scanAttempts,
      uploaded_byte_length: SYNTHETIC_CLEAN_PDF_BYTES.byteLength,
      downloaded_byte_length: cleanDownloadedBytes.byteLength,
      uploaded_sha256: SYNTHETIC_CLEAN_PDF_SHA256,
      downloaded_sha256: cleanDownloadedSha256,
      bytes_equal: cleanBytesEqual,
      content_type: cleanDownloadResp.headers?.get?.('content-type') ?? null,
    };

    // 6. Standard harmless EICAR test fixture upload -> rejected / MALWARE_DETECTED -> readback denied (409)
    const eicarUpload = await stageAndUploadRemittanceProof({
      label: 'eicar',
      bytes: CANONICAL_EICAR_BYTES,
      expectedSha256: CANONICAL_EICAR_SHA256,
      fileName: `uat-eicar-canary-${runTag}.pdf`,
      proofReference: `UAT-EICAR-${runTag}`,
    });

    if (
      eicarUpload.proofBody.scan_state !== 'rejected' ||
      eicarUpload.proofBody.rejection_reason !== 'MALWARE_DETECTED'
    ) {
      throw new Error(
        `EICAR remittance proof ${eicarUpload.proofId} was not rejected with MALWARE_DETECTED: got scan_state="${eicarUpload.proofBody.scan_state}" rejection_reason="${eicarUpload.proofBody.rejection_reason}"`
      );
    }

    const eicarReadbackResp = await fetchImpl(
      `${apiOrigin}/api/reimbursements/proofs/${encodeURIComponent(eicarUpload.proofId)}/readback`,
      {
        method: 'POST',
        headers: buildApiHeaders({
          apiIdToken,
          appSessionToken: opsToken,
        }),
      }
    );
    assertObservedRuntimeHeader(
      eicarReadbackResp,
      `/api/reimbursements/proofs/${eicarUpload.proofId}/readback`,
      observedRuntimeSha
    );
    const { json: eicarReadbackBody } =
      await readResponseJsonOrText(eicarReadbackResp);

    let eicarDownloadDeniedStatus = eicarReadbackResp.status;
    let eicarDownloadDeniedCode =
      eicarReadbackBody?.error?.code ?? eicarReadbackBody?.code ?? null;

    if (
      (eicarReadbackResp.status === 200 || eicarReadbackResp.status === 201) &&
      eicarReadbackBody?.readback_url
    ) {
      const eicarDownloadUrl = new URL(
        eicarReadbackBody.readback_url,
        apiOrigin
      ).toString();
      const eicarDownloadResp = await fetchImpl(eicarDownloadUrl, {
        method: 'GET',
        headers: buildApiHeaders({
          apiIdToken,
          appSessionToken: null,
        }),
      });
      assertObservedRuntimeHeader(
        eicarDownloadResp,
        eicarReadbackBody.readback_url,
        observedRuntimeSha
      );
      const { json: eicarDownloadBody, text: eicarDownloadText } =
        await readResponseJsonOrText(eicarDownloadResp);
      eicarDownloadDeniedStatus = eicarDownloadResp.status;
      eicarDownloadDeniedCode =
        eicarDownloadBody?.error?.code ?? eicarDownloadBody?.code ?? null;
      if (
        eicarDownloadResp.status !== 409 ||
        eicarDownloadDeniedCode !== 'REMITTANCE_PROOF_NOT_CLEAN'
      ) {
        throw new Error(
          `EICAR remittance proof download must be denied with 409 REMITTANCE_PROOF_NOT_CLEAN: got status=${eicarDownloadResp.status} body=${eicarDownloadText.slice(0, 300)}`
        );
      }
    } else if (
      eicarReadbackResp.status !== 409 ||
      eicarDownloadDeniedCode !== 'REMITTANCE_PROOF_NOT_CLEAN'
    ) {
      throw new Error(
        `EICAR remittance proof readback did not fail closed with 409 REMITTANCE_PROOF_NOT_CLEAN: got status=${eicarReadbackResp.status}`
      );
    }

    evidence.eicar_remittance_proof = {
      remittance_proof_id: eicarUpload.proofId,
      reimbursement_batch_id: reimbursementBatchId,
      staged_content_ref: eicarUpload.stagedContentRef,
      scan_state: eicarUpload.proofBody.scan_state,
      rejection_reason: eicarUpload.proofBody.rejection_reason,
      scan_attempts: eicarUpload.scanAttempts,
      byte_length: CANONICAL_EICAR_BYTES.byteLength,
      sha256: CANONICAL_EICAR_SHA256,
      readback_download_denied_status: eicarDownloadDeniedStatus,
      readback_download_denied_code: eicarDownloadDeniedCode,
    };

    // 7. Controlled placard generation -> signed download -> PDF header, byte length & manifest hash verification
    const placardVersionCode = `v-uat-gcs-${runTag}`;
    const createPlacardResp = await fetchImpl(
      `${apiOrigin}/api/platform-admin/placards`,
      {
        method: 'POST',
        headers: buildApiHeaders({
          apiIdToken,
          appSessionToken: opsToken,
          extraHeaders: { 'Content-Type': 'application/json' },
        }),
        body: JSON.stringify({
          versionCode: placardVersionCode,
          publicInfoVersionId,
          templateName: placardTemplateName,
        }),
      }
    );
    assertObservedRuntimeHeader(
      createPlacardResp,
      '/api/platform-admin/placards',
      observedRuntimeSha
    );
    const { json: placardBody, text: placardText } =
      await readResponseJsonOrText(createPlacardResp);
    const placardVersionId =
      placardBody?.placard_version_id ?? placardBody?.placardVersionId ?? null;
    const placardDownloadPath =
      placardBody?.download_url ?? placardBody?.downloadUrl ?? null;
    const placardManifestHash =
      placardBody?.download_metadata?.manifest_hash ??
      placardBody?.downloadMetadata?.manifestHash ??
      placardBody?.artifact_manifest_hash ??
      placardBody?.artifactManifestHash ??
      null;
    if (
      (createPlacardResp.status !== 200 && createPlacardResp.status !== 201) ||
      !placardVersionId ||
      !placardDownloadPath ||
      !placardManifestHash
    ) {
      throw new Error(
        `Failed to create controlled placard version: status=${createPlacardResp.status} body=${placardText.slice(0, 300)}`
      );
    }

    const placardDownloadUrl = new URL(
      placardDownloadPath,
      apiOrigin
    ).toString();
    const placardDownloadResp = await fetchImpl(placardDownloadUrl, {
      method: 'GET',
      headers: buildApiHeaders({
        apiIdToken,
        appSessionToken: null,
      }),
    });
    assertObservedRuntimeHeader(
      placardDownloadResp,
      placardDownloadPath,
      observedRuntimeSha
    );
    const { rawBuffer: placardBytes, text: placardDownloadText } =
      await readResponseJsonOrText(placardDownloadResp);
    if (placardDownloadResp.status !== 200) {
      throw new Error(
        `Failed to download controlled placard ${placardVersionId}: status=${placardDownloadResp.status} body=${placardDownloadText.slice(0, 300)}`
      );
    }
    const placardPdfHeader = placardBytes.subarray(0, 5).toString('utf8');
    const placardDownloadedSha256 = sha256Hex(placardBytes);
    if (placardPdfHeader !== '%PDF-') {
      throw new Error(
        `Controlled placard ${placardVersionId} downloaded payload does not start with %PDF- header: got "${placardPdfHeader}"`
      );
    }
    if (placardDownloadedSha256 !== placardManifestHash) {
      throw new Error(
        `Controlled placard ${placardVersionId} SHA-256 mismatch: downloaded=${placardDownloadedSha256} != manifest_hash=${placardManifestHash}`
      );
    }

    evidence.controlled_placard = {
      placard_version_id: placardVersionId,
      version_code: placardVersionCode,
      public_info_version_id: publicInfoVersionId,
      template_name: placardTemplateName,
      pdf_header: placardPdfHeader,
      byte_length: placardBytes.byteLength,
      manifest_hash: placardManifestHash,
      downloaded_sha256: placardDownloadedSha256,
      hash_matches_manifest: placardDownloadedSha256 === placardManifestHash,
      content_type: placardDownloadResp.headers?.get?.('content-type') ?? null,
    };

    // 8. Verify GCS object generations and direct storage readback bytes in both buckets
    const cleanContentGcs = await inspectGcsObjectGenerationAndBytes({
      bucket: remittanceBucket,
      objectKey: `remittance-proof/content/${SYNTHETIC_CLEAN_PDF_SHA256}`,
      runtimeServiceAccount,
      execFileImpl,
    });
    if (
      cleanContentGcs.sha256 !== SYNTHETIC_CLEAN_PDF_SHA256 ||
      cleanContentGcs.byteLength !== SYNTHETIC_CLEAN_PDF_BYTES.byteLength ||
      !cleanContentGcs.bytes.equals(SYNTHETIC_CLEAN_PDF_BYTES)
    ) {
      throw new Error(
        `GCS clean remittance proof object ${cleanContentGcs.uri} byte/hash mismatch: sha256=${cleanContentGcs.sha256}, size=${cleanContentGcs.byteLength}`
      );
    }

    const cleanConsumedMarkerGcs = await inspectGcsObjectGenerationAndBytes({
      bucket: remittanceBucket,
      objectKey: `remittance-proof/consumed/${cleanUpload.stagedContentRef}`,
      runtimeServiceAccount,
      execFileImpl,
    });
    const cleanConsumedMarkerJson = JSON.parse(
      cleanConsumedMarkerGcs.bytes.toString('utf8')
    );
    if (cleanConsumedMarkerJson?.contentHash !== SYNTHETIC_CLEAN_PDF_SHA256) {
      throw new Error(
        `GCS clean consumed marker ${cleanConsumedMarkerGcs.uri} contentHash mismatch: ${JSON.stringify(cleanConsumedMarkerJson)}`
      );
    }

    const eicarContentGcs = await inspectGcsObjectGenerationAndBytes({
      bucket: remittanceBucket,
      objectKey: `remittance-proof/content/${CANONICAL_EICAR_SHA256}`,
      runtimeServiceAccount,
      execFileImpl,
    });
    if (
      eicarContentGcs.sha256 !== CANONICAL_EICAR_SHA256 ||
      eicarContentGcs.byteLength !== CANONICAL_EICAR_BYTES.byteLength
    ) {
      throw new Error(
        `GCS EICAR remittance proof object ${eicarContentGcs.uri} byte/hash mismatch: sha256=${eicarContentGcs.sha256}, size=${eicarContentGcs.byteLength}`
      );
    }

    const eicarConsumedMarkerGcs = await inspectGcsObjectGenerationAndBytes({
      bucket: remittanceBucket,
      objectKey: `remittance-proof/consumed/${eicarUpload.stagedContentRef}`,
      runtimeServiceAccount,
      execFileImpl,
    });
    const eicarConsumedMarkerJson = JSON.parse(
      eicarConsumedMarkerGcs.bytes.toString('utf8')
    );
    if (eicarConsumedMarkerJson?.contentHash !== CANONICAL_EICAR_SHA256) {
      throw new Error(
        `GCS EICAR consumed marker ${eicarConsumedMarkerGcs.uri} contentHash mismatch: ${JSON.stringify(eicarConsumedMarkerJson)}`
      );
    }

    const placardArtifactGcs = await inspectGcsObjectGenerationAndBytes({
      bucket: documentBucket,
      objectKey: `document-artifacts/placard/${placardVersionId}`,
      runtimeServiceAccount,
      execFileImpl,
    });
    if (
      placardArtifactGcs.sha256 !== placardManifestHash ||
      placardArtifactGcs.byteLength !== placardBytes.byteLength ||
      !placardArtifactGcs.bytes.equals(placardBytes)
    ) {
      throw new Error(
        `GCS placard artifact object ${placardArtifactGcs.uri} byte/hash mismatch against downloaded placard: gcs_sha256=${placardArtifactGcs.sha256}, manifest_hash=${placardManifestHash}`
      );
    }

    evidence.gcs_objects = {
      runtime_service_account: runtimeServiceAccount,
      remittance_bucket: remittanceBucket,
      document_bucket: documentBucket,
      clean_remittance_content: {
        uri: cleanContentGcs.uri,
        object_key: cleanContentGcs.objectKey,
        generation: cleanContentGcs.generation,
        byte_length: cleanContentGcs.byteLength,
        sha256: cleanContentGcs.sha256,
      },
      clean_remittance_consumed_marker: {
        uri: cleanConsumedMarkerGcs.uri,
        object_key: cleanConsumedMarkerGcs.objectKey,
        generation: cleanConsumedMarkerGcs.generation,
        byte_length: cleanConsumedMarkerGcs.byteLength,
        sha256: cleanConsumedMarkerGcs.sha256,
      },
      eicar_remittance_content: {
        uri: eicarContentGcs.uri,
        object_key: eicarContentGcs.objectKey,
        generation: eicarContentGcs.generation,
        byte_length: eicarContentGcs.byteLength,
        sha256: eicarContentGcs.sha256,
      },
      eicar_remittance_consumed_marker: {
        uri: eicarConsumedMarkerGcs.uri,
        object_key: eicarConsumedMarkerGcs.objectKey,
        generation: eicarConsumedMarkerGcs.generation,
        byte_length: eicarConsumedMarkerGcs.byteLength,
        sha256: eicarConsumedMarkerGcs.sha256,
      },
      placard_document_artifact: {
        uri: placardArtifactGcs.uri,
        object_key: placardArtifactGcs.objectKey,
        generation: placardArtifactGcs.generation,
        byte_length: placardArtifactGcs.byteLength,
        sha256: placardArtifactGcs.sha256,
      },
    };

    evidence.status = 'passed';
    return evidence;
  } catch (error) {
    evidence.status = 'failed';
    evidence.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    // Revoke temporary driver invitation / device session before revoking Ops session
    if (issuedDriverRegistrationCode && opsToken) {
      try {
        const revokeDriverResp = await fetchImpl(
          `${apiOrigin}/api/auth/driver/device/invite/revoke`,
          {
            method: 'POST',
            headers: buildApiHeaders({
              apiIdToken,
              appSessionToken: opsToken,
              extraHeaders: { 'Content-Type': 'application/json' },
            }),
            body: JSON.stringify({
              registrationCode: issuedDriverRegistrationCode,
            }),
          }
        );
        evidence.teardown.driver_invitation_revoked =
          revokeDriverResp.status === 200 || revokeDriverResp.status === 201;
      } catch {
        evidence.teardown.driver_invitation_revoked = false;
      }
    }

    if (issuedOpsSessionId && opsToken) {
      try {
        const revokeOpsResp = await fetchImpl(
          `${apiOrigin}/api/auth/sessions/revoke`,
          {
            method: 'POST',
            headers: buildApiHeaders({
              apiIdToken,
              appSessionToken: opsToken,
              extraHeaders: { 'Content-Type': 'application/json' },
            }),
            body: JSON.stringify({
              sessionId: issuedOpsSessionId,
            }),
          }
        );
        evidence.teardown.ops_session_revoked =
          revokeOpsResp.status === 200 || revokeOpsResp.status === 201;
      } catch {
        evidence.teardown.ops_session_revoked = false;
      }
    }

    writeEvidenceFile();
  }
}

const isDirectExecution =
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  runSharedDevArtifactRoundtrip()
    .then((result) => {
      console.log(
        JSON.stringify(
          {
            status: result.status,
            candidate_sha: result.candidate_sha,
            observed_runtime_sha: result.observed_runtime_sha,
            clean_remittance_proof_id:
              result.clean_remittance_proof?.remittance_proof_id,
            eicar_remittance_proof_id:
              result.eicar_remittance_proof?.remittance_proof_id,
            placard_version_id: result.controlled_placard?.placard_version_id,
            gcs_generations: {
              clean_remittance_content:
                result.gcs_objects?.clean_remittance_content?.generation,
              eicar_remittance_content:
                result.gcs_objects?.eicar_remittance_content?.generation,
              placard_document_artifact:
                result.gcs_objects?.placard_document_artifact?.generation,
            },
          },
          null,
          2
        )
      );
    })
    .catch((error) => {
      console.error(
        `Shared-dev artifact roundtrip failed: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exitCode = 1;
    });
}
