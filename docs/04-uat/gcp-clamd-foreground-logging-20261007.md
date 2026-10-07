# Clamd foreground logging repair

Task: `SR-GCP-CLAMD-FOREGROUND-LOGGING-20261007`; owner Codex, independent
reviewer Codex2. Source-only child of `SR-GCP-ARTIFACT-ACTIVATION-20261004`.

## Observed failure and source boundary

[Hosted run 37656486086](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37656486086)
used reviewed source `9c87585483ce35665fd52887091d0f21872e6a0f` after merge
`eb0d1ed9954e3befa30bdf99b9924bfe17f46e54` (PR #2419). CPU throttling was
disabled on private revision `drts-dev-scanner-00002-ch2`, but after a genuine
daily database update, clamd failed at `2026-10-07T17:09:35Z`: opening
`/dev/stdout` reported a symbolic link loop, then logger initialization
failed. The failure repeated at `17:11:13Z`. Hosted readiness exhausted
30 readiness503 responses; the genuine lifecycle job was skipped.

Machine-specific original evidence is under
`/home/lupin/workspace/drts-fleet-platform/.local/full-system-completion-20261007/round4/`:
`scanner-logs.json`, `scanner-runtime.json`, `hosted-terminal.json` and the
original task specification. This child does not claim a new hosted result.

Actual call path: `operations/artifact-scanner/Dockerfile.clamd` copies
`clamd.conf` to `/etc/clamav/clamd.conf`; `clamd-entrypoint.sh` launches
`clamd --config-file=/etc/clamav/clamd.conf &` with inherited output.
[ClamAV 1.4.6 common/output.c](https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/common/output.c)
`logg` opens configured files with `O_WRONLY | O_CREAT | O_APPEND | O_NOFOLLOW`
(line 348), and uses `mprintf` for foreground output (lines 438–452).
[clamd/clamd.c](https://github.com/Cisco-Talos/clamav/blob/clamav-1.4.6/clamd/clamd.c)
initializes the file logger only when `LogFile` is enabled, otherwise sets
`logg_file = NULL` (lines 250–266); `Foreground` controls daemonization
separately (lines 270–277). Read-only upstream copies in the evidence
directory above were inspected for this review.

The fix removes only active `LogFile /dev/stdout` and `LogFileUnlock yes`.
It preserves `Foreground yes`, `LogTime yes`, `LogVerbose no`, every other
active directive, the engine/image, entrypoint, readiness checks and all
deployment/IAM limits. It does not change `O_NOFOLLOW`, add log storage,
redirect to another descriptor path, or suppress fatal errors.

## Regression and evidence ledger

`test_clamd_foreground_logging.py` reads the actual production config.
Its exact ordered directive contract preserves duplicates, private loopback
TCP3310, queue10/threads4, all 10MiB size limits, recursion5/files1000,
timeouts60/5/5000, fail-closed `AlertExceedsMax yes`, `ExitOnOOM yes`,
`User clamav`, database path and `SelfCheck 1800`. Unknown extra directives
(including log suppression or additional listeners) fail that contract.
The syscall test uses a temporary regular-file positive control and a
test-owned symlink: the real `os.open` flags reject the symlink with `ELOOP`.
No clamd function is mocked or executed; this is OS/config evidence only.

| Finding / acceptance | Source and fix | Old → corrected result | Command / version / evidence | Remaining limits |
| --- | --- | --- | --- | --- |
| Symlink file logger aborts startup | `clamd.conf` removes two directives; upstream `logg` / logger initialization above | Before edit: 4 tests, 1 expected config failure, 3 pass including real ELOOP; corrected: 4/4 pass | New-regression command below: old exit 1 at base `eb0d1ed9954e3befa30bdf99b9924bfe17f46e54`, corrected exit 0 at source `c274102a99fe76f23cd981a834300f741c2f9bd2`. Separate extraction of old9c gives the same single failure; logs below | OS/config regression cannot prove engine startup or emitted foreground messages |
| `foreground_logging_actual_config_and_bounds_regression` | Actual config plus new test, explicit complete directive contract against reviewed source9c | Exact before/after comparison preserves all 22 remaining active directives; 4 new tests, unchanged 51 helpers and unchanged 17 cold-readiness tests pass | Commands below, all exit 0; coverage checker: all 88 tracked Python test files yield CI tests. Source/test content at `c274102a99fe76f23cd981a834300f741c2f9bd2`, final commit changes this evidence document only | No local service, Docker, browser or genuine-engine execution; hosted CI still pending |
| `foreground_logging_exact_sha_review_ci_and_merge` | Candidate identity in lifecycle handoff; same-SHA independent Codex2 review | Pending | Exact pushed candidate, PR head, CI and merge will be recorded through the existing lifecycle | Owner does not self-approve or mark done |

Local checks ran with Python 3.12.3. All commands completed before handoff:

```sh
python3 -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p test_clamd_foreground_logging.py -v
python3 -m unittest tools.ci.test_dev_artifact_providers tools.ci.test_verify_dev_artifact_backends
python3 -m unittest discover -s tests/unit/gcp-scanner-cold-readiness-20261007 -p 'test_*.py'
python3 tools/ci/check_test_coverage.py
python3 tools/ci/git/check_commit_trailers.py --base eb0d1ed9954e3befa30bdf99b9924bfe17f46e54 --head HEAD
git diff --check eb0d1ed9954e3befa30bdf99b9924bfe17f46e54 HEAD
```

Logs under the assigned worker worktree's `.local/clamd-foreground-logging/`:
`old9c-regression.log`, `before-after.json`, `corrected-regression.log`,
`helpers.log`, `cold-readiness.log`, `coverage.log`. Helpers mock external
gcloud/HTTP boundaries; printed fake hosted operations do not run GCP calls.
Coverage checker only discovers/imports tests; it does not run genuine
ClamAV lifecycle tests. Those tests and hosted acceptance remain unexecuted.

The old9c comparison used `git show
9c87585483ce35665fd52887091d0f21872e6a0f:operations/artifact-scanner/clamd.conf`
into a temporary file, imported the new test module, temporarily assigned
its `CONFIG` to that file, and ran its four tests. The sole expected failure
was `test_actual_config_has_no_file_logger_or_unlock`; no errors or skips.
Comparing parsed old/new directives after excluding exactly `LogFile` and
`LogFileUnlock` from the old list confirmed equality of all 22 directives.
The active worktree was never reset or replaced. This isolates the old
production config while keeping the regression identical across versions.

The parent still owns an immutable SDK-patched hosted rebuild/retest after
merge: genuine loaded engine, clean/EICAR/hash/size/limits, storage generation,
bytes/idempotency/cleanup, transport/version transition and logging-read IAM
limits. This source repair supplies no backend-ready variables, deployment,
IAM/WIF expansion, or live acceptance evidence.
