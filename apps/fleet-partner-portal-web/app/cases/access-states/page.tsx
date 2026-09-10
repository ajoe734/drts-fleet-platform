import Link from "next/link";
import {
  CanvasCard,
  CanvasPageHeader,
  CanvasEmptyState,
  CanvasBtn,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";

export const dynamic = "force-dynamic";

export default function FleetCaseAccessStatesPage() {
  const theme = buildFleetTheme();

  return (
    <>
      <div
        style={{
          padding: "16px 24px 0",
          fontSize: 12,
          color: theme.textMuted,
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <Link
          href="/cases"
          style={{ color: theme.accent, textDecoration: "none" }}
        >
          {"事故 / 申訴"}
        </Link>
        <span style={{ color: theme.textDim }}>/</span>
        <span style={{ color: theme.text }}>{"讀取狀態"}</span>
      </div>

      <CanvasPageHeader
        theme={theme}
        title={"附件 / 歷程 · 讀取狀態"}
        subtitle="R12 · GET 失敗與空狀態，非指令錯誤代碼 — 見 case-errors 頁的寫入/指令錯誤"
      />

      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Link
            href="/cases"
            style={{
              color: theme.accent,
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              textDecoration: "none",
            }}
          >
            {"← 返回事故 / 申訴列表"}
          </Link>
          <span style={{ color: theme.textDim }}>|</span>
          <Link
            href="/cases/errors"
            style={{
              color: theme.textMuted,
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            {"查看案件錯誤指引"}
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 16,
          }}
        >
          <CanvasCard theme={theme} title={"附件 · 無權限"}>
            <CanvasEmptyState
              theme={theme}
              tone="danger"
              title={"無權限授權回讀"}
              body="您的角色無權授權回讀此附件，請聯繫 Ops 確認存取範圍。"
            />
          </CanvasCard>

          <CanvasCard theme={theme} title={"附件 · 不存在"}>
            <CanvasEmptyState
              theme={theme}
              tone="neutral"
              title={"附件不存在"}
              body="附件不存在或已被移除，請確認案件歷程中的原始上傳紀錄。"
            />
          </CanvasCard>

          <CanvasCard theme={theme} title={"附件 · 讀取失敗"}>
            <CanvasEmptyState
              theme={theme}
              tone="warn"
              title={"讀取失敗"}
              body="附件下載連結讀取失敗，請點擊重試或聯繫 Ops。"
              action={
                <CanvasBtn theme={theme} size="xs" icon="arrow">
                  {"重試"}
                </CanvasBtn>
              }
            />
          </CanvasCard>

          <CanvasCard theme={theme} title={"歷程 · 空歷程"}>
            <CanvasEmptyState
              theme={theme}
              tone="neutral"
              title={"尚無歷程"}
              body="案件剛建立，尚無歷程事件；這是合法的空狀態。"
            />
          </CanvasCard>

          <div style={{ gridColumn: "1 / -1" }}>
            <CanvasCard theme={theme} title={"歷程 · 讀取失敗"}>
              <CanvasEmptyState
                theme={theme}
                tone="warn"
                title={"歷程服務異常"}
                body="歷程服務暫時無法回應，Ops owner 資訊仍保留於案件摘要。"
                action={
                  <CanvasBtn theme={theme} size="xs" icon="arrow">
                    {"重新整理"}
                  </CanvasBtn>
                }
              />
            </CanvasCard>
          </div>
        </div>
      </div>
    </>
  );
}
