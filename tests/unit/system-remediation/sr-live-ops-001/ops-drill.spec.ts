import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';

const execAsync = promisify(exec);

describe('Live Ops Restore Drill Script', () => {
  const scriptPath = join(__dirname, '../../../../infra/gcp/dev/ops-drill/run-restore-drill.sh');

  it('fails execution when AUTHORIZED_ISOLATED_OPS_TARGET is not set', async () => {
    try {
      await execAsync(`bash ${scriptPath}`, {
        env: { ...process.env, AUTHORIZED_ISOLATED_OPS_TARGET: '' },
      });
      fail('Script should have failed without authorization');
    } catch (error: any) {
      expect(error.code).toBe(1);
      expect(error.stdout).toContain('[ERROR] Missing AUTHORIZED_ISOLATED_OPS_TARGET');
      expect(error.stdout).toContain('[ERROR] Live execution blocked');
    }
  });

  it('passes arguments correctly to the execution logic', async () => {
    try {
      await execAsync(`bash ${scriptPath} --env test-env --backup-point 2026-10-02T12:00:00Z`, {
        env: { ...process.env, AUTHORIZED_ISOLATED_OPS_TARGET: '' }, // still empty to block actual restore
      });
    } catch (error: any) {
      expect(error.stdout).toContain('environment: test-env');
      expect(error.stdout).toContain('backup point: 2026-10-02T12:00:00Z');
      expect(error.stdout).toContain('Selected backup ID: 2026-10-02T12:00:00Z');
    }
  });
});
