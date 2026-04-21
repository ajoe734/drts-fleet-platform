# Gap Phase 2 Planning — 2026-04-17

**目的：** 對 Sprint 1 完成後的剩餘落差進行完整規劃，涵蓋：

- Sprint 2（即時功能、GPS、proof bundle、SSE、forwarder）
- Sprint 3（Auth IAP/OIDC、Feature Gate、Settlement index、SOS queue）
- tenant-commute-hub（Lovable repo）前端側收尾
- Platform Admin Switchboard 驗查

**Workspace：** `docs/02-architecture/consensus/gap-phase2-planning-20260417/`

**流程：**

1. Claude 撰寫 starter-draft（全功能盤點 + 依賴圖）
2. Codex → R1（contracts / schema / 依賴正確性）
3. Qwen → R2（API 實作可行性、前端串接設計）
4. Gemini → R3（infra / Cloud Run / DB migration / auth 可行性）
5. Copilot → R4（風險、遺漏、UAT 影響）
6. Claude 仲裁 → consensus-packet
7. 人工 accept → supervisor 切回 execution mode

**檔案：**

- `starter-draft.md`
- `review-round-1.md` (Codex)
- `review-round-2.md` (Qwen)
- `review-round-3.md` (Gemini)
- `review-round-4.md` (Copilot)
- `consensus-packet.md`
- `baton-log.md`
