# SR-GCP-SCANNER-EICAR-CANARY-20261007

Owner: Codex. Independent reviewer: Codex2. Source-only repair; hosted scanner
acceptance remains with `SR-GCP-ARTIFACT-ACTIVATION-20261004`.

## Finding and correction

The task spec records hosted run
[37661087029](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37661087029)
against `d5df98767bc36eea04e5b4742bc0e26275335599`: the engine became ready and
Test 1 passed status/hash/size/clean checks. Test 2 correctly failed its required
`infected` assertion because the receipt said `clean`. Later scanner tests,
genuine lifecycle and GCS/cleanup acceptance did not run.

The verifier's old `EICAR` was a 346-byte PDF followed by the test string and LF:
415 bytes total, with the signature at offset 346. This was not the
[official EICAR format](https://www.eicar.org/download-anti-malware-testfile/),
which starts with the standard 68 bytes (optional permitted trailing whitespace
may bring the total to at most 128 bytes). The previous hosted failure alone
does not establish whether canonical EICAR detection works.

`operations/verification/verify-dev-artifact-backends.py::EICAR` now contains
exactly the standalone 68 bytes, without the PDF prefix or LF:

- SHA-256: `275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f`
- MD5: `44d88612fea8a8f36de82e1278abb02f`

The production change is restricted to that fixture and its explanatory comment.
`test_scanner.scan` still posts the raw bytes to `/scan` with `application/pdf`
metadata, bearer authentication and `X-Content-SHA256` of the actual body.
`operations/artifact-scanner/gateway/handler.ts::createRequestHandler` checks the
allowed media metadata, bounds and body hash, then passes the exact body to
`clamd-protocol.ts::encodeInstream`; it does not parse PDF structure. This is an
antivirus transport canary, not proof of a valid invoice/remittance PDF upload.
The MIME allowlist and scanner/engine configuration remain unchanged.

All `test_scanner` callers of `EICAR` use the corrected bytes, including the
post-recovery and post-restoration infected gates and the transport-fault probe.
The genuine-Clamd harness already uses standalone EICAR; it is unchanged.
Strict status, hash, size and infected assertions are unchanged, as are the
clean, mismatch, oversized, engine-limit, readiness, fault, generation and
cleanup paths.

## Evidence and acceptance matrix

Implementation/test content is committed at
`c8d06ed4f6dbbd54894b79048b68ca13ad05ef6a`; the final closeout adds only this
evidence document. The full final candidate SHA, pushed branch and PR are
recorded by owner `handoff`, with reviewer/CI/merge bound to that candidate.
No prior candidate review or rework exists for this child task.

| Finding / acceptance | Source and repair | Old → repaired result | Command / exit / evidence | Pending or limitations |
| --- | --- | --- | --- | --- |
| Noncanonical 415-byte fixture | Verifier `EICAR`; new `EicarCanaryTest` loads actual module and calls actual `test_scanner` | Base `19f351a86592d38f4edcb7c01de58145817e19f9` and historical `d5df98767bc36eea04e5b4742bc0e26275335599`: 2 failures (`415 != 68`), 3 passes → corrected source: 5 passes | New regression command below; old exit 1, new exit 0; `before.log`, `old-d5.log`, `after.log` | HTTP is mocked; no real detection claimed |
| `canonical_eicar_actual_request_and_strict_verdict_regression` | Actual second urllib POST, body, headers and unchanged `assert_receipt` | Canonical request/digests and infected receipt pass; clean/missing/unsupported verdicts, wrong hash/size and 415/503/502 fail at request 2 | 5 tests, exit 0; `after.log`. Mocked success also reaches unchanged hash/oversize/engine-limit checks | Source regression satisfied; hosted-only branch remains explicitly UNEXECUTED and helper returns False |
| Existing bounds and helper regression | Existing 51 helper, 17 readiness and 4 foreground logging tests unchanged | 72 tests pass | Commands below, exit 0; `helpers.log`, `readiness.log`, `logging.log` | No engine, server, DB, browser or Docker starts |
| Existing CI discovery | `.github/workflows/ci.yml` already discovers `test_*.py` in this directory | Coverage check discovers all 89 tracked Python test files | `python3 tools/ci/check_test_coverage.py`, exit 0; `coverage.log` | CI configuration is unchanged |
| `canonical_eicar_exact_sha_review_ci_and_merge` | Final owner candidate / independent Codex2 review / GitHub bus | Pending at owner handoff | Machine-truth candidate lifecycle records final SHA, PR, same-SHA CI and merge separately | Not satisfied by source tests or anchor push; review, CI and merge still required |

Machine-local logs are under `.local/eicar-canary/` in the assigned worker
worktree. Tests ran with Python 3.12.3. Commands (all repaired checks exit 0):

```bash
python3 -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p test_eicar_canary.py -v
python3 -m unittest tools.ci.test_dev_artifact_providers tools.ci.test_verify_dev_artifact_backends
python3 -m unittest discover -s tests/unit/gcp-scanner-cold-readiness-20261007 -p 'test_*.py'
python3 -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p test_clamd_foreground_logging.py -v
python3 tools/ci/check_test_coverage.py
```

To reproduce the historical failure without resetting an active worktree, load
the same regression module and substitute only the actual old verifier module:

```bash
mkdir -p .local/eicar-canary
git show d5df98767bc36eea04e5b4742bc0e26275335599:operations/verification/verify-dev-artifact-backends.py > .local/eicar-canary/old-verifier.py
python3 - <<'PY'
import importlib.util
import unittest

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

tests = load('eicar_tests', 'tests/unit/gcp-artifact-activation-20261004/test_eicar_canary.py')
tests.verify = load('old_verifier', '.local/eicar-canary/old-verifier.py')
result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(tests))
raise SystemExit(not result.wasSuccessful())
PY
```

The historical replay exits 1 with the two fixture/request failures. The test
mocks credentials and `urllib.request.urlopen` only: actual request construction,
initial clean-readiness handling, response decoding, assertions and subsequent
negative checks execute in the verifier. It does not emulate malware detection.

## Remaining parent gates

A genuine hosted canonical infected result is still required, together with
hash/size/limits/readiness/fault/version-transition evidence and both private
GCS generation/bytes/idempotency/cleanup checks. Provider activation is pending.
This task does not change backend-ready variables, IAM, workflow gates or
deployment. The logging-read permission gap is prospective: the historical run
stopped before reaching it. No permission grant or live retest is part of this
source repair.
