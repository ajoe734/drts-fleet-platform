import Link from "next/link";
import {
  CanvasCard,
  CanvasPageHeader,
  CanvasIcon,
} from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";

export const dynamic = "force-dynamic";

const CASE_ERRORS = [
  {
    code: "CASE_NOT_FLEET_SCOPED",
    when: "嘗試開啟非本車行案件",
    fix: "僅能存取本車行旗下司機 / 車輛案件；案件不在清單中",
  },
  {
    code: "CASE_PLATFORM_OWNED",
    when: "案件責任歸屬 platform",
    fix: "唯讀檢視；回覆按鈕停用，車行無法處理 — 見 /cases/cmp_0912",
  },
  {
    code: "CASE_CLOSED_NO_REPLY",
    when: "案件已 closed 仍嘗試回覆",
    fix: "需請 Ops 執行 reopen 才能再次回覆",
  },
  {
    code: "CASE_REPLY_SUBMIT_FAILED",
    when: "回覆送出失敗（網路 / 伺服器錯誤）",
    fix: "內容不遺失，可直接重試 — 見案件詳情回覆區",
  },
  {
    code: "CASE_REPLY_DUPLICATE",
    when: "同一 idempotency-key 重複送出回覆",
    fix: "回傳原始回覆的 receipt，不建立第二筆歷程",
  },
  {
    code: "CASE_ATTACHMENT_UPLOAD_FAILED",
    when: "附件直傳物件儲存失敗",
    fix: "該筆附件可個別重試，不影響已送出的回覆文字",
  },
  {
    code: "CASE_ATTACHMENT_TOO_LARGE",
    when: "附件超過大小限制",
    fix: "請壓縮或分件上傳，限制由 API 回傳",
  },
];

export default function FleetCaseErrorsPage() {
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
        <span style={{ color: theme.text }}>{"錯誤狀態"}</span>
      </div>

      <CanvasPageHeader
        theme={theme}
        title={"案件錯誤 / Edge States"}
        subtitle="R12 · 每個錯誤皆由 API 決定，UI 僅呈現訊息與後續指引"
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
            href="/cases/access-states"
            style={{
              color: theme.textMuted,
              fontSize: 12,
              textDecoration: "none",
            }}
          >
            {"查看附件/歷程讀取狀態"}
          </Link>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
          }}
        >
          {CASE_ERRORS.map(({ code, when, fix }) => (
            <CanvasCard theme={theme} key={code} padding={14}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 7,
                }}
              >
                <CanvasIcon
                  name="warn"
                  size={15}
                  style={{ color: theme.danger }}
                />
                <code
                  style={{
                    fontSize: 12,
                    fontFamily: theme.monoFamily,
                    color: theme.danger,
                    fontWeight: 600,
                  }}
                >
                  {code}
                </code>
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: theme.text,
                  marginBottom: 4,
                }}
              >
                {when}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <CanvasIcon name="arrow" size={12} />
                {fix}
              </div>
            </CanvasCard>
          ))}
        </div>
      </div>
    </>
  );
}
