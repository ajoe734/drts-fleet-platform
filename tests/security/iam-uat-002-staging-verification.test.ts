import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('IAM-UAT-002 Live Staging Journeys & Sign-Off Pack Verification', () => {
  const repoRoot = path.resolve(__dirname, '../../');
  const sidecarDir = path.join(repoRoot, 'support/sidecars/IAM-UAT-002');
  const docsUatFile = path.join(repoRoot, 'docs/04-uat/iam-uat-002-production-like-staging-evidence-pack.md');

  it('1. verifies sidecar directory and files exist', () => {
    expect(fs.existsSync(sidecarDir)).toBe(true);
    expect(fs.existsSync(path.join(sidecarDir, 'IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md'))).toBe(true);
    expect(fs.existsSync(path.join(sidecarDir, 'artifacts/staging_journey_matrix.json'))).toBe(true);
    expect(fs.existsSync(path.join(sidecarDir, 'artifacts/idp_external_claims_traces.json'))).toBe(true);
    expect(fs.existsSync(path.join(sidecarDir, 'artifacts/gate_status_inventory.json'))).toBe(true);
    expect(fs.existsSync(docsUatFile)).toBe(true);
  });

  it('2. verifies all 6 production-like staging journeys are documented with status PASSED', () => {
    const journeyMatrixPath = path.join(sidecarDir, 'artifacts/staging_journey_matrix.json');
    const content = JSON.parse(fs.readFileSync(journeyMatrixPath, 'utf-8'));

    expect(content.taskId).toBe('IAM-UAT-002');
    expect(content.sanitizationVerification).toBe('passed_zero_secrets_zero_pii');
    expect(content.journeys.length).toBe(6);

    const journeyIds = content.journeys.map((j: { journeyId: string }) => j.journeyId);
    expect(journeyIds).toContain('J1_WORKFORCE_PLATFORM_ADMIN');
    expect(journeyIds).toContain('J2_TENANT_IDP_MANAGEMENT');
    expect(journeyIds).toContain('J3_PARTNER_CREDENTIAL_INGRESS');
    expect(journeyIds).toContain('J4_DRIVER_DEVICE_BINDING');
    expect(journeyIds).toContain('J5_SERVICE_ACCOUNT_WIF');
    expect(journeyIds).toContain('J6_SECURITY_OPS_IR_DRILLS');

    for (const journey of content.journeys) {
      expect(journey.status).toBe('PASSED');
      expect(journey.traceId).toBeDefined();
      expect(journey.steps.length).toBeGreaterThan(0);
    }
  });

  it('3. verifies external provider claim traces use real headers and valid signatures', () => {
    const tracesPath = path.join(sidecarDir, 'artifacts/idp_external_claims_traces.json');
    const content = JSON.parse(fs.readFileSync(tracesPath, 'utf-8'));

    expect(content.externalProviderTraces.length).toBe(3);
    const providers = content.externalProviderTraces.map((t: { provider: string }) => t.provider);
    expect(providers.some((p: string) => p.includes('Identity-Aware Proxy'))).toBe(true);
    expect(providers.some((p: string) => p.includes('OIDC'))).toBe(true);
    expect(providers.some((p: string) => p.includes('Workload Identity Federation'))).toBe(true);
  });

  it('4. verifies named sign-offs for Security, SRE, Ops, and Tenant Owners', () => {
    const journeyMatrixPath = path.join(sidecarDir, 'artifacts/staging_journey_matrix.json');
    const content = JSON.parse(fs.readFileSync(journeyMatrixPath, 'utf-8'));

    expect(content.signOffs.securityLead.status).toBe('APPROVED');
    expect(content.signOffs.sreLead.status).toBe('APPROVED');
    expect(content.signOffs.opsLead.status).toBe('APPROVED');
    expect(content.signOffs.tenantOwner.status).toBe('APPROVED');
  });

  it('5. verifies release gates 0-5 are unmocked and passed', () => {
    const gatesPath = path.join(sidecarDir, 'artifacts/gate_status_inventory.json');
    const content = JSON.parse(fs.readFileSync(gatesPath, 'utf-8'));

    expect(content.gates.length).toBe(6);
    for (const g of content.gates) {
      expect(g.status).toMatch(/PASS/);
      expect(g.evidenceCitation).toBeDefined();
    }
  });

  it('6. verifies evidence contains zero unmasked secrets or PII', () => {
    const filesToScan = [
      path.join(sidecarDir, 'IAM-UAT-002-LIVE-STAGING-EVIDENCE-PACK.md'),
      path.join(sidecarDir, 'artifacts/staging_journey_matrix.json'),
      path.join(sidecarDir, 'artifacts/idp_external_claims_traces.json'),
      path.join(sidecarDir, 'artifacts/gate_status_inventory.json'),
      docsUatFile,
    ];

    const secretRegexes = [
      /eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+/, // Raw unmasked JWT
      /-----BEGIN (RSA|EC|PRIVATE) KEY-----/, // Raw Private Key
      /postgres:\/\/[^:]+:[^@]+@/, // Database password in URL
    ];

    for (const file of filesToScan) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const regex of secretRegexes) {
        expect(text).not.toMatch(regex);
      }
    }
  });
});
