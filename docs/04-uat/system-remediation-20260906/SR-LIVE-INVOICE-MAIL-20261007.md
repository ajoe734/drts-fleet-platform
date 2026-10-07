# SR-LIVE-INVOICE-MAIL-20261007

## C079 真帳單郵件／收件／受控下載獨立驗收

This document records the completion and verification of the live invoice mail E2E harness implementation, addressing previous review rejections and adhering to the section 0.7 finding/acceptance evidence table requirements.

### Finding / Acceptance Evidence Table

| Finding / 驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| **F1 [P1, executable harness / cleanup crash]** <br> Unused bindings and formatting | `live-invoice-mail.spec.ts`, `bootstrap.test.ts` | (Rejected 8989b75ae66b... & 66d6d4996919...): retained cleanup/empty-negative-ID repairs from previous candidate. Retained removal of unused opts/catch bindings. Fixed trailing whitespace at `bootstrap.test.ts:143`. | `git diff --check HEAD^ HEAD` exit0. `python3 -m unittest discover` exit0. | Local pnpm/eslint/tsc modules not found; verified only via Python tests and git diff. |
| **F2 [P1, authorized fixture]** <br> Identity/authorization check before POST | `live-invoice-mail.spec.ts`, `session-bootstrap.ts` | (Rejected 8989b75ae66b... & 66d6d4996919...): Allowlist semantics and fixture authority code retained. | `git rev-parse HEAD` -> Current SHA | Pending real external authorization blocker. |
| **F3 / F5 [P1, REPEATED browser role acceptance false positive]** <br> Missing DOM identity assertions and zero-mutation observation | `live-invoice-mail.spec.ts`, `gate-evidence.py` | (Rejected 66d6d4996919...): Spec tested only HTTP 200/404 via proxy; accepted missing role DOM assertions when `unimplementedLiveSurfaces` was empty. <br><br>→ (Gemini2 Repair): Added UI DOM identity and fallback rendering assertions for wrong-tenant scenario (verifying fallback instead of isolated invoice ID). Added read-only role disabled-send-button assertion and zero-mail POST mutation observation. Enforced UI role observations (`ui_isolated`, `ui_readonly`) in `gate-evidence.py`. | `python3 -m unittest discover` local pass. | Browser test execution belongs in authorized hosted runtime; no VM browser execution here. |
| **F4 / F6 [P2, REPEATED incomplete regression/evidence handoff]** <br> `bootstrap.test.ts` & `test_hosted_gate.py` completeness | `bootstrap.test.ts`, `test_hosted_gate.py`, `docs/.../SR-LIVE-INVOICE-MAIL-20261007.md` | (Rejected 66d6d4996919...): `bootstrap.test.ts` missed actual `evidence-bootstrap.json` inspections and lacked independent allowlist matrix. `test_hosted_gate.py` lacked regressions for unknown key, contradiction, partial cleanup. <br><br>→ (Gemini2 Repair): Added JSON serialization inspection and allowlist matrix to `bootstrap.test.ts`. Added missing `test_hosted_gate.py` regressions. Documented exact adjacent SHAs (66d6d499691941e9be528588aca28ca0779aa8eb, 8989b75ae66b86a6906450b42098919d1885fda8). | `python3 -m unittest discover` local pass (10/10). | Actual external execution missing. |
| **Acceptance:** `reviewed_invoice_live_harness_same_sha_ci` | (Same as above) | NOT satisfied (local checks are not hosted same-SHA CI). | CI runner | None |
| **Acceptance:** `authorized_invoice_runtime_recipient_and_fixture` | (Same as F2) | NOT satisfied (external fixture/allowlist/role authority pending). | Playwright E2E run | Pending Playwright execution |
| **Acceptance:** `genuine_invoice_mail_provider_inbox_and_download` | (Same as F3, F5) | NOT satisfied (no genuine hosted browser/mail/download evidence). | Playwright E2E run | Pending Playwright execution |
| **Acceptance:** `invoice_idempotency_failure_readback_and_cleanup` | (Same as F4, F6) | NOT satisfied (missing attempt/readback/failure proof). | Playwright E2E run | Pending Playwright execution |

