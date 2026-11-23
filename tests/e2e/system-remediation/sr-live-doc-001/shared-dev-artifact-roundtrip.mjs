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

function unwrapEnvelope(payload) {
  if (
    payload &&
    typeof payload === 'object' &&
    'data' in payload &&
    payload.data !== undefined
  ) {
    return payload.data;
  }
  return payload;
}

function sanitizeDiagnosticSnippet(text) {
  if (typeof text !== 'string' || !text) {
    return '';
  }
  return text
    .replace(
      /("(?:token|access_token|accessToken|refresh_token|refreshToken|registration_code|registrationCode|id_token|idToken)"\s*:\s*)"[^"]*"/gi,
      '$1"[REDACTED]"'
    )
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .slice(0, 300);
}

function extractConsumedMarkerContentHash(bytes) {
  const raw = bytes.toString('utf8').trim();
  if (/^[0-9a-f]{64}$/i.test(raw)) {
    return raw.toLowerCase();
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed?.contentHash ?? parsed?.content_hash ?? null;
  } catch {
    return raw;
  }
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
    options.scanMaxAttempts ?? env.SR_LIVE_DOC_SCAN_MAX_ATTEMPTS ?? 60
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
      const { json: tokenBodyRaw, text: tokenText } =
        await readResponseJsonOrText(tokenResp);
      const tokenBody = unwrapEnvelope(tokenBodyRaw);
      const mintedOpsToken =
        tokenBody?.token ??
        tokenBody?.accessToken ??
        tokenBody?.access_token ??
        null;
      if (
        (tokenResp.status !== 200 && tokenResp.status !== 201) ||
        !mintedOpsToken
      ) {
        evidence.missing.push('platform_admin_ops_session');
        throw new Error(
          `Failed to mint platform_admin session via ${tokenUrl}: status=${tokenResp.status} body=${sanitizeDiagnosticSnippet(tokenText)}`
        );
      }
      opsToken = String(mintedOpsToken).trim();
      mask(opsToken);
      issuedOpsSessionId =
        tokenBody?.session_id ?? tokenBody?.sessionId ?? null;
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
    const { json: opsSessionRaw, text: opsSessionText } =
      await readResponseJsonOrText(opsSessionResp);
    const opsSessionData = unwrapEnvelope(opsSessionRaw);
    const opsIdentity = opsSessionData?.identity ?? opsSessionData;
    if (opsSessionResp.status !== 200 || !opsIdentity) {
      evidence.missing.push('verified_platform_admin_ops_session');
      throw new Error(
        `Failed to verify Ops session at ${apiOrigin}/api/auth/session: status=${opsSessionResp.status} body=${sanitizeDiagnosticSnippet(opsSessionText)}`
      );
    }
    const opsScopes = Array.isArray(opsIdentity.scopes)
      ? opsIdentity.scopes
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
    const opsSessionId =
      opsIdentity.session_id ?? opsIdentity.sessionId ?? null;
    if (!issuedOpsSessionId && opsSessionId && !preSuppliedOpsToken) {
      issuedOpsSessionId = opsSessionId;
    }
    evidence.role_sessions.ops = {
      session_id: opsSessionId ?? issuedOpsSessionId ?? null,
      actor_id:
        opsIdentity.actor_id ??
        opsIdentity.actorId ??
        opsIdentity.principal_id ??
        opsIdentity.principalId ??
        null,
      actor_type: opsIdentity.actor_type ?? opsIdentity.actorType ?? null,
      realm: opsIdentity.realm ?? null,
      role: opsIdentity.role ?? null,
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
      const { json: inviteBodyRaw, text: inviteText } =
        await readResponseJsonOrText(inviteResp);
      const inviteBody = unwrapEnvelope(inviteBodyRaw);
      const registrationCode =
        inviteBody?.registrationCode ?? inviteBody?.registration_code ?? null;
      if (
        (inviteResp.status !== 200 && inviteResp.status !== 201) ||
        !registrationCode
      ) {
        evidence.missing.push(`driver_device_invitation:${driverId}`);
        throw new Error(
          `Failed to issue driver device invitation for ${driverId}: status=${inviteResp.status} body=${sanitizeDiagnosticSnippet(inviteText)}`
        );
      }
      issuedDriverRegistrationCode = String(registrationCode).trim();
      mask(issuedDriverRegistrationCode);

      // Note: /api/auth/driver/device/register is @OpenRoute(); never pass Google ID token in Authorization.
      const deviceId = `sr-live-doc-roundtrip-${randomUUID().slice(0, 8)}`;
      const attemptDriverDeviceRegister = async () =>
        fetchImpl(`${apiOrigin}/api/auth/driver/device/register`, {
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
        });

      let registerResp = await attemptDriverDeviceRegister();
      assertObservedRuntimeHeader(
        registerResp,
        '/api/auth/driver/device/register',
        observedRuntimeSha
      );
      let { json: registerBodyRaw, text: registerText } =
        await readResponseJsonOrText(registerResp);

      if (
        registerResp.status === 404 &&
        registerBodyRaw?.error?.code === 'DRIVER_NOT_FOUND'
      ) {
        // Ensure canonical synthetic driver master record drv-demo-001 is persisted in regulatory-registry
        const driverSeedPayload = {
          driverId,
          name: 'Driver Demo One',
          supportedServiceBuckets: ['standard_taxi', 'business_dispatch'],
          licensesValid: true,
          licenseExpiry: '2027-12-31T23:59:59.000Z',
          professionalDriverLicenseExpiry: '2027-12-31T23:59:59.000Z',
          taxiDriverRegistrationExpiry: '2027-12-31T23:59:59.000Z',
          lifecycleStatus: 'active',
        };
        let createDriverResp = await fetchImpl(
          `${apiOrigin}/api/regulatory-registry/drivers`,
          {
            method: 'POST',
            headers: buildApiHeaders({
              apiIdToken,
              appSessionToken: opsToken,
              extraHeaders: { 'Content-Type': 'application/json' },
            }),
            body: JSON.stringify(driverSeedPayload),
          }
        );
        if (createDriverResp.status === 409) {
          // Force prepareDriverAuthority on the instance to reconcile in-memory seed against Postgres
          await fetchImpl(
            `${apiOrigin}/api/regulatory-registry/drivers/${encodeURIComponent(driverId)}/work-state`,
            {
              method: 'POST',
              headers: buildApiHeaders({
                apiIdToken,
                appSessionToken: opsToken,
                extraHeaders: { 'Content-Type': 'application/json' },
              }),
              body: JSON.stringify({ workState: 'available' }),
            }
          );
          createDriverResp = await fetchImpl(
            `${apiOrigin}/api/regulatory-registry/drivers`,
            {
              method: 'POST',
              headers: buildApiHeaders({
                apiIdToken,
                appSessionToken: opsToken,
                extraHeaders: { 'Content-Type': 'application/json' },
              }),
              body: JSON.stringify(driverSeedPayload),
            }
          );
        }
        assertObservedRuntimeHeader(
          createDriverResp,
          '/api/regulatory-registry/drivers',
          observedRuntimeSha
        );

        registerResp = await attemptDriverDeviceRegister();
        assertObservedRuntimeHeader(
          registerResp,
          '/api/auth/driver/device/register (retry)',
          observedRuntimeSha
        );
        const retryParsed = await readResponseJsonOrText(registerResp);
        registerBodyRaw = retryParsed.json;
        registerText = retryParsed.text;
      }

      const registerBody = unwrapEnvelope(registerBodyRaw);
      const mintedDriverToken =
        registerBody?.accessToken ??
        registerBody?.access_token ??
        registerBody?.token ??
        null;
      if (
        (registerResp.status !== 200 && registerResp.status !== 201) ||
        !mintedDriverToken
      ) {
        evidence.missing.push(`driver_device_session:${driverId}`);
        throw new Error(
          `Failed to register driver device session for ${driverId}: status=${registerResp.status} body=${sanitizeDiagnosticSnippet(registerText)}`
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
    const { json: driverSessionRaw, text: driverSessionText } =
      await readResponseJsonOrText(driverSessionResp);
    const driverSessionData = unwrapEnvelope(driverSessionRaw);
    const driverIdentity = driverSessionData?.identity ?? driverSessionData;
    if (driverSessionResp.status !== 200 || !driverIdentity) {
      evidence.missing.push(`verified_driver_session:${driverId}`);
      throw new Error(
        `Failed to verify Driver session at ${apiOrigin}/api/auth/session: status=${driverSessionResp.status} body=${sanitizeDiagnosticSnippet(driverSessionText)}`
      );
    }
    const driverScopes = Array.isArray(driverIdentity.scopes)
      ? driverIdentity.scopes
      : [];
    if (!driverScopes.includes('driver:write')) {
      evidence.missing.push('driver_scope:driver:write');
      throw new Error(
        `Driver session is missing required scope "driver:write"; actual scopes: ${driverScopes.join(', ')}`
      );
    }
    const resolvedDriverActorId =
      driverIdentity.driver_id ??
      driverIdentity.driverId ??
      driverIdentity.actor_id ??
      driverIdentity.actorId ??
      null;
    if (resolvedDriverActorId && resolvedDriverActorId !== driverId) {
      throw new Error(
        `Driver session bound to unexpected driverId "${resolvedDriverActorId}", expected "${driverId}"`
      );
    }
    evidence.role_sessions.driver = {
      session_id:
        driverIdentity.session_id ??
        driverIdentity.sessionId ??
        driverIdentity.driver_binding_id ??
        driverIdentity.driverBindingId ??
        null,
      driver_id: resolvedDriverActorId ?? driverId,
      actor_type: driverIdentity.actor_type ?? driverIdentity.actorType ?? null,
      realm: driverIdentity.realm ?? null,
      role: driverIdentity.role ?? null,
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
    const { json: feePlansRaw, text: feePlansText } =
      await readResponseJsonOrText(feePlansResp);
    const feePlansData = unwrapEnvelope(feePlansRaw);
    if (feePlansResp.status !== 200 || !Array.isArray(feePlansData?.items)) {
      throw new Error(
        `Failed to list driver fee plans: status=${feePlansResp.status} body=${sanitizeDiagnosticSnippet(feePlansText)}`
      );
    }
    const activeTopPlan = feePlansData.items[0] ?? null;
    const activeTopPlanMode =
      activeTopPlan?.reimbursement_mode ??
      activeTopPlan?.reimbursementMode ??
      null;
    const activeTopPlanCode =
      activeTopPlan?.plan_code ??
      activeTopPlan?.planCode ??
      activeTopPlan?.plan_name ??
      activeTopPlan?.planName ??
      null;
    const fixturePlanIsTopActive = Boolean(
      activeTopPlan &&
        activeTopPlan.status === 'published' &&
        (activeTopPlanMode === 'platform_funded' ||
          activeTopPlanCode === 'fixture-platform-funded-reimbursement')
    );
    if (!fixturePlanIsTopActive) {
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
            planName: 'fixture-platform-funded-reimbursement',
            planCode: 'fixture-platform-funded-reimbursement',
            version: `2026.03-uat-${randomUUID().slice(0, 8)}`,
            versionCode: 'v1',
            serviceFeeBps: 1200,
            reimbursementMode: 'platform_funded',
          }),
        }
      );
      assertObservedRuntimeHeader(
        publishPlanResp,
        '/api/driver-fee-plans/publish',
        observedRuntimeSha
      );
      if (
        publishPlanResp.status !== 200 &&
        publishPlanResp.status !== 201 &&
        publishPlanResp.status !== 409
      ) {
        const { text: publishPlanText } =
          await readResponseJsonOrText(publishPlanResp);
        evidence.missing.push(
          'driver_fee_plan:fixture-platform-funded-reimbursement'
        );
        throw new Error(
          `Failed to publish fixture driver fee plan: status=${publishPlanResp.status} body=${sanitizeDiagnosticSnippet(publishPlanText)}`
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
          extraHeaders: {
            'Content-Type': 'application/json',
            'Idempotency-Key': `uat-stmt-${driverId}-${billingPeriod}-${randomUUID()}`,
          },
        }),
        body: JSON.stringify({
          driverId,
          periodMonth: billingPeriod,
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
    const { json: statementRaw, text: statementText } =
      await readResponseJsonOrText(statementResp);
    const statementData = unwrapEnvelope(statementRaw);
    const batchIdsList =
      statementData?.reimbursement_batch_ids ??
      statementData?.reimbursementBatchIds ??
      null;
    const reimbursementBatchId =
      (Array.isArray(batchIdsList) && batchIdsList.length > 0
        ? batchIdsList[0]
        : null) ??
      statementData?.reimbursement_batch?.batch_id ??
      statementData?.reimbursementBatch?.batchId ??
      null;
    if (
      (statementResp.status !== 200 && statementResp.status !== 201) ||
      !reimbursementBatchId
    ) {
      evidence.missing.push(
        `synthetic_reimbursement_batch:${driverId}:${billingPeriod}`
      );
      throw new Error(
        `Failed to resolve synthetic reimbursement batch for ${driverId} (${billingPeriod}): status=${statementResp.status} body=${sanitizeDiagnosticSnippet(statementText)}`
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
    const { json: batchRaw, text: batchText } =
      await readResponseJsonOrText(batchResp);
    const batchBody = unwrapEnvelope(batchRaw);
    const verifiedBatchId = batchBody?.batch_id ?? batchBody?.batchId ?? null;
    const verifiedBatchDriverId =
      batchBody?.driver_id ?? batchBody?.driverId ?? null;
    if (
      batchResp.status !== 200 ||
      verifiedBatchId !== reimbursementBatchId ||
      verifiedBatchDriverId !== driverId
    ) {
      evidence.missing.push(
        `verified_reimbursement_batch:${reimbursementBatchId}`
      );
      throw new Error(
        `Failed to verify reimbursement batch ${reimbursementBatchId}: status=${batchResp.status} body=${sanitizeDiagnosticSnippet(batchText)}`
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
    const { json: publicInfoRaw, text: publicInfoText } =
      await readResponseJsonOrText(publicInfoResp);
    const publicInfoData = unwrapEnvelope(publicInfoRaw);
    if (publicInfoResp.status !== 200 || !Array.isArray(publicInfoData?.items)) {
      throw new Error(
        `Failed to list platform-admin public info versions: status=${publicInfoResp.status} body=${sanitizeDiagnosticSnippet(publicInfoText)}`
      );
    }
    const targetPublicInfo = publicInfoData.items.find(
      (item) =>
        item &&
        (item.version_id === publicInfoVersionId ||
          item.versionId === publicInfoVersionId ||
          item.public_info_version_id === publicInfoVersionId ||
          item.publicInfoVersionId === publicInfoVersionId)
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
            extraHeaders: {
              'Content-Type': 'application/json',
              'Idempotency-Key': `uat-stage-${label}-${randomUUID()}`,
            },
          }),
          body: JSON.stringify({
            contentBase64: bytes.toString('base64'),
            contentType: 'application/pdf',
          }),
        }
      );
      assertObservedRuntimeHeader(
        stageResp,
        `/api/reimbursements/proofs/staged-content (${label})`,
        observedRuntimeSha
      );
      const { json: stageRaw, text: stageText } =
        await readResponseJsonOrText(stageResp);
      const stageBody = unwrapEnvelope(stageRaw);
      const stagedContentRef =
        stageBody?.stagedContentRef ?? stageBody?.staged_content_ref ?? null;
      const stagedContentHash =
        stageBody?.contentHash ?? stageBody?.content_hash ?? null;
      const stagedSizeBytes =
        stageBody?.sizeBytes ?? stageBody?.size_bytes ?? null;
      if (
        (stageResp.status !== 200 && stageResp.status !== 201) ||
        !stagedContentRef
      ) {
        throw new Error(
          `Failed to stage ${label} remittance proof content: status=${stageResp.status} body=${sanitizeDiagnosticSnippet(stageText)}`
        );
      }
      if (stagedContentHash !== null && stagedContentHash !== expectedSha256) {
        throw new Error(
          `Staged ${label} content_hash mismatch: expected ${expectedSha256}, got ${stagedContentHash}`
        );
      }
      if (stagedSizeBytes !== null && stagedSizeBytes !== bytes.byteLength) {
        throw new Error(
          `Staged ${label} size_bytes mismatch: expected ${bytes.byteLength}, got ${stagedSizeBytes}`
        );
      }

      const uploadResp = await fetchImpl(
        `${apiOrigin}/api/reimbursements/proofs`,
        {
          method: 'POST',
          headers: buildApiHeaders({
            apiIdToken,
            appSessionToken: driverToken,
            extraHeaders: {
              'Content-Type': 'application/json',
              'Idempotency-Key': `uat-upload-${label}-${randomUUID()}`,
            },
          }),
          body: JSON.stringify({
            batchId: reimbursementBatchId,
            reimbursementBatchId,
            originalFilename: fileName,
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
      const { json: uploadRaw, text: uploadText } =
        await readResponseJsonOrText(uploadResp);
      let proofBody = unwrapEnvelope(uploadRaw);
      const proofId =
        proofBody?.proof_id ??
        proofBody?.proofId ??
        proofBody?.remittance_proof_id ??
        null;
      if (
        (uploadResp.status !== 200 && uploadResp.status !== 201) ||
        !proofId
      ) {
        throw new Error(
          `Failed to upload ${label} remittance proof: status=${uploadResp.status} body=${sanitizeDiagnosticSnippet(uploadText)}`
        );
      }
      const committedContentHash =
        proofBody?.content?.content_hash ??
        proofBody?.content?.contentHash ??
        null;
      const committedSizeBytes =
        proofBody?.content?.size_bytes ??
        proofBody?.content?.sizeBytes ??
        null;
      if (
        committedContentHash !== null &&
        committedContentHash !== expectedSha256
      ) {
        throw new Error(
          `Uploaded ${label} content_hash mismatch: expected ${expectedSha256}, got ${committedContentHash}`
        );
      }
      if (
        committedSizeBytes !== null &&
        committedSizeBytes !== bytes.byteLength
      ) {
        throw new Error(
          `Uploaded ${label} size_bytes mismatch: expected ${bytes.byteLength}, got ${committedSizeBytes}`
        );
      }

      let scanState = proofBody?.scanState ?? proofBody?.scan_state ?? null;
      let rejectionReason =
        proofBody?.rejectionReason ?? proofBody?.rejection_reason ?? null;
      let scanAttempts = 1;
      while (scanState === 'pending_scan' && scanAttempts < scanMaxAttempts) {
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
        if (rescanResp.status === 503) {
          // Scanner cold start returns 503 REMITTANCE_PROOF_SCANNER_UNAVAILABLE while clamd loads
          continue;
        }
        const rescanData = unwrapEnvelope(rescanParsed.json);
        if (
          (rescanResp.status !== 200 && rescanResp.status !== 201) ||
          !rescanData
        ) {
          throw new Error(
            `Failed to re-scan ${label} proof ${proofId}: status=${rescanResp.status} body=${sanitizeDiagnosticSnippet(rescanParsed.text)}`
          );
        }
        proofBody = rescanData;
        scanState = proofBody?.scanState ?? proofBody?.scan_state ?? null;
        rejectionReason =
          proofBody?.rejectionReason ?? proofBody?.rejection_reason ?? null;
      }

      return {
        proofId,
        stagedContentRef,
        proofBody,
        scanState,
        rejectionReason,
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

    if (cleanUpload.scanState !== 'clean') {
      throw new Error(
        `Clean remittance proof ${cleanUpload.proofId} did not reach scan_state="clean": got scan_state="${cleanUpload.scanState}" rejection_reason="${cleanUpload.rejectionReason}"`
      );
    }
    if (cleanUpload.rejectionReason !== null) {
      throw new Error(
        `Clean remittance proof ${cleanUpload.proofId} unexpected rejection_reason: ${cleanUpload.rejectionReason}`
      );
    }

    const cleanReadbackResp = await fetchImpl(
      `${apiOrigin}/api/reimbursements/proofs/${encodeURIComponent(cleanUpload.proofId)}/readback`,
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
      cleanReadbackResp,
      `/api/reimbursements/proofs/${cleanUpload.proofId}/readback`,
      observedRuntimeSha
    );
    const { json: cleanReadbackRaw, text: cleanReadbackText } =
      await readResponseJsonOrText(cleanReadbackResp);
    const cleanReadbackBody = unwrapEnvelope(cleanReadbackRaw);
    const cleanReadbackPath =
      cleanReadbackBody?.readbackUrl ?? cleanReadbackBody?.readback_url ?? null;
    if (
      (cleanReadbackResp.status !== 200 && cleanReadbackResp.status !== 201) ||
      !cleanReadbackPath
    ) {
      throw new Error(
        `Failed to acquire Ops readback URL for clean proof ${cleanUpload.proofId}: status=${cleanReadbackResp.status} body=${sanitizeDiagnosticSnippet(cleanReadbackText)}`
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
        `Failed to download clean remittance proof from ${cleanReadbackPath}: status=${cleanDownloadResp.status} body=${sanitizeDiagnosticSnippet(cleanDownloadText)}`
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
      scan_state: cleanUpload.scanState,
      rejection_reason: cleanUpload.rejectionReason,
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
      eicarUpload.scanState !== 'rejected' ||
      eicarUpload.rejectionReason !== 'MALWARE_DETECTED'
    ) {
      throw new Error(
        `EICAR remittance proof ${eicarUpload.proofId} was not rejected with MALWARE_DETECTED: got scan_state="${eicarUpload.scanState}" rejection_reason="${eicarUpload.rejectionReason}"`
      );
    }

    const eicarReadbackResp = await fetchImpl(
      `${apiOrigin}/api/reimbursements/proofs/${encodeURIComponent(eicarUpload.proofId)}/readback`,
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
      eicarReadbackResp,
      `/api/reimbursements/proofs/${eicarUpload.proofId}/readback`,
      observedRuntimeSha
    );
    const { json: eicarReadbackRaw } =
      await readResponseJsonOrText(eicarReadbackResp);
    const eicarReadbackBody = unwrapEnvelope(eicarReadbackRaw);
    const eicarReadbackPath =
      eicarReadbackBody?.readbackUrl ?? eicarReadbackBody?.readback_url ?? null;

    let eicarDownloadDeniedStatus = eicarReadbackResp.status;
    let eicarDownloadDeniedCode =
      eicarReadbackRaw?.error?.code ?? eicarReadbackBody?.code ?? null;

    if (
      (eicarReadbackResp.status === 200 || eicarReadbackResp.status === 201) &&
      eicarReadbackPath
    ) {
      const eicarDownloadUrl = new URL(
        eicarReadbackPath,
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
        eicarReadbackPath,
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
          `EICAR remittance proof download must be denied with 409 REMITTANCE_PROOF_NOT_CLEAN: got status=${eicarDownloadResp.status} body=${sanitizeDiagnosticSnippet(eicarDownloadText)}`
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
      scan_state: eicarUpload.scanState,
      rejection_reason: eicarUpload.rejectionReason,
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
    const { json: placardRaw, text: placardText } =
      await readResponseJsonOrText(createPlacardResp);
    const placardBody = unwrapEnvelope(placardRaw);
    const placardVersionId =
      placardBody?.placardVersionId ?? placardBody?.placard_version_id ?? null;
    const placardDownloadPath =
      placardBody?.artifact_download_url ??
      placardBody?.artifactDownloadUrl ??
      placardBody?.download_metadata?.download_url ??
      placardBody?.downloadMetadata?.downloadUrl ??
      placardBody?.download_url ??
      placardBody?.downloadUrl ??
      null;
    const placardManifestHash =
      placardBody?.artifact_manifest_hash ??
      placardBody?.artifactManifestHash ??
      placardBody?.download_metadata?.manifest_hash ??
      placardBody?.downloadMetadata?.manifestHash ??
      null;
    if (
      (createPlacardResp.status !== 200 && createPlacardResp.status !== 201) ||
      !placardVersionId ||
      !placardDownloadPath ||
      !placardManifestHash
    ) {
      throw new Error(
        `Failed to create controlled placard version: status=${createPlacardResp.status} body=${sanitizeDiagnosticSnippet(placardText)}`
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
        `Failed to download controlled placard ${placardVersionId}: status=${placardDownloadResp.status} body=${sanitizeDiagnosticSnippet(placardDownloadText)}`
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
    const cleanConsumedMarkerHash = extractConsumedMarkerContentHash(
      cleanConsumedMarkerGcs.bytes
    );
    if (cleanConsumedMarkerHash !== SYNTHETIC_CLEAN_PDF_SHA256) {
      throw new Error(
        `GCS clean consumed marker ${cleanConsumedMarkerGcs.uri} contentHash mismatch: ${cleanConsumedMarkerHash}`
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
    const eicarConsumedMarkerHash = extractConsumedMarkerContentHash(
      eicarConsumedMarkerGcs.bytes
    );
    if (eicarConsumedMarkerHash !== CANONICAL_EICAR_SHA256) {
      throw new Error(
        `GCS EICAR consumed marker ${eicarConsumedMarkerGcs.uri} contentHash mismatch: ${eicarConsumedMarkerHash}`
      );
    }

    const placardArtifactGcs = await inspectGcsObjectGenerationAndBytes({
      bucket: documentBucket,
      objectKey: `document-artifacts/placard/${encodeURIComponent(placardVersionId)}`,
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
    evidence.error = sanitizeDiagnosticSnippet(
      error instanceof Error ? error.message : String(error)
    );
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
        `Shared-dev artifact roundtrip failed: ${sanitizeDiagnosticSnippet(error instanceof Error ? error.message : String(error))}`
      );
      process.exitCode = 1;
    });
}
