# COM-LIVE-001 — CTI / Recording / Filing Live Activation Evidence Pack

**Task:** `COM-LIVE-001`  
**Owner:** `Codex2`  
**Reviewer:** `Claude`  
**Collected:** `2026-05-19 (UTC)`  
**Status:** `partial evidence only — WF-COM-001 remains HOLD`

---

## 1. Executive Summary

This packet records the current live-evidence posture for the CTI callback,
recording export, filing-package, and sensitive-download gate tracked by
`EXT-004-BLK-001` through `EXT-004-BLK-008`.

Current result on `2026-05-19`:

- `WF-COM-001` still reads `HOLD` in the workflow release matrix.
- `EXT-004` still defines the binding blocker packet for CTI callback, filing
  activation, recording export, retention/access sign-off, and end-to-end proof.
- A fresh live probe did not reach any CTI callback or filing endpoint:
  - `gcloud auth list` showed an active account:
    `bobo.du@cctech-support.com`.
  - `gcloud auth print-identity-token` failed non-interactively with
    reauthentication required.
  - The older staging host
    `https://drts-api-kdhu6wzufa-uc.a.run.app` returned `404` for `/`,
    `/health`, and `/api/health`.
  - The newer documented host `api-staging.drts.internal` returned `NXDOMAIN`
    and could not be resolved from this machine.
- No signed callback sample, redacted callback log, recording export manifest,
  filing package manifest, or signed-download audit evidence was collected in
  this session.

Conclusion:

- This task can add a dated partial evidence snapshot and the shell renumber
  bookkeeping needed for the Phase 1 v2 E2E sequence.
- `EXT-004-BLK-001` through `EXT-004-BLK-008` remain open.
- `WF-COM-001` must stay `HOLD`.

---

## 2. Canonical Baseline

### 2.1 Release-gate truth

`docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` keeps
`WF-COM-001` at `HOLD` and limits the remaining claim to CTI callback behavior,
recording export, and month-end filing activation.

### 2.2 External gate truth

`support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md` remains the
binding blocker packet for:

- `EXT-004-BLK-001` CTI provider or approved stub environment
- `EXT-004-BLK-002` recording callback contract
- `EXT-004-BLK-003` CTI webhook security controls
- `EXT-004-BLK-004` staging callback run evidence
- `EXT-004-BLK-005` filing scheduler activation
- `EXT-004-BLK-006` recording index export activation
- `EXT-004-BLK-007` sensitive evidence retention and access sign-off
- `EXT-004-BLK-008` end-to-end live or staging run

### 2.3 Repo/static implementation anchors

The repo still contains the implementation seams named by `EXT-004`:

- `apps/api/src/modules/callcenter/callcenter.controller.ts`
  `POST /api/callcenter/sessions/:callId/recording-callback`
- `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`
  `POST /api/filing-packages/generate`
- `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`
  `dispatch_recording_index` reporting path
- `docs/03-runbooks/evidence-retention-and-evidentiary-access-policy.md`
  for retention, signed-download, and legal-hold interpretation

These anchors are repo/static only. They do not prove live CTI callback
delivery, real staging filing runs, or signed artifact issuance in a reachable
environment.

---

## 3. Fresh Live Probe On 2026-05-19

### 3.1 Probe window

- `2026-05-19T04:02:34Z`

### 3.2 Commands executed

```bash
date -u +'%Y-%m-%dT%H:%M:%SZ'
gcloud auth list --filter=status:ACTIVE --format='value(account)'
gcloud auth print-identity-token
curl -I -sS https://drts-api-kdhu6wzufa-uc.a.run.app/
curl -I -sS https://drts-api-kdhu6wzufa-uc.a.run.app/health
curl -I -sS https://drts-api-kdhu6wzufa-uc.a.run.app/api/health
getent hosts api-staging.drts.internal
nslookup api-staging.drts.internal
curl -I -sS https://api-staging.drts.internal/
curl -I -sS https://api-staging.drts.internal/api/health
```

### 3.3 Observed results

1. Active `gcloud` account exists:

```text
bobo.du@cctech-support.com
```

2. Identity-token mint failed:

```text
ERROR: (gcloud.auth.print-identity-token) There was a problem refreshing your current auth tokens: Reauthentication failed. cannot prompt during non-interactive execution.
```

