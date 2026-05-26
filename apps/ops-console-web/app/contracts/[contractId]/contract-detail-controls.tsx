"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import type { RefreshTier, ResourceActionDescriptor } from "@drts/contracts";
import { CanvasBtn as Btn, CanvasIcon, type CanvasTheme } from "@drts/ui-web";
import { t, type Locale } from "@/lib/translations";

type ContractActionBarProps = {
  locale: Locale;
  availableActions: ResourceActionDescriptor[];
  platformAdminHref: string;
  theme: CanvasTheme;
};

type ContractRefreshIndicatorProps = {
  locale: Locale;
  tier: RefreshTier;
  tierLabel: string;
  cadenceLabel: string;
  theme: CanvasTheme;
};

type ToastState = {
  actionLabel: string;
};

const REFRESH_CADENCE_MS: Record<RefreshTier, number> = {
  urgent: 5000,
  fast: 3000,
  dispatch: 5000,
  medium: 15000,
  medium_slow: 30000,
  slow: 30000,
  manual: 0,
};

function pickActionVariant(
  descriptor: ResourceActionDescriptor,
): "primary" | "secondary" | "ghost" {
  if (!descriptor.enabled) return "ghost";
  if (descriptor.riskLevel === "high") return "primary";
  if (descriptor.riskLevel === "medium") return "secondary";
  return "ghost";
}

function pickActionIcon(
  descriptor: ResourceActionDescriptor,
): "warn" | "copy" | "ext" {
  if (descriptor.riskLevel === "high") return "warn";
  if (descriptor.requiresReason) return "copy";
  return "ext";
}

function buildActionHref(
  baseHref: string,
  action: string,
  reason?: string,
): string {
  const parsed = (() => {
    try {
      return new URL(baseHref);
    } catch {
      return null;
    }
  })();
  if (parsed) {
    parsed.searchParams.set("action", action);
    if (reason) parsed.searchParams.set("reason", reason);
    return parsed.toString();
  }
  const join = baseHref.includes("?") ? "&" : "?";
  const reasonSegment = reason ? `&reason=${encodeURIComponent(reason)}` : "";
  return `${baseHref}${join}action=${encodeURIComponent(action)}${reasonSegment}`;
}

function linkStyle(
  theme: CanvasTheme,
  variant: "primary" | "secondary" | "ghost",
): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 28,
    padding: "5px 10px",
    borderRadius: 7,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
  };
  if (variant === "primary") {
    return {
      ...base,
      background: theme.accent,
      color: "#ffffff",
      border: `1px solid ${theme.accent}`,
    };
  }
  if (variant === "ghost") {
    return {
      ...base,
      background: "transparent",
      color: theme.textMuted,
      border: "1px solid transparent",
    };
  }
  return {
    ...base,
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
  };
}

