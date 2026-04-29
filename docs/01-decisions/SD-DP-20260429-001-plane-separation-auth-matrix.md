# SD-DP-20260429-001 Plane-Separation Auth Matrix

## Decision Record

- `decision_id`: `SD-DP-20260429-001`
- `title`: `Plane-separated primary auth paths for control-plane and business-plane callers`
- `owner`: `Codex2 / OPX-ID-002`
- `date`: `2026-04-29`
- `status`: `accepted-for-execution`
- `affected_docs`:
  - `docs/03-runbooks/auth-plane-separation-matrix.md`
  - `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
  - `docs/03-runbooks/driver-app-native-dev-runbook.md`
  - `docs/README.md`
- `superseding_decision`:
  - internal control-plane callers keep Cloud IAP on the ingress boundary and use server-issued inner Bearer auth on the app boundary
  - tenant, partner, and driver callers stay on direct application-auth paths and are not default IAP targets
  - bootstrap headers and `x-drts-internal-key` are local/direct-path fallback tools, not the production trust model
- `scope`:
  - `apps/api/src/common/auth/*`
  - `apps/api/src/modules/auth/*`
  - control-plane proxy auth headers
  - operator / developer runbooks for auth posture
- `out_of_scope`:
  - changing L1 product semantics for tenant, partner, or driver roles
  - widening Cloud IAP to tenant, partner, driver, or webhook ingress
- `implementation_implications`:
  - the repo must keep one explicit primary auth path per realm
  - control-plane middleware must recognize the inner Bearer header used by the protected web proxies
  - contract exports should describe the realm-to-primary-path matrix so docs and tests do not drift
- `completion_bar`:
  - every realm has a documented primary auth path and expected Bearer header
  - tenant / partner / driver flows remain off the default IAP path
  - production docs stop describing free-form bootstrap headers as the normal trust boundary

## Realm Matrix

| Realm      | Plane          | Primary path                                                                   | Bearer header          | Default IAP target |
| ---------- | -------------- | ------------------------------------------------------------------------------ | ---------------------- | ------------------ |
| `system`   | control-plane  | service-issued Bearer token                                                    | `authorization`        | yes                |
| `platform` | control-plane  | control-plane proxy inner Bearer                                               | `x-drts-authorization` | yes                |
| `ops`      | control-plane  | control-plane proxy inner Bearer                                               | `x-drts-authorization` | yes                |
| `tenant`   | business-plane | `/api/auth/tenant/bootstrap-session` -> Bearer session                         | `authorization`        | no                 |
| `partner`  | business-plane | `/api/auth/partner/bootstrap-session` -> Bearer session                        | `authorization`        | no                 |
| `driver`   | business-plane | `/api/auth/driver/device/register` + `/refresh` -> device-bound Bearer session | `authorization`        | no                 |

## References

- `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`
- `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- `apps/api/src/common/auth/auth.matrix.ts`
