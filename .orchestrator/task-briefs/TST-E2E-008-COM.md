# Task Brief: TST-E2E-008-COM

Shell-E2E stub: TST-E2E-008 CTI / Recording / Filing

- Status: `backlog`
- Owner: `Gemini2`
- Reviewer: `Claude`
- Planning Ref: `docs/03-runbooks/post-governance-execution-wave-planning-20260517.md`
- Last Update: `2026-05-19T04:02:34Z`

## 中文說明

保留 task id `TST-E2E-008-COM` 作為既有 stub brief，但 shell target 已重編號為
`tests/e2e/E2E-010-cti-recording-filing.sh`，避免與
`TST-E2E-008-PBK-CUTOVER` 的 `E2E-008` 撞號。

Mock mode 仍預期覆蓋 callcenter module fakes：
phone booking → recording attach → recording export → filing package。

Live mode 在缺少 `CTI_WEBHOOK_URL` / `CTI_SIGNING_SECRET` 時，仍應印出：
`EXTERNAL-GATED — skipped (set CTI_* env vars to enable)` 並 exit `0`，
等待 `EXT-004` 真正啟用後再翻旗。

## Short Summary

Backlog stub retained, but the intended shell filename is now `E2E-010` rather
than `E2E-008`.

## Dependencies

- None

## Acceptance

- Mock mode exits `0` against local API.
- Live mode prints `EXTERNAL-GATED — skipped (set CTI_* env vars to enable)`
  and exits `0` when env vars are absent.
- `fbp-014a-e2e-matrix.md` row added with both gate reads
  (mock: `PASS repo-local`, live: `HOLD`).
- README documents how to flip live mode on once `EXT-004` activates.
- Shell target is recorded as `tests/e2e/E2E-010-cti-recording-filing.sh`.

## Artifacts

- `tests/e2e/E2E-010-cti-recording-filing.sh`
- `tests/e2e/run-e2e.sh`
- `tests/e2e/README.md`
- `docs/04-uat/fbp-014a-e2e-matrix.md`

## Guardrails

- Use `scripts/ai-status.sh` or `python3 scripts/ai_status.py` for state changes.
- Treat `current-work.md` as a human summary, not canonical machine context.
