"use client";

import { useEffect } from "react";
import { CanvasBtn, CanvasCard, CanvasPill } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { t } from "@/lib/translations";

const SHELL_MONO = "JetBrains Mono, monospace";

export default function FleetPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[fleet-portal] unhandled page error:", error);
  }, [error]);

  const theme = buildFleetTheme();
  const isScopeError =
    error.message?.includes("Missing fleet scope configuration") ||
    error.message?.includes("x-fleet-partner-id");

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  const nowStr = new Date().toLocaleString('en-US', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(',', '');

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px",
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: theme.fontFamily,
      }}
    >
      <div style={{ maxWidth: 520, width: "100%" }}>
        <CanvasCard theme={theme} padding={28}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12 }}>
            <CanvasPill theme={theme} tone={isScopeError ? "danger" : "warn"} dot>
              {isScopeError ? "缺少車隊身分" : "頁面發生錯誤"}
              <span style={{ marginLeft: 4, opacity: 0.6, fontFamily: SHELL_MONO, fontSize: 9 }}>
                {isScopeError ? "FLEET_SCOPE_MISSING" : "UNHANDLED_ERROR"}
              </span>
            </CanvasPill>
            
            <div style={{ fontSize: 20, fontWeight: 800, color: theme.text, marginTop: 4 }}>
              {isScopeError ? "無法辨識您所屬的車隊" : "這個頁面暫時無法顯示"}
            </div>
            
            <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.65, maxWidth: 400 }}>
              {isScopeError 
                ? "您的帳號缺少有效的車隊識別設定，因此無法載入任何車隊資料。請聯絡您的車隊管理員或平台客服重新綁定車隊身分。"
                : "發生未預期的錯誤，您的資料沒有受到影響。請重試一次；若持續發生，請附上追蹤編號回報。"
              }
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {isScopeError ? (
                <CanvasBtn theme={theme} icon="lock" onClick={handleLogout}>
                  {t("actions.logout", "zh")}
                </CanvasBtn>
              ) : (
                <>
                  <CanvasBtn theme={theme} variant="primary" icon="refresh" onClick={() => reset()}>
                    {t("actions.retry", "zh")}
                  </CanvasBtn>
                  <CanvasBtn theme={theme} icon="arrow-right" onClick={() => window.location.href = '/dashboard'}>
                    {t("actions.backToDashboard", "zh")}
                  </CanvasBtn>
                </>
              )}
            </div>

            <div style={{ fontSize: 10.5, color: theme.textDim, fontFamily: SHELL_MONO, marginTop: 6 }}>
              {error.digest ? `trace ${error.digest}` : "trace unknown"} · {nowStr}
            </div>
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