3. The older `run.app` staging host returned `404` for all three probes:

- `https://drts-api-kdhu6wzufa-uc.a.run.app/`
- `https://drts-api-kdhu6wzufa-uc.a.run.app/health`
- `https://drts-api-kdhu6wzufa-uc.a.run.app/api/health`

4. The newer internal host could not be resolved:

```text
** server can't find api-staging.drts.internal: NXDOMAIN
curl: (6) Could not resolve host: api-staging.drts.internal
```

### 3.4 Interpretation

This session did not reach the point where a CTI callback payload, a phone
booking with `recording_pending`, a filing-package run, or a signed-download
artifact could be verified.

The environment boundary failed first:

- no usable non-interactive identity token
- no reachable documented staging hostname
- no legacy host serving an API health endpoint

That means `EXT-004-BLK-004` through `EXT-004-BLK-008` could not be exercised
live in this session, and `EXT-004-BLK-001` through `EXT-004-BLK-003` remain
unproven because no live CTI endpoint or callback sample was reachable.

---

## 4. Blocker Snapshot

| Blocker ID | 2026-05-19 status | Evidence anchor in this packet | Gate read | Responsible owner |
| --- | --- | --- | --- | --- |
| `EXT-004-BLK-001` | open | §2.2 `EXT-004` gate packet; §3.3 staging host probes | `EXTERNAL-GATED` | CTI provider / ops telephony PM |
| `EXT-004-BLK-002` | open | §2.2 `EXT-004` gate packet; no callback sample collected in §3 | `EXTERNAL-GATED` | CTI provider technical owner |
| `EXT-004-BLK-003` | open | §2.2 `EXT-004` gate packet; no signature/replay proof collected in §3 | `EXTERNAL-GATED` | Security + CTI provider |
| `EXT-004-BLK-004` | open | §3.4 environment probe failed before callback delivery | `HOLD` | QA + ops dispatch |
| `EXT-004-BLK-005` | open | §2.3 repo/static filing anchor only; no staging run in §3 | `HOLD` | Compliance operations |
| `EXT-004-BLK-006` | open | §2.3 repo/static export anchor only; no export artifact in §3 | `HOLD` | Reporting / compliance owner |
| `EXT-004-BLK-007` | open | §2.3 retention-policy anchor only; no live signed-download audit evidence | `HOLD` | Security / compliance / legal |
| `EXT-004-BLK-008` | open | No end-to-end packet beyond this partial probe | `HOLD` | QA lead + ops + compliance |

---

## 5. E2E Shell Renumber Note

This task also frees `E2E-008` for the partner-booking cutover slice.

Task-brief alignment recorded here:

- legacy shell target in the old stub brief:
  `tests/e2e/E2E-008-cti-recording-filing.sh`
- renumbered target for the CTI/compliance shell stub:
  `tests/e2e/E2E-010-cti-recording-filing.sh`

This renumber is bookkeeping only in the current session. No new shell script
was created or executed here, and the canonical workflow gate remains tied to
manual `E2E-003` plus `EXT-004` live activation evidence until a dedicated
automation task picks up the `E2E-010` scaffold.

---

## 6. Recommended Gate Read

Recommended wording:

- "`WF-COM-001` remains `HOLD`."
- "`EXT-004-BLK-001` through `EXT-004-BLK-008` remain open."
- "A fresh `2026-05-19` live probe did not reach CTI callback or filing-path
  verification because identity-token mint required reauthentication, the
  older `run.app` host returned `404`, and
  `api-staging.drts.internal` was unresolved from this machine."

Not allowed:

- "Phone booking to compliance export passed."
- "Recording callback is live-verified."
- "Filing package activation is proven."
- "`WF-COM-001` is `PASS`" without a reachable CTI callback sample, filing
  manifest, recording export artifact, and signed-download audit evidence.

---

## 7. Machine-Truth Note

Canonical machine truth currently records `COM-LIVE-001` as:

- owner `Codex2`
- reviewer `Claude`
- status `review_approved`

This packet records the partial evidence snapshot that reached review approval.
Owner closeout may mark the task `done`, but it still must not upgrade the
workflow gate beyond `HOLD`.
