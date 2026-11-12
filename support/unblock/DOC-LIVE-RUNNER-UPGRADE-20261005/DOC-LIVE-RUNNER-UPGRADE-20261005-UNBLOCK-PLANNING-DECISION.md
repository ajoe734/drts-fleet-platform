# DOC-LIVE-RUNNER-UPGRADE-20261005: planning-decision triage

Task: `DOC-LIVE-RUNNER-UPGRADE-20261005-UNBLOCK-PLANNING-DECISION`

Owner: Claude; reviewer: Claude2; auto-created by `chairman-blocked-task-triage`
with `helper_kind=planning_decision`, 2026-11-09T18:26:20Z.

## Disposition

**No product/contract decision is actually missing.** The dev auth policy this
blocker turns on was already decided and implemented on 2026-10-05. What
remains is the same external ops-evidence gate the prior
[`DOC-LIVE-RUNNER-UPGRADE-20261005-UNBLOCK-MANUAL-UNBLOCK`](DOC-LIVE-RUNNER-UPGRADE-20261005-UNBLOCK-MANUAL-UNBLOCK.md)
helper already documented, plus one narrower correction to that helper's
"platform IAP authority... unverified" framing. This is a routing/correction,
not a new scope cut, and it does not reopen the merged runner implementation
(candidate `992975969b8e32c402d9a776ee7b090c20724a82`, PR #2382, merge
`8c93658f4b38d1754c3f04b0872728a153f13f3d`).

## Why the chairman classified this as `planning_decision`

`blocked_task_triage_kind()` in
`tools/development-orchestrator/control_plane/usecases/chair_review_policy.py:23-57`
routes a blocked task to `planning_decision` when its `next` text contains
markers like `contract`, `canonical`, `product`, `scope decision`. The
parent's current `next` (last updated 2026-10-27T18:10:55Z) contains none of
those markers, so a fresh deterministic read now yields `manual_unblock`, not
`planning_decision`. The chairman is an LLM-driven triage step (see the
`unblock_kind` guidance at
`tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py:6989`),
so the classification likely came from the chairman's own reading of the
accumulated history (the MANUAL-UNBLOCK artifact explicitly says "Supervisor
must reconcile a focused owner repair and fresh review" for the IAP
boundary), not from this exact keyword function. That phrase is reasonable on
its face, but it undersells how much of the "boundary" is already decided.

## What is actually decided (no decision needed)

`docs/02-architecture/entry-iap-workforce-20261005.md`:

- Line 157: "Product decision, 2026-10-05: the platform-admin / ops-console
  workforce entry does not require a second verification factor in dev."
- Line 198 (env var table): `CONTROL_PLANE_IAP_ENABLED` — "Dev-only: declares
  a real IAP resource is in front of this deployment... unset (`false`) in
  dev; always effectively `true` in staging/production."

`.github/workflows/deploy-dev.yml`:

- Never sets `CONTROL_PLANE_IAP_ENABLED` for any dev service (confirmed via
  `grep -n CONTROL_PLANE_IAP_ENABLED .github/workflows/deploy-dev.yml` — zero
  hits), matching the documented dev default.
- Line 1421: `Deploy — platform-admin-web` sets
  `DRTS_DEV_MFA_WAIVED=true@DRTS_DEV_WORKFORCE_PRINCIPAL_ID=principal_platform_admin_default`.
- Line 1420: `--set-secrets "${{ steps.api_secrets.outputs.web }}"`, and line
  755 (`web_secret_args="JWT_SECRET=${secret_prefix}-jwt-secret:latest"`)
  confirms `JWT_SECRET` is mounted on platform-admin-web.

`packages/control-plane-auth/src/index.ts` (`issueControlPlaneRequestAuth`,
lines 655-810): with `iapEnabled=false` (dev default) and no
`x-goog-iap-jwt-assertion` header present, `requireVerifiedAssertion` is
`false` (line 724), so the function does **not** throw; it falls through to
`CONTROL_PLANE_DEFAULT_EMAILS.platform_admin` and, because
`devCanonicalPrincipalId` is supplied with a non-empty
`DRTS_DEV_WORKFORCE_PRINCIPAL_ID` and `hasJwtSecret` is true, assigns
`identity.actorId = "principal_platform_admin_default"` (lines 779-796). This
is the same dev-waiver path `apps/platform-admin-web/app/control-plane-proxy/[...path]/route.ts`'s
`applyUpstreamAuth()` already wires up for every proxied request (lines
116-150) — it is not missing code, and no architecture change is required to
make the *app layer* accept the runner's request in dev.

**Conclusion:** the control-plane-proxy's own "IAP" concept is intentionally
disabled in dev and already has a working fallback identity. There is no
undecided product/contract question here for the runner to resolve.

## The one thing MANUAL-UNBLOCK conflated, and the actual remaining check

