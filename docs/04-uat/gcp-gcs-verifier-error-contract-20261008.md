# GCS Verifier Error Contract - 2026-10-08

Task: `SR-GCP-GCS-VERIFIER-ERROR-CONTRACT-20261008`.
Current owner Codex; independent reviewer Codex2 (Supervisor reassignment).
This is the original task artifact, continued after two rejected candidates.
Source regression evidence is complete below; independent review, matching CI,
true merge and Operator-only hosted denial remain pending.

## Confirmed hosted failure and preserved history

Hosted run [37734571232](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37734571232)
used source `5f57e39bd2eb00ebdffba0a966ed772629a468d0` and workflow
definition `3ecd55d6cf18ec4bdc2d3c28c527d2b3d7555f1f`.
After scanner Tests 1–9/restoration and document-bucket Tests 1–10 advanced,
Test11's absent-object CAS returned the expected typed error:

```text
ERROR: Task 'gs://drts-dev-devcc-20260825-document-artifacts/verify-test-1791439032-188305df.txt-absent' failed: GcsPreconditionFailedError('')
```

The command used the runtime service account, the run-owned absent path and
`--if-generation-match=1791439036671118`. The old Test11 assertion accepted
literal `"412"` OR `"Precondition Failed"`; it did not accept the typed class.
Old Tests4/8 used `"Precondition"` OR `"412"`. No helper existed in that source.
Finally removed the two known document generations
`1791439049327420` and `1791439036671118`.
Test12/12b, remittance-bucket verification and genuine Docker lifecycle were
unexecuted/skipped, not passed. Original receipts remain under
`/home/lupin/workspace/drts-fleet-platform/.local/full-system-acceptance-20261008/log-read-hosted-retest/`.

Prior independent Codex reviews remain authoritative historical failures:

- `8ddeec4081b7fbaa53a41d03037bc55a5542e030`, reopened at 06:09:55Z:
  R1 incidental status/class/body matches; R2 unbounded HTTP request;
  R3 inaccurate/insufficient evidence.
- `de1da70ff4cd499aad978680d3c7a5eacd58daa2`, reopened at 06:24:15Z,
  generation `af75c75137264ec6be6eca68e532b00f`: R1 still parsed a
  class-looking filename as the cause; R2 still followed redirects; R3 still
  lacked reproducible evidence and made unsupported SDK claims.
- Supervisor independently corroborated the same R1 across both adjacent
  candidates. Its draft five-case probe, redirect probe and
  `repeated-r1-localization.json` remain in
  `/home/lupin/workspace/drts-fleet-platform/.local/full-system-acceptance-20261008/gcs-contract-operator-probe/`.
  These are defect localization, not passing acceptance.

Repeated R1 minimal reproduction, using the actual helper with a
`subprocess.CalledProcessError(1, ["gcloud"], stderr=fixture)`:

```text
ERROR: Task 'gs://bucket/file failed: GcsPreconditionFailedError.txt' failed: GcsNotFoundError('')
```

Expected false; both rejected candidates returned true. The lazy Task wildcard
stopped inside the quoted filename, and a class word boundary accepted
`.txt`. Production path is `main -> test_gcs Tests4/8/11 -> run ->
is_gcs_precondition_failed`. Repair boundary: consume the complete quoted
Task/resource wrapper, then match the entire supported class representation
or an anchored HTTP412 cause. Never search resource text or details for a class.

## Implementation and SDK assessment

`is_gcs_precondition_failed` now reads the first nonblank diagnostic line.
It accepts ERROR/EXCEPTION with the supported gcloud-storage wrapper,
single/double quoted Task resources (including escaped quotes), supported
typed exception representations, and explicit HTTP/code412 forms.
Unknown leading payloads/wrappers, malformed quotes, class-looking filenames,
auth/not-found/network errors and incidental numeric values fail closed.
All prior nine negative fixtures and typed/HTTP positives are retained.
Tests4/8/11 share this helper; an unexpected failure re-raises the original
CalledProcessError, preserving object, command, return code, stdout and stderr.
The logging sanitizer and scanner restoration code are unchanged.

Test12 uses `assert_gcs_unauthenticated_denial`: one GET to the official GCS
JSON object metadata URL for this run's existing test-owned object, with encoded
path components, no credentials, no ambient proxy/global auth handlers,
a 10-second timeout and a redirect handler that refuses every redirect.
Only actual HTTP401/403 at the exact requested URL counts as denial.
HTTP200/404/5xx/3xx and transport errors fail; success and HTTPError responses
are closed. Test12b still verifies authenticated generation and bytes, and
finally still removes exact known run-owned generations.

