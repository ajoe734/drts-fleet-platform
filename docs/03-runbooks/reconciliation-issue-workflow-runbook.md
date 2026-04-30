# Reconciliation Issue Workflow Runbook

## Scope

Use this runbook when finance or ops needs to triage a settlement mismatch that
requires explicit assignment, retained evidence comments, and a formal
resolve/reopen trail.

Supported issue families:

- `forwarder_status_mismatch`
- `partner_sponsor_mismatch`

## Workflow

1. Open a reconciliation issue from the Finance Console.
2. Capture the canonical summary, channel, related order identifiers, and any
   initial artifact ids.
3. Assign the issue to the responsible finance owner.
4. Add comments as new evidence arrives. Comments are retained on the issue
   record and should reference the artifact ids used during review.
5. Resolve the issue with a resolution code plus a short closure summary.
6. Reopen the issue if downstream evidence invalidates the previous closeout.

## Routing

- `forwarder_status_mismatch`
  Route to forwarder or finance shadow-ledger owners. Use linked
  reconciliation-job ids when the source issue originated from a sync-failed
  forwarded mirror.
- `partner_sponsor_mismatch`
  Route to partner finance owners. Capture partner id, partner program id, and
  sponsor reference whenever available.

## Evidence Discipline

- Keep artifact ids on the issue record whenever evidence is added or a case is
  resolved.
- Do not delete prior comments when reopening a case.
- Resolution comments must explain whether the mismatch was corrected,
  externally confirmed, written off, or closed without action.
