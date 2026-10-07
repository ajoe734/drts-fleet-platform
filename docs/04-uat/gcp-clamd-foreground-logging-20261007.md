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
(line 351), and uses `mprintf` for foreground output (lines 438–452).
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
| Symlink file logger aborts startup | `clamd.conf` removes two directives; upstream `logg` / logger initialization above | Before edit: 4 tests, 1 expected config failure, 3 pass including real ELOOP; corrected run pending | `python3 -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p test_clamd_foreground_logging.py -v`; old exit 1 at base `eb0d1ed9954e3befa30bdf99b9924bfe17f46e54` | OS/config regression cannot prove engine startup or emitted foreground messages |
| `foreground_logging_actual_config_and_bounds_regression` | Actual config plus new test, explicit complete directive contract against reviewed source9c | Before-edit bounds already pass; corrected regression and helper checks pending | Required: 4 new tests, unchanged 51 helper tests, unchanged 17 cold-readiness tests, discovery coverage, whitespace and trailers | No local service, Docker, browser or genuine-engine execution permitted |
| `foreground_logging_exact_sha_review_ci_and_merge` | Candidate identity in lifecycle handoff; same-SHA independent Codex2 review | Pending | Exact pushed candidate, PR head, CI and merge will be recorded through the existing lifecycle | Owner does not self-approve or mark done |

The parent still owns an immutable SDK-patched hosted rebuild/retest after
merge: genuine loaded engine, clean/EICAR/hash/size/limits, storage generation,
bytes/idempotency/cleanup, transport/version transition and logging-read IAM
limits. This source repair supplies no backend-ready variables, deployment,
IAM/WIF expansion, or live acceptance evidence.
