import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('Unattended Voice Eval Harness (AUDIT-VOICE-EVIDENCE-20261002)', () => {
  const evalScript = path.resolve(__dirname, '../../operations/verification/unattended-voice-eval.mjs');
  let tempDir: string;
  let sentinelFile: string;
  let outputFile: string;
  let networkGuardScript: string;
  let networkLogFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-voice-evidence-'));
    sentinelFile = path.join(tempDir, 'existing-evidence.json');
    outputFile = path.join(tempDir, 'output.json');
    fs.writeFileSync(sentinelFile, '{"sentinel": true, "hash": "abcd123"}', 'utf-8');
    
    networkLogFile = path.join(tempDir, 'network-log.txt');
    fs.writeFileSync(networkLogFile, '', 'utf-8');

    networkGuardScript = path.join(tempDir, 'network-guard.mjs');
    const guardCode = `
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dgram from 'node:dgram';

const logFile = process.env.NETWORK_LOG_FILE;
function record(api) {
    fs.appendFileSync(logFile, api + '\\n');
    throw new Error('Network guard triggered: ' + api);
}

const patchMethod = (obj, method, apiName) => {
    const orig = obj[method];
    if (orig) {
        obj[method] = function() { record(apiName); return orig.apply(this, arguments); };
    }
};

patchMethod(http, 'request', 'http.request');
patchMethod(http, 'get', 'http.get');
patchMethod(https, 'request', 'https.request');
patchMethod(https, 'get', 'https.get');
patchMethod(net, 'connect', 'net.connect');
patchMethod(tls, 'connect', 'tls.connect');
patchMethod(dgram, 'createSocket', 'dgram.createSocket');

if (globalThis.fetch) {
    const origFetch = globalThis.fetch;
    globalThis.fetch = function() { record('fetch'); return origFetch.apply(this, arguments); };
}
if (globalThis.WebSocket) {
    const origWS = globalThis.WebSocket;
    globalThis.WebSocket = function() { record('WebSocket'); return new origWS(...arguments); };
}
`;
    fs.writeFileSync(networkGuardScript, guardCode, 'utf-8');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const getEnv = (extraEnv: Record<string, string> = {}) => ({
    PATH: process.env.PATH,
    NETWORK_LOG_FILE: networkLogFile,
    NODE_OPTIONS: `--import file://${networkGuardScript}`,
    ...extraEnv
  });

  const expectNoNetwork = () => {
    const log = fs.readFileSync(networkLogFile, 'utf-8');
    expect(log).toBe('');
  };

  const expectRejection = (scriptCmd: string, env: any) => {
    // Test 1: Absent output target is not created
    try {
      execSync(`${scriptCmd} --output ${outputFile}`, { stdio: 'pipe', env });
      expect.fail('Expected script to exit with non-zero code');
    } catch (error: any) {
      expect(error.status).not.toBe(0);
      const stderr = error.stderr.toString();
      const stdout = error.stdout.toString();
      expect(stderr).toContain('[FAIL_CLOSED]');
      expect(stdout).not.toContain('TELEPHONY EVALUATION COMPLETED');
      expect(stdout).not.toContain('Completion Rate');
      expect(fs.existsSync(outputFile)).toBe(false);
    }
    
    // Test 2: Existing target is preserved
    try {
      execSync(`${scriptCmd} --output ${sentinelFile}`, { stdio: 'pipe', env });
      expect.fail('Expected script to exit with non-zero code');
    } catch (error: any) {
      expect(error.status).not.toBe(0);
      expect(fs.readFileSync(sentinelFile, 'utf-8')).toBe('{"sentinel": true, "hash": "abcd123"}');
    }
    
    expectNoNetwork();
  };

  it('rejects invalid or case-varied modes immediately with no metrics or output', () => {
    const invalidModes = ['LIVE', 'Live', 'invalid', 'FIXTURE', ''];
    for (const mode of invalidModes) {
      const scriptCmd = `node ${evalScript} --mode "${mode}"`;
      expectRejection(scriptCmd, getEnv());
    }
  }, 30000);

  it('fails closed in live mode for missing/invalid authorization', () => {
    const invalidAuths = ['', 'INVALID-AUTH', 'AUTH-UV-LIVE-lowercase'];
    for (const auth of invalidAuths) {
      const authArg = auth ? `--authorization-ref "${auth}"` : '';
      const scriptCmd = `node ${evalScript} --mode live ${authArg}`;
      expectRejection(scriptCmd, getEnv());
    }
  }, 30000);

  it('fails closed in live mode when any credential is missing', () => {
    const cases = [
      { trunk: '', key: 'key' },
      { trunk: 'sip:test', key: '' },
      { trunk: '', key: '' },
    ];
    for (const { trunk, key } of cases) {
      const scriptCmd = `node ${evalScript} --mode live --authorization-ref AUTH-UV-LIVE-20261002-001`;
      expectRejection(scriptCmd, getEnv({
        UNATTENDED_VOICE_LIVE_TRUNK_ENDPOINT: trunk,
        UNATTENDED_VOICE_LIVE_AUTH_KEY: key,
      }));
    }
  }, 30000);

  it('fails closed in live mode even when credentials look valid but production adapter is missing', () => {
    const scriptCmd = `node ${evalScript} --mode live --authorization-ref AUTH-UV-LIVE-20261002-001`;
    expectRejection(scriptCmd, getEnv({
      UNATTENDED_VOICE_LIVE_TRUNK_ENDPOINT: 'sip:production@example.com',
      UNATTENDED_VOICE_LIVE_AUTH_KEY: 'test_key',
    }));
  });

  it('succeeds in fixture mode with explicit fixture provenance, outputs results, and requires no credentials', () => {
    const env = getEnv({
      UNATTENDED_VOICE_LIVE_TRUNK_ENDPOINT: '',
      UNATTENDED_VOICE_LIVE_AUTH_KEY: '',
    });
    
    const outputString = execSync(`node ${evalScript} --mode fixture --output ${outputFile}`, {
      stdio: 'pipe',
      env
    }).toString();

    expect(outputString).toContain('[NOTICE] FIXTURE MODE EVALUATION COMPLETED:');
    expect(outputString).toContain('It does NOT claim production carrier PSTN voice quality or production carrier SLA');

    // Verify output file exists
    expect(fs.existsSync(outputFile)).toBe(true);
    
    const parsedOutput = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
    expect(parsedOutput).toBeDefined();
    
    // Assert the actual serialized mode equals fixture
    expect(parsedOutput.mode).toBe('fixture');
    
    expectNoNetwork();
  });
});
