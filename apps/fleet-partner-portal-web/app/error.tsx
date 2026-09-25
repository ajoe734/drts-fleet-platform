"use client";

import { useEffect, useState } from "react";
import { CanvasBtn, CanvasCard, CanvasPill } from "@drts/ui-web";
import { buildFleetTheme } from "@/lib/fleet-portal-theme";
import { useTranslation } from "@/lib/i18n";

export default function FleetPortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  const [logoutError, setLogoutError] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    console.error("[fleet-portal] unhandled page error:", error);
  }, [error]);

  const theme = buildFleetTheme();
  const isScopeError =
    error.message?.includes("Missing fleet scope configuration") ||
    error.message?.includes("x-fleet-partner-id");

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setLogoutError(false);
    try {
      const csrfToken =
        document.cookie
          .split("; ")
          .find((row) => row.startsWith("drts_csrf="))
          ?.split("=")[1] || "";

      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "x-csrf-token": csrfToken,
        },
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        setLogoutError(true);
        setIsLoggingOut(false);
      }
    } catch (e) {
      console.error("Logout failed", e);
      setLogoutError(true);
      setIsLoggingOut(false);
    }
  };

  const nowStr = new Date()
    .toLocaleString("en-US", {
      hour12: false,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(",", "");

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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: 12,
            }}
          >
            <CanvasPill
              theme={theme}
              tone={isScopeError ? "danger" : "warn"}
              dot
            >
              {isScopeError ? t("error.scope.badge") : t("error.generic.badge")}
              <span
                style={{
                  marginLeft: 4,
                  opacity: 0.6,
                  fontFamily: theme.monoFamily,
                  fontSize: 9,
                }}
              >
                {isScopeError ? "FLEET_SCOPE_MISSING" : "UNHANDLED_ERROR"}
              </span>
            </CanvasPill>

            <div
              style={{
                fontSize: 20,
                fontWeight: 800,
                color: theme.text,
                marginTop: 4,
              }}
            >
              {isScopeError ? t("error.scope.title") : t("error.generic.title")}
            </div>

            <div
              style={{
                fontSize: 13,
                color: theme.textMuted,
                lineHeight: 1.65,
                maxWidth: 400,
              }}
            >
              {isScopeError ? t("error.scope.body") : t("error.generic.body")}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 6,
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                {isScopeError ? (
                  <CanvasBtn
                    theme={theme}
                    icon="lock"
                    onClick={handleLogout}
                    disabled={isLoggingOut}
                  >
                    {t("actions.logout")}
                  </CanvasBtn>
                ) : (
                  <>
                    <CanvasBtn
                      theme={theme}
                      variant="primary"
                      icon="refresh"
                      onClick={() => reset()}
                    >
                      {t("actions.retry")}
                    </CanvasBtn>
                    <CanvasBtn
                      theme={theme}
                      icon="arrow-right"
                      onClick={() => (window.location.href = "/dashboard")}
                    >
                      {t("actions.backToDashboard")}
                    </CanvasBtn>
                  </>
                )}
              </div>
              {logoutError && (
                <div
                  style={{ fontSize: 12, color: theme.danger, marginTop: 4 }}
                >
                  {t("error.generic.badge")} - {t("actions.retry")}
                </div>
              )}
            </div>

            <div
              style={{
                fontSize: 10.5,
                color: theme.textDim,
                fontFamily: theme.monoFamily,
                marginTop: 6,
              }}
            >
              {error.digest
                ? `${t("error.trace")} ${error.digest}`
                : `${t("error.trace")} ${t("error.unknown")}`}{" "}
              · {nowStr}
            </div>
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