**Correction to the previous artifact's SDK claim:** empty-token-file preflight
rejection was not established. The installed SDK is `587.0.0`, snap revision
`/snap/google-cloud-cli/503`. Inspection of
`store.py::_LoadAccessTokenCredsFromFile` (925–936) and
`google_auth_credentials.py::AccessTokenCredentials` (343–356) shows an empty
file is passed to the credential class. A socket-blocked invocation of the
actual loader with `/dev/null`, followed by actual `before_request`, confirmed
`token == ""`, `valid == True`, and an empty Bearer header.
No SDK preflight exception occurred at that boundary.

This probes the installed credential path only, not the hosted SDK version,
the entire storage command, or a genuine external response. The comparison
probe also supplies a **synthetic** empty-token preflight exception at the
subprocess boundary: old Test12 rejects it, performs cleanup, and does not
count it as HTTP401/403. Neither result is live denial evidence.
Direct HTTP status checking removes dependency on version-sensitive CLI text
and gives the required endpoint/status/timeout contract without a cloud
mutation. Genuine denial remains for Operator after source integration.

SDK source SHA256:

| File under snap revision 503 | SHA256 |
| --- | --- |
| `lib/googlecloudsdk/core/credentials/store.py` | `c282350721554451173b7721c9b09cd8b2b70d396557dc09e79771f5a2607907` |
| `lib/googlecloudsdk/core/credentials/google_auth_credentials.py` | `10bfbd2989207638461fde3544fb7619d7430980999e8b47e00c37c45441b413` |
| `lib/third_party/google/auth/credentials.py` | `53a1ff1fdb2877110ea7e7182398d2b63a5151a6c5c3fa489dae2ca385d2ad9f` |
| `lib/third_party/google/auth/_credentials_base.py` | `2b1742672a05cafadf5a125b367b98929521c6cd1b99bc58bdc1fcfb1a79854b` |

## Finding and acceptance ledger

All local checks below use Python 3.12.3. Evidence directory (E):
`/home/lupin/workspace/drts-fleet-platform/.local/full-system-acceptance-20261008/gcs-contract-codex-repair/`.
The immutable verifier source is anchor
`f5c4ad2f6959ecdfa1818c9f4ed0700f254a475a`; final candidate retains that
verifier blob. Tested test-file SHA256:
`143981f9febb81c25ae885915439f41744f6f642f30fa7d3c4b074522df76e82`.
The final full candidate SHA/branch/PR are recorded by lifecycle handoff.

| Finding / acceptance | Source and regression | Old → repaired result | Commands / evidence / exit | Pending or limitation |
| --- | --- | --- | --- | --- |
| Confirmed Test11 typed-error rejection | `test_gcs`; `test_gcs_success` uses actual hosted error shape | 5f57 fails at Test11; both rejected intermediate candidates and repaired source reach Test12b with exact cleanup | C1, `E/compare.json`, exit0 | Subprocess and HTTPS transport are synthetic; no hosted rerun |
| R1 repeated quoted-resource cause defect | `is_gcs_precondition_failed`; `test_gcs_precondition_failed_classifier`, `test_gcs_cas_rejection_preserves_exception_and_cleanup` | Both adjacent rejected candidates return true and report production Test11 PASS for actual not-found; repair returns false, re-raises original exception, skips Test12 and cleans exact generations | C1/C3, compare and verifier logs, exit0 | Unknown formats deliberately fail closed |
| R1 original fixtures and exception contract | Tests4/8/11, `run`; class/path/body/warning/status-prefix/secret-shaped negatives and typed/HTTP positives | All prior cases retained; new regression covers all three CAS sites, exact exception identity/properties and cleanup; logging diagnostic tests retained | C3, 62 PASS, exit0 | External subprocess responses modeled, no classification/control-flow mock |
| R2 official-endpoint denial boundary | `assert_gcs_unauthenticated_denial`, `_RejectGcsRedirects`; HTTP/redirect/transport/recovery tests | Both intermediate candidates follow official302→foreign403 and pass; repair rejects before any second request. 401/403 pass; 200/404/500/503, 301/302/303/307/308 and transport/timeout fail with closed responses and exact cleanup. Recovery generation/bytes corruption fails | C1/C3; compare plus verifier log, exit0 | Real urllib opener/redirect/HTTPErrorProcessor; only HTTPS transport fake. No actual GCS denial |
| R3 inaccurate evidence and SDK preflight claim | This retained artifact; installed SDK loader and before_request | Corrected old assertion, removed obsolete quote-stripping/phrase-search descriptions, replaced branch-only identity and nonexistent-old-helper claim, recorded source hashes and actual SDK behavior | C2, `E/sdk-probe.json`, exit0 | SDK probe is not full storage cp or hosted SDK |
| `gcs_verifier_expected_error_and_negative_control_regression` | Above regression cases plus provider/readiness/activation suites | Local evidence ready for independent review: C3 62 PASS; C4 17 PASS; C5 13 PASS / 3 SKIP | C1–C6 all exit0; E logs | Source acceptance not self-approved; skipped real-container tests are not passes |
| `gcs_verifier_exact_sha_review_ci_merge` | New candidate must receive Codex2 review, matching CI and true merge/source blob comparison | Pending lifecycle; no approval or merge claimed | Final SHA/PR supplied through handoff | Existing Gemini2 PR2438 is a rejected predecessor, not this candidate |
| Parent GCS/engine/C125/final16of16 gates | Original activation task and hosted receipts | Unchanged, outstanding | Original task machine truth | Operator-only live retest after exact source integration; no waiver or worker dispatch |

