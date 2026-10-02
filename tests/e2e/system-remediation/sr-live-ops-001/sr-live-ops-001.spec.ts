import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import { join } from 'path';

test.describe('SR-LIVE-OPS-001: 部署排程／備份還原與容量驗收', () => {

  test('fails if external gates (authorization) are missing', async () => {
    // According to the acceptance criteria, this task requires explicitly authorized resources.
    // We expect AUTHORIZED_ISOLATED_OPS_TARGET and other evidence variables to exist,
    // otherwise the test fails gracefully as per instructions, leaving it in 'blocked' state.

    const requiredEvidence = [
      'AUTHORIZED_ISOLATED_OPS_TARGET',
      'BACKUP_RESTORE_READBACK',
      'RPO_RTO_CAPACITY_BASELINE',
      'SCHEDULED_JOB_RESTART_PROOF',
      'LIVE_CANDIDATE_SHA'
    ];

    const missingEvidence = requiredEvidence.filter(envVar => !process.env[envVar]);

    if (missingEvidence.length > 0) {
      test.info().annotations.push({
        type: 'blocked',
        description: `Missing required evidence or authorization: ${missingEvidence.join(', ')}`
      });
      // The task specification mandates failing (nonzero) when evidence is missing.
      expect(missingEvidence.length, `Missing required evidence for LIVE UAT: ${missingEvidence.join(', ')}`).toBe(0);
    }
  });

  test('validates the restore drill operator script presence and execution', async () => {
    // Assert the script exists and is executable in dry-run mode
    const scriptPath = join(__dirname, '../../../../infra/gcp/dev/ops-drill/run-restore-drill.sh');
    let output = '';
    try {
      // Execute without authorization variable to ensure it is guarded
      output = execSync(`bash ${scriptPath} --env test-env`, { encoding: 'utf-8', env: { ...process.env, AUTHORIZED_ISOLATED_OPS_TARGET: '' } });
    } catch (error: any) {
      output = error.stdout?.toString() || '';
    }

    expect(output).toContain('[ERROR] Missing AUTHORIZED_ISOLATED_OPS_TARGET');
  });

});