The live test
(`tests/e2e/system-remediation/sr-live-doc-001/live-document-acceptance.test.ts:987-1001`)
calls `${platformAdminOriginStrict}/control-plane-proxy/platform-admin/placards`
with only `authorization: Bearer <platformIdToken>` (`getGoogleIdToken`,
`live-document-runner.ts`), no cookie, and its own comment calls this "the
supported ingress which enforces IAP authority." A 401/403 there throws
`IAP authority missing for runner on platform admin ingress`
(test line 1001). MANUAL-UNBLOCK read that throw and attributed it to the
app-layer IAP boundary analyzed above. But `platform-admin-web` is deployed
`--no-allow-unauthenticated` (private Cloud Run ingress — confirmed by the
parent's 2026-10-25 recheck note: anonymous GET returned 403 on bank-console,
tenant-console and platform-admin, while the public `live_api_origin`
returned 200). A 401/403 on this call is far more likely to be **Cloud Run's
own IAM invoker check rejecting the token's principal before the request
ever reaches the Next.js app**, not the app-layer IAP code analyzed above.

That principal is whatever `secrets.DEV_WIF_SERVICE_ACCOUNT` resolves to in
`live-document-acceptance.yml` (lines 141-185, one `google-github-actions/auth`
step per target audience). `deploy-dev.yml` uses the same
`DEV_WIF_SERVICE_ACCOUNT` to `gcloud run deploy` every dev service, which
needs a Cloud Run admin-level role at the project (or service) level; that
role class typically already carries invoke permission, so the SA may already
be authorized and the runner's "IAP authority missing" framing may be
overstated test-code pessimism, not a real gap. But this repo offers no
project-level IAM policy evidence either way, and this task is not authorized
to run `gcloud` IAM reads or dispatch the live workflow to find out.

**Remaining action, routed to the parent's existing `waiting_for=Codex`,
narrower than before:** an operator with GCP read access should run one
read-only check —
`gcloud run services get-iam-policy drts-dev-platform-admin-web --region us-central1 --project drts-dev-devcc-20260825`
(and the bank-console/tenant-console equivalents, since they are also
private) — to confirm whether the WIF-impersonated principal already holds
`roles/run.invoker` (or an admin-level role that implies it). If yes, the
"IAP authority missing" risk in MANUAL-UNBLOCK does not apply and can be
struck from the remaining-blocker list. If no, the fix is a single
`gcloud run services add-iam-policy-binding ... --role roles/run.invoker`
grant (the same additive pattern already used for passenger-app-web's IAP
service agent in `deploy-dev.yml:1681-1685`), not a product decision, a
runner rewrite, or a scope cut.

## Unchanged external blockers

Everything else in MANUAL-UNBLOCK stands: the five
`SR_LIVE_DOC_LIVE_SESSION_COOKIE*` secrets, the expired invoice/placard/report
fixtures, and verifying the four deployed origins' candidate SHA are still
genuinely missing and are ops-provisioning items for an authorized operator,
not product/contract decisions this task can resolve or route further.

## No canonical change made

This helper is a read-only correction to the diagnosis trail; it does not
touch the runner, the workflow, or the control-plane-auth package. No test
was run with a live listener on this VM; no `gcloud` command was executed
(read-only `grep`/`sed` against the checked-out workflow/doc/source files
only). Per guardrails, this task does not set `resolved_parent_status`,
`resolved_parent_waiting_for`, or `resolved_parent_next` itself — the dispatch
guard rejects a worker's cross-task `note`/`assign` on the parent (see
MANUAL-UNBLOCK's "Parent update and merge safety" section for the exact
mechanism); Supervisor must persist the parent-facing text below the same way
it did for the prior helper.

### Prepared parent `next` (for Supervisor to persist, status/waiting_for unchanged: `blocked` / `Codex`)

> No missing product/contract decision: dev's `CONTROL_PLANE_IAP_ENABLED=false`
> dev-waiver (`DRTS_DEV_MFA_WAIVED`/`DRTS_DEV_WORKFORCE_PRINCIPAL_ID`) is a
> decided, implemented policy (docs/02-architecture/entry-iap-workforce-20261005.md
> line 157/198); see
> support/unblock/DOC-LIVE-RUNNER-UPGRADE-20261005/DOC-LIVE-RUNNER-UPGRADE-20261005-UNBLOCK-PLANNING-DECISION.md.
> The live test's "IAP authority missing" throw on
> `/control-plane-proxy/platform-admin/placards` (401/403) is more likely
> Cloud Run's own private-ingress invoker check on `DEV_WIF_SERVICE_ACCOUNT`
> than the app-layer IAP code. One read-only check narrows this:
> `gcloud run services get-iam-policy drts-dev-platform-admin-web --region
> us-central1 --project drts-dev-devcc-20260825` (and bank-console/
> tenant-console); if the WIF principal already has invoke rights, strike
> this item; if not, grant `roles/run.invoker` the same way
> `deploy-dev.yml:1681` does for passenger-app-web's IAP service agent. All
> other MANUAL-UNBLOCK items (5 session cookies, expired invoice/placard/
> report fixtures, deployed-SHA verification) remain outstanding and
> unchanged. Keep parent blocked; do not resume implementation solely
> because this helper merges.