export function ContractActionBar({
  locale,
  availableActions,
  platformAdminHref,
  theme,
}: ContractActionBarProps) {
  const [active, setActive] = useState<ResourceActionDescriptor | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const openConfirm = useCallback((descriptor: ResourceActionDescriptor) => {
    setActive(descriptor);
    setReason("");
    setReasonError(null);
  }, []);

  const closeConfirm = useCallback(() => {
    setActive(null);
    setReason("");
    setReasonError(null);
  }, []);

  const showToast = useCallback((next: ToastState) => {
    setToast(next);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const dismissToast = useCallback(() => {
    setToast(null);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!active) return;
    const trimmed = reason.trim();
    if (active.riskLevel === "high" && trimmed.length === 0) {
      setReasonError(t("contractDetail.actions.reasonRequired", locale));
      return;
    }
    const href = buildActionHref(
      platformAdminHref,
      active.action,
      trimmed || undefined,
    );
    if (typeof window !== "undefined") {
      window.open(href, "_blank", "noopener,noreferrer");
    }
    showToast({ actionLabel: active.action });
    closeConfirm();
  }, [active, reason, locale, platformAdminHref, closeConfirm, showToast]);

  const handleActionClick = useCallback(
    (descriptor: ResourceActionDescriptor) => {
      if (!descriptor.enabled) return;
      if (descriptor.riskLevel === "low") {
        const href = buildActionHref(platformAdminHref, descriptor.action);
        if (typeof window !== "undefined") {
          window.open(href, "_blank", "noopener,noreferrer");
        }
        showToast({ actionLabel: descriptor.action });
        return;
      }
      openConfirm(descriptor);
    },
    [platformAdminHref, openConfirm, showToast],
  );

  const confirmBodyKey = active
    ? active.riskLevel === "high"
      ? "contractDetail.actions.confirmBodyHigh"
      : active.riskLevel === "medium"
        ? "contractDetail.actions.confirmBodyMedium"
        : "contractDetail.actions.confirmBodyLow"
    : null;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        {availableActions.length === 0 ? (
          <span
            style={{
              fontSize: 11.5,
              color: theme.textMuted,
              fontFamily: theme.monoFamily,
            }}
          >
            {t("contractDetail.readOnlyHint", locale)}
          </span>
        ) : (
          availableActions.map((descriptor) => {
            const variant = pickActionVariant(descriptor);
            const disabled = !descriptor.enabled;
            const tooltip =
              disabled && descriptor.disabledReasonCode
                ? t("contractDetail.actions.disabledTooltip", locale, {
                    code: descriptor.disabledReasonCode,
                  })
                : undefined;
            return (
              <span
                key={descriptor.action}
                title={tooltip}
                data-action={descriptor.action}
                data-risk={descriptor.riskLevel}
                data-enabled={descriptor.enabled ? "true" : "false"}
              >
                <Btn
                  theme={theme}
                  variant={variant}
                  icon={pickActionIcon(descriptor)}
                  disabled={disabled}
                  onClick={() => handleActionClick(descriptor)}
                >
                  {descriptor.action}
                </Btn>
              </span>
            );
          })
        )}
        <Link
          href={platformAdminHref}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle(theme, "primary")}
        >
          <CanvasIcon name="ext" size={12} />
          <span>{t("contractDetail.openInPlatformAdmin", locale)}</span>
        </Link>
      </div>

      {active && confirmBodyKey ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contract-action-confirm-title"
          onClick={closeConfirm}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(2, 6, 23, 0.55)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              color: theme.text,
              fontFamily: theme.fontFamily,
              width: "min(480px, 100%)",
              padding: 20,
              display: "grid",
              gap: 14,
              boxShadow: "0 24px 48px rgba(2, 6, 23, 0.45)",
            }}
          >
            <div
              id="contract-action-confirm-title"
              style={{ fontSize: 14, fontWeight: 600, color: theme.text }}
            >
              {t("contractDetail.actions.confirmTitle", locale, {
                action: active.action,
              })}
            </div>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: theme.textMuted,
              }}
            >
              {t(confirmBodyKey as never, locale)}
            </div>
            {active.riskLevel === "high" ? (
              <label
                style={{
                  display: "grid",
                  gap: 6,
                  fontSize: 12,
                  color: theme.textMuted,
                }}
              >
                <span>{t("contractDetail.actions.reasonLabel", locale)}</span>
                <textarea
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    if (reasonError && event.target.value.trim().length > 0) {
                      setReasonError(null);
                    }
                  }}
                  placeholder={t(
                    "contractDetail.actions.reasonPlaceholder",
                    locale,
                  )}
                  rows={3}
                  style={{
                    background: theme.surfaceLo,
                    border: `1px solid ${
                      reasonError ? theme.danger : theme.border
                    }`,
                    borderRadius: 6,
                    color: theme.text,
                    fontFamily: theme.fontFamily,
                    fontSize: 12.5,
                    padding: "8px 10px",
                    resize: "vertical",
                  }}
                />
                {reasonError ? (
                  <span style={{ color: theme.danger, fontSize: 11.5 }}>
                    {reasonError}
                  </span>
                ) : null}
              </label>
            ) : null}
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <Btn theme={theme} variant="ghost" onClick={closeConfirm}>
                {t("contractDetail.actions.cancel", locale)}
              </Btn>
              <Btn
                theme={theme}
                variant="primary"
                icon="ext"
                onClick={handleConfirm}
              >
                {t("contractDetail.actions.confirm", locale)}
              </Btn>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 900,
            background: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            color: theme.text,
            fontFamily: theme.fontFamily,
            fontSize: 12.5,
            padding: "12px 14px",
            display: "grid",
            gap: 6,
            width: "min(360px, 100%)",
            boxShadow: "0 16px 32px rgba(2, 6, 23, 0.4)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CanvasIcon name="check" size={14} />
            <span style={{ fontWeight: 600 }}>
              {t("contractDetail.actions.toastTitle", locale, {
                action: toast.actionLabel,
              })}
            </span>
          </div>
          <div style={{ color: theme.textMuted }}>
            {t("contractDetail.actions.toastBody", locale)}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Btn theme={theme} variant="ghost" onClick={dismissToast}>
              {t("contractDetail.actions.toastDismiss", locale)}
            </Btn>
          </div>
        </div>
      ) : null}
    </>
  );
}

