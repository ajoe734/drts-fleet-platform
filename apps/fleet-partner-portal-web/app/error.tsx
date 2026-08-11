"use client";

import { useEffect } from "react";
import { CanvasBtn, CanvasCard, CanvasPill } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { t } from "@/lib/translations";

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

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        backgroundColor: theme.bg,
        color: theme.text,
        fontFamily: theme.fontFamily,
      }}
    >
      <div style={{ maxWidth: 560, width: "100%" }}>
        <CanvasCard
          theme={theme}
          title={
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <CanvasPill theme={theme} tone={isScopeError ? "danger" : "warn"}>
                {isScopeError ? `${t("common.filter", "en")} / 配置錯誤` : "Application Error"}
              </CanvasPill>
              <span>
                {isScopeError
                  ? `${t("app.name", "en")} Scope / 車行身份未設定`
                  : "Something went wrong / 載入發生錯誤"}
              </span>
            </div>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p
              style={{
                fontSize: 13,
                color: theme.textMuted,
                margin: 0,
                lineHeight: 1.6,
                wordBreak: "break-word",
              }}
            >
              {error.message || "An unexpected error occurred while loading the page."}
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <CanvasBtn
                theme={theme}
                variant="primary"
                onClick={() => reset()}
              >
                {t("actions.retry", "en")} / {t("actions.retry", "zh")}
              </CanvasBtn>
            </div>
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}