Verifier source SHA256 comparison:

| Source commit | SHA256 |
| --- | --- |
| `5f57e39bd2eb00ebdffba0a966ed772629a468d0` | `e23136e5f3200edbed7224f353bdbf03f7e8265141949d777ee2fd9e63135d48` |
| `8ddeec4081b7fbaa53a41d03037bc55a5542e030` | `23bc13ac9fe6bc7b9489508a2d91702d837726e97da7d7d2ddafc61fd575dda6` |
| `de1da70ff4cd499aad978680d3c7a5eacd58daa2` | `dbc85782943ee9dd7a2ec1bc21a78253574a5ea4de80a9df2474c8146d066c71` |
| `f5c4ad2f6959ecdfa1818c9f4ed0700f254a475a` (repair) | `287c7116e22387eaca3aaae4045c312b4040fd0f987fbc71b5b33eec7cb556fd` |

## Reproduction commands and limits

Run from the task checkout. C1 loads each old source with `git show` into an
in-memory module and calls its actual `test_gcs`; no active worktree reset.
It asserts observed old/new differences, exact two-generation cleanup and
request hosts, including real stdlib redirect handling below the HTTP boundary.
The original 5f57 source has no HTTP Test12 path; its redirect scenario field is
not redirect evidence. Synthetic preflight injection is used only by old5f57;
new sources use HTTP and never invoke that subprocess control.

```bash
E=/home/lupin/workspace/drts-fleet-platform/.local/full-system-acceptance-20261008/gcs-contract-codex-repair

# C1: actual production old/new comparison, network calls 0
PYTHONDONTWRITEBYTECODE=1 python3 "$E/compare.py"

# C2: actual installed SDK credential boundary, network calls 0
CLOUDSDK_CONFIG="$PWD/.local/gcs-error-contract/sdk-config" PYTHONDONTWRITEBYTECODE=1 python3 "$E/sdk-probe.py"

# C3: all verifier (23) and provider (39) tests
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tools.ci.test_verify_dev_artifact_backends tools.ci.test_dev_artifact_providers -b

# C4: related cold-readiness suite
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/unit/gcp-scanner-cold-readiness-20261007 -p 'test_*.py' -b

# C5: activation suite; explicitly disable hosted/container-only cases on this VM
env -u CLAMD_IMAGE -u GATEWAY_IMAGE PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p 'test_*.py' -b

# C6: affected source/doc checks
git diff --check
pnpm exec prettier --check docs/04-uat/gcp-gcs-verifier-error-contract-20261008.md
```

Tests call production functions. Mock scope is subprocess execution and HTTPS
transport, except the explicit nonofficial-response defense test which supplies
an HTTPError at OpenerDirector.open to verify URL rejection and response closure.
No product server, browser server, Docker infrastructure, cloud workflow,
principal/key/IAM grant, provider variable or deployment was started/changed.
Local unittest success is source regression evidence only.