function formatRelative(locale: Locale, lastAt: number | null): string {
  if (lastAt == null) return t("contractDetail.refresh.never", locale);
  const diffSec = Math.max(0, Math.round((Date.now() - lastAt) / 1000));
  if (diffSec < 2) return t("contractDetail.refresh.justNow", locale);
  if (diffSec < 60) {
    return t("contractDetail.refresh.secondsAgo", locale, {
      seconds: diffSec,
    });
  }
  const minutes = Math.round(diffSec / 60);
  return t("contractDetail.refresh.minutesAgo", locale, { minutes });
}

export function ContractRefreshIndicator({
  locale,
  tier,
  tierLabel,
  cadenceLabel,
  theme,
}: ContractRefreshIndicatorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [, forceTick] = useState(0);

  const cadenceMs = REFRESH_CADENCE_MS[tier];

  const triggerRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
    setLastRefreshedAt(Date.now());
  }, [router]);

  useEffect(() => {
    if (cadenceMs <= 0) return;
    const id = window.setInterval(() => {
      triggerRefresh();
    }, cadenceMs);
    return () => window.clearInterval(id);
  }, [cadenceMs, triggerRefresh]);

  useEffect(() => {
    const id = window.setInterval(() => {
      forceTick((value) => (value + 1) % 1_000_000);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const relative = useMemo(
    () => formatRelative(locale, lastRefreshedAt),
    [locale, lastRefreshedAt],
  );

  const autoLabel =
    cadenceMs > 0
      ? t("contractDetail.refresh.autoCadence", locale, {
          cadence: cadenceLabel,
        })
      : t("contractDetail.refresh.manualOnly", locale);

  return (
    <span
      data-refresh-tier={tier}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        fontFamily: theme.monoFamily,
        fontSize: 11,
        color: theme.textMuted,
      }}
    >
      <span>
        {t("contractDetail.refreshTierLabel", locale)}: {tierLabel} ·{" "}
        {cadenceLabel}
      </span>
      <span style={{ opacity: 0.7 }}>{autoLabel}</span>
      <span style={{ opacity: 0.7 }}>
        {t("contractDetail.refresh.lastRefreshed", locale, { time: relative })}
      </span>
      <Btn
        theme={theme}
        variant="ghost"
        size="xs"
        icon="arrow"
        disabled={pending}
        onClick={triggerRefresh}
      >
        {pending
          ? t("contractDetail.refresh.refreshingLabel", locale)
          : t("contractDetail.refresh.manualLabel", locale)}
      </Btn>
    </span>
  );
}
