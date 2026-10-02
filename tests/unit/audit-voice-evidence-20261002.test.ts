import { execSync } from 'child_process';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('Unattended Voice Eval Harness (AUDIT-VOICE-EVIDENCE-20261002)', () => {
  const evalScript = path.resolve(__dirname, '../../operations/verification/unattended-voice-eval.mjs');

  it('fails closed in live mode when production credentials are not provided', () => {
    try {
      execSync(`node ${evalScript} --mode live --authorization-ref AUTH-UV-LIVE-20261002-001`, {
        stdio: 'pipe',
        env: { ...process.env, UNATTENDED_VOICE_LIVE_TRUNK_ENDPOINT: '', UNATTENDED_VOICE_LIVE_AUTH_KEY: '' },
      });
      expect.fail('Expected script to exit with non-zero code');
    } catch (error) {
      expect(error.status).not.toBe(0);
      const stderr = error.stderr.toString();
      expect(stderr).toContain('[FAIL_CLOSED] LIVE MODE REJECTED:');
      expect(stderr).toContain('Live carrier PSTN credentials / trunk endpoints missing from environment');
    }
  });

  it('fails closed in live mode even when credentials look valid but production adapter is not yet implemented', () => {
    try {
      execSync(`node ${evalScript} --mode live --authorization-ref AUTH-UV-LIVE-20261002-001`, {
        stdio: 'pipe',
        env: {
          ...process.env,
          UNATTENDED_VOICE_LIVE_TRUNK_ENDPOINT: 'sip:production@example.com',
          UNATTENDED_VOICE_LIVE_AUTH_KEY: 'test_key',
        },
      });
      expect.fail('Expected script to exit with non-zero code');
    } catch (error) {
      expect(error.status).not.toBe(0);
      const stderr = error.stderr.toString();
      expect(stderr).toContain('[FAIL_CLOSED] LIVE MODE ABORTED:');
      expect(stderr).toContain('Production telephony (CTI/ASR/TTS/recorder) adapter is not yet implemented');
      expect(stderr).toContain('Fixture metrics must not be fabricated for live evaluation');
    }
  });

  it('succeeds in fixture mode with explicit fixture provenance', () => {
    const output = execSync(`node ${evalScript} --mode fixture`, {
      stdio: 'pipe',
      env: { ...process.env },
    }).toString();

    expect(output).toContain('[NOTICE] FIXTURE MODE EVALUATION COMPLETED:');
    expect(output).toContain('It does NOT claim production carrier PSTN voice quality or production carrier SLA');
  });

  it('does not require authorization ref or credentials in fixture mode', () => {
    const output = execSync(`node ${evalScript} --mode fixture`, {
      stdio: 'pipe',
      env: {
        ...process.env,
        UNATTENDED_VOICE_LIVE_TRUNK_ENDPOINT: '',
        UNATTENDED_VOICE_LIVE_AUTH_KEY: '',
      },
    }).toString();

    expect(output).toContain('[NOTICE] FIXTURE MODE EVALUATION COMPLETED:');
  });
});
