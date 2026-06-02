"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import {
  buildPartnerReadinessItems,
  partnerStatusTone,
} from "@/components/partner-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import type {
  PartnerChannelEntryRecord,
  PartnerIngressCredentialIssued,
  PartnerIngressCredentialRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const pageShellStyle = {
  minHeight: "100%",
  background: theme.bg,
  color: theme.text,
} satisfies React.CSSProperties;

const pageBodyStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
} satisfies React.CSSProperties;

const twoColumnStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
} satisfies React.CSSProperties;

const secondaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 16,
} satisfies React.CSSProperties;

const stackStyle = {
  display: "grid",
  gap: 16,
} satisfies React.CSSProperties;

const compactStackStyle = {
  display: "grid",
  gap: 10,
} satisfies React.CSSProperties;

const sectionAnchorStyle = {
  scrollMarginTop: 92,
} satisfies React.CSSProperties;

const emptyStateStyle = {
  display: "grid",
  placeItems: "center",
  minHeight: 220,
  padding: "40px 24px",
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  color: theme.textMuted,
  textAlign: "center",
} satisfies React.CSSProperties;

const mutedTextStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
} satisfies React.CSSProperties;

const readinessRowBaseStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 0",
  borderBottom: `1px solid ${theme.border}`,
} satisfies React.CSSProperties;

const badgeDotStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 20,
  height: 20,
  borderRadius: "50%",
  flexShrink: 0,
} satisfies React.CSSProperties;

const accentSwatchStyle = {
  width: 10,
  height: 10,
  borderRadius: "50%",
  border: `1px solid ${theme.border}`,
  flexShrink: 0,
} satisfies React.CSSProperties;

const monoBlockStyle = {
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  padding: "12px 14px",
  fontFamily: theme.monoFamily,
  fontSize: 12,
  lineHeight: 1.6,
  overflowWrap: "anywhere",
} satisfies React.CSSProperties;

const modalBackdropStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.52)",
  display: "grid",
  placeItems: "center",
  padding: 24,
  zIndex: 30,
} satisfies React.CSSProperties;

const modalCardStyle = {
  width: "min(100%, 560px)",
  maxHeight: "min(100%, 720px)",
  overflowY: "auto",
  borderRadius: 16,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
  boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
} satisfies React.CSSProperties;

const modalHeaderStyle = {
  display: "grid",
  gap: 6,
  padding: "18px 20px 14px",
  borderBottom: `1px solid ${theme.border}`,
} satisfies React.CSSProperties;

const modalBodyStyle = {
  display: "grid",
  gap: 14,
  padding: 20,
} satisfies React.CSSProperties;

const modalFooterStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  padding: "14px 20px 20px",
  borderTop: `1px solid ${theme.border}`,
} satisfies React.CSSProperties;

type CredentialActionMode = "issue" | "rotate";

type PendingCredentialAction = {
  mode: CredentialActionMode;
  title: string;
};

type CredentialRow = Record<string, unknown> & {
  keyId: string;
  kind: string;
  masked: string;
  rotated: string;
};

function toCanvasTone(
  tone: ReturnType<typeof partnerStatusTone>,
): "neutral" | "success" | "warn" | "danger" {
  if (tone === "warning") {
    return "warn";
  }

  return tone;
}

function linkButtonStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: theme.accent,
      color: "#ffffff",
      border: `1px solid ${theme.accent}`,
      textDecoration: "none",
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
    } satisfies React.CSSProperties;
  }

  if (variant === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      height: 28,
      padding: "5px 10px",
      borderRadius: 7,
      background: "transparent",
      color: theme.textMuted,
      border: "1px solid transparent",
      textDecoration: "none",
      fontSize: 12,
      fontWeight: 500,
      lineHeight: 1,
    } satisfies React.CSSProperties;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 28,
    padding: "5px 10px",
    borderRadius: 7,
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    textDecoration: "none",
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
  } satisfies React.CSSProperties;
}

function ModalShell({
  title,
  subtitle,
  children,
  footer,
  closeLabel,
  canClose,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  closeLabel: string;
  canClose: boolean;
  onClose: () => void;
}) {
  return (
    <div
      role="presentation"
      style={modalBackdropStyle}
      onClick={() => {
        if (canClose) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={modalCardStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={modalHeaderStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: theme.text,
                  lineHeight: 1.25,
                }}
              >
                {title}
              </div>
              {subtitle ? (
                <div style={{ ...mutedTextStyle, marginTop: 4 }}>
                  {subtitle}
                </div>
              ) : null}
            </div>
            <CanvasBtn
              theme={theme}
              variant="ghost"
              disabled={!canClose}
              onClick={() => {
                if (canClose) {
                  onClose();
                }
              }}
            >
              {closeLabel}
            </CanvasBtn>
          </div>
        </div>
        <div style={modalBodyStyle}>{children}</div>
        <div style={modalFooterStyle}>{footer}</div>
      </div>
    </div>
  );
}

export default function PartnerDetailPage() {
  const params = useParams<{ entrySlug: string }>();
  const entrySlug = Array.isArray(params?.entrySlug)
    ? params.entrySlug[0]
    : (params?.entrySlug ?? "");
  const client = usePlatformAdminClient();
  const { t, locale } = useTranslation();

  const [entry, setEntry] = useState<PartnerChannelEntryRecord | null>(null);
  const [credentials, setCredentials] = useState<
    PartnerIngressCredentialRecord[]
  >([]);
  const [issuedCredential, setIssuedCredential] =
    useState<PartnerIngressCredentialIssued | null>(null);
  const [pendingCredentialAction, setPendingCredentialAction] =
    useState<PendingCredentialAction | null>(null);
  const [credentialActionReason, setCredentialActionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingCredential, setSubmittingCredential] = useState(false);
  const [secretAcknowledged, setSecretAcknowledged] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(max-width: 1080px)");
    const syncViewport = () => setIsCompactViewport(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const copy =
    locale === "en"
      ? {
          back: "Back to partner entries",
          preview: "Preview entry",
          title: "Partner entry detail",
          unavailableTitle: "Partner entry unavailable",
          notFound: "Partner entry not found.",
          errorTitle: "Unable to load partner entry",
          tabs: [
            "Overview",
            "Branding",
            "Auth",
            "Eligibility",
            "Credentials",
            "Audit",
          ],
          overviewTitle: "Entry basics",
          overviewSubtitle:
            "Platform-owned routing, identity, and launch posture for the selected partner entry.",
          readinessTitle: "Readiness · gated",
          readinessSubtitle:
            "Keep activation blocked until branding, auth, eligibility, ingress, and audit are green.",
          brandingTitle: "Branding",
          brandingSubtitle:
            "Display, entry route, accent token, and support metadata exposed to the partner-facing skin.",
          authTitle: "Auth",
          authSubtitle:
            "Auth authority, lifecycle status, and partner-owned ingress posture remain governed from Platform Admin.",
          eligibilityTitle: "Eligibility",
          eligibilitySubtitle:
            "Linked contract snapshot, adapter posture, and fallback policy for this entry.",
          credentialsTitle: "Active credentials · masked only",
          credentialsSubtitle:
            "Secrets are masked in the body. Plaintext is revealed exactly once through the credential modal.",
          credentialsEmpty: "No active ingress credential has been issued yet.",
          auditTitle: "Audit",
          auditSubtitle:
            "Creation, update, revocation, and request lineage retained for governance review.",
          readyTitle: "Ready to promote",
          blockedTitle: "Readiness gaps remain",
          readyBody:
            "Checklist is clear. This entry can be promoted without hiding platform governance boundaries.",
          blockedBody:
            "Do not activate external traffic until the remaining readiness gaps are resolved.",
          issueCredentialTitle: "Issue credential",
          rotateCredentialTitle: "Rotate credential",
          credentialActionHint:
            "High-risk action. A reason is required and the plaintext key will only be shown once.",
          credentialActionReasonLabel: "Rotation reason",
          credentialActionReasonPlaceholder:
            "Explain why this credential is being issued or rotated.",
          confirmIssue: "Issue",
          confirmRotate: "Rotate",
          cancel: "Cancel",
          close: "Close",
          oneTimeSecretTitle: "Ingress credential · plaintext-once reveal",
          oneTimeSecretHint:
            "Store this secret now. After acknowledgement, the plaintext will be removed from page state.",
          oneTimeSecretAck:
            "I stored this key and understand it will not be shown again.",
          copySecret: "Copy secret",
          copied: "Copied",
          downloadSecret: "Download .txt",
          dismissSecret: "Acknowledge",
          secretLabel: "Plaintext key",
          secretScopeLabel: "Scope",
          secretExpiryLabel: "Expiry",
          secretIssuedLabel: "Issued",
          secretUnavailableExpiry: "Not exposed by current contract",
          routeHint: "Public route preview",
          accentHint: "Theme accent",
          statusRevoked: "Entry revoked",
          statusRevokedBody:
            "Traffic should remain blocked for this entry until a replacement path is approved.",
        }
      : {
          back: "返回 partner entries",
          preview: "預覽 entry",
          title: "Partner entry 詳情",
          unavailableTitle: "Partner entry 目前不可用",
          notFound: "找不到此 partner entry。",
          errorTitle: "無法載入 partner entry",
          tabs: [
            "Overview",
            "Branding",
            "Auth",
            "Eligibility",
            "Credentials",
            "Audit",
          ],
          overviewTitle: "Entry 基本資料",
          overviewSubtitle:
            "集中檢視此 partner entry 的平台治理 routing、識別與上線姿態。",
          readinessTitle: "Readiness · gated",
          readinessSubtitle:
            "在 branding、auth、eligibility、ingress 與 audit gate 全部轉綠前，不應直接啟用外部流量。",
          brandingTitle: "Branding",
          brandingSubtitle:
            "partner-facing skin 對外呈現的名稱、入口路由、品牌色與支援資訊。",
          authTitle: "Auth",
          authSubtitle:
            "驗證權限、生命週期狀態與 partner ingress posture 都應由 Platform Admin 治理。",
          eligibilityTitle: "Eligibility",
          eligibilitySubtitle:
            "檢視此 entry 的 contract snapshot、adapter posture 與 fallback policy。",
          credentialsTitle: "Active credentials · 僅顯示遮罩",
          credentialsSubtitle:
            "頁面正文永遠只顯示遮罩。明文只會透過 credential modal 顯示一次。",
          credentialsEmpty: "目前尚未核發有效 ingress credential。",
          auditTitle: "Audit",
          auditSubtitle:
            "建立、更新、撤銷與 request lineage 都需保留給平台稽核。",
          readyTitle: "可推進上線",
          blockedTitle: "仍有 readiness 缺口",
          readyBody:
            "Checklist 已補齊，可在不模糊平台治理邊界的前提下推進流量啟用。",
          blockedBody: "在剩餘 gate 補齊前，不應讓外部流量直接進入此 entry。",
          issueCredentialTitle: "發行 credential",
          rotateCredentialTitle: "輪替 credential",
          credentialActionHint:
            "高風險操作。必須填寫原因，且明文憑證只會顯示一次。",
          credentialActionReasonLabel: "輪替原因",
          credentialActionReasonPlaceholder:
            "說明為何要發行或輪替這筆 credential。",
          confirmIssue: "發行",
          confirmRotate: "輪替",
          cancel: "取消",
          close: "關閉",
          oneTimeSecretTitle: "Ingress credential · 明文一次性顯示",
          oneTimeSecretHint:
            "請立即保存此 secret。確認後頁面 state 內的明文會被清除。",
          oneTimeSecretAck: "我已妥善保存此 key，且理解之後不會再顯示。",
          copySecret: "複製 secret",
          copied: "已複製",
          downloadSecret: "下載 .txt",
          dismissSecret: "確認並關閉",
          secretLabel: "明文 key",
          secretScopeLabel: "權限範圍",
          secretExpiryLabel: "到期",
          secretIssuedLabel: "發行時間",
          secretUnavailableExpiry: "目前 contract 未提供",
          routeHint: "公開入口預覽",
          accentHint: "主題 accent",
          statusRevoked: "Entry 已撤銷",
          statusRevokedBody:
            "在 replacement path 獲准前，此 entry 應持續維持流量封鎖。",
        };

  useEffect(() => {
    let cancelled = false;

    async function loadEntry() {
      if (!entrySlug) {
        setEntry(null);
        setCredentials([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const entries = await client.listPlatformPartnerEntries();
        const selected =
          entries.find((candidate) => candidate.entrySlug === entrySlug) ??
          null;
        const nextCredentials = selected
          ? await client.listPlatformPartnerIngressCredentials(
              selected.entrySlug,
            )
          : [];

        if (cancelled) {
          return;
        }

        setEntry(selected);
        setCredentials(nextCredentials ?? []);
      } catch (nextError: unknown) {
        if (cancelled) {
          return;
        }

        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
        setEntry(null);
        setCredentials([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadEntry();

    return () => {
      cancelled = true;
    };
  }, [client, entrySlug]);

  const activeCredentialCount = useMemo(
    () => credentials.filter((credential) => !credential.revokedAt).length,
    [credentials],
  );

  const readinessItems = useMemo(
    () =>
      entry
        ? buildPartnerReadinessItems(entry, t, {
            activeCredentialCount,
          })
        : [],
    [activeCredentialCount, entry, t],
  );

  const readinessComplete =
    readinessItems.length > 0 && readinessItems.every((item) => item.ready);

  const statusTone = entry
    ? toCanvasTone(partnerStatusTone(entry.status))
    : "neutral";
  const bankLabel = entry?.bankCode ?? entry?.displayName ?? "—";
  const programLabel = entry?.programId ?? "—";
  const previewUrl =
    entry?.entryHost && entry?.entryPath
      ? `https://${entry.entryHost}${entry.entryPath}`
      : null;

  const readinessBannerTone = readinessComplete
    ? "success"
    : entry?.status === "active"
      ? "danger"
      : "warn";

  const supportLabel = useMemo(() => {
    if (!entry) {
      return "—";
    }

    return (
      [
        entry.brandingMetadata?.supportEmail,
        entry.brandingMetadata?.supportPhone,
      ]
        .filter(Boolean)
        .join(" · ") || "—"
    );
  }, [entry]);

  const credentialScope = useMemo(() => {
    if (!entry) {
      return "—";
    }

    const scopes = ["partner.ingress:write"];
    if (entry.eligibilityMode !== "none") {
      scopes.push("cardholder.eligibility:verify");
    }
    return scopes.join(" · ");
  }, [entry]);

  const overviewItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        k: "TENANT",
        v: `${entry.partnerType} · ${entry.tenantId}`,
        mono: true,
      },
      {
        k: "BANK CODE",
        v: entry.bankCode ?? "—",
        mono: true,
      },
      {
        k: "PROGRAM",
        v: entry.programId,
      },
      {
        k: "BUSINESS SUBTYPE",
        v: formatPlatformCodeLabel(locale, entry.businessDispatchSubtype),
        mono: true,
      },
      {
        k: "AUTH MODE",
        v: formatPlatformCodeLabel(locale, entry.authMode),
        mono: true,
      },
      {
        k: "ELIGIBILITY",
        v: formatPlatformCodeLabel(locale, entry.eligibilityMode),
        mono: true,
      },
      {
        k: "ENTRY HOST",
        v: entry.entryHost ?? "—",
        mono: true,
      },
      {
        k: "ENTRY PATH",
        v: entry.entryPath ?? "—",
        mono: true,
      },
      {
        k: "THEME ACCENT",
        v: entry.themeAccent ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                ...accentSwatchStyle,
                background: entry.themeAccent,
              }}
            />
            <span style={{ fontFamily: theme.monoFamily, fontSize: 11.5 }}>
              {entry.themeAccent}
            </span>
          </span>
        ) : (
          "—"
        ),
      },
      {
        k: "SUPPORT CONTACT",
        v: supportLabel,
      },
    ];
  }, [entry, locale, supportLabel]);

  const brandingItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        k: locale === "en" ? "Display name" : "顯示名稱",
        v: entry.displayName,
      },
      {
        k: locale === "en" ? "Entry slug" : "Entry slug",
        v: entry.entrySlug,
        mono: true,
      },
      {
        k: locale === "en" ? "Host" : "Host",
        v: entry.entryHost ?? "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Path" : "Path",
        v: entry.entryPath ?? "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Accent" : "Accent",
        v: entry.themeAccent ?? "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Support" : "支援聯絡",
        v: supportLabel,
      },
    ];
  }, [entry, locale, supportLabel]);

  const authItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        k: locale === "en" ? "Partner ID" : "Partner ID",
        v: entry.partnerId,
        mono: true,
      },
      {
        k: locale === "en" ? "Partner code" : "Partner code",
        v: entry.partnerCode,
        mono: true,
      },
      {
        k: locale === "en" ? "Program code" : "Program code",
        v: entry.programCode ?? "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Auth mode" : "Auth mode",
        v: formatPlatformCodeLabel(locale, entry.authMode),
        mono: true,
      },
      {
        k: locale === "en" ? "Active flag" : "Active flag",
        v: entry.activeFlag ? "true" : "false",
        mono: true,
      },
      {
        k: locale === "en" ? "Credential scope" : "Credential scope",
        v: credentialScope,
        mono: true,
      },
    ];
  }, [credentialScope, entry, locale]);

  const eligibilityItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    const contract = entry.eligibilityContract;

    return [
      {
        k: locale === "en" ? "Contract ID" : "契約 ID",
        v: contract?.contractId ?? "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Adapter" : "Adapter",
        v: contract
          ? `${contract.adapterCode} · ${contract.adapterVersion}`
          : "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Adapter posture" : "Adapter posture",
        v: contract?.adapterKind ?? "—",
      },
      {
        k: locale === "en" ? "Fallback" : "Fallback",
        v: contract?.manualFallbackPolicy?.requiredOnTimeout
          ? locale === "en"
            ? "Ops queue required"
            : "需進 ops queue"
          : locale === "en"
            ? "No timeout fallback"
            : "無 timeout fallback",
      },
    ];
  }, [entry, locale]);

  const auditItems = useMemo(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        k: locale === "en" ? "Audit source" : "Audit 來源",
        v: entry.auditMetadata.source ?? "—",
      },
      {
        k: locale === "en" ? "Request ID" : "Request ID",
        v: entry.auditMetadata.requestId ?? "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Created by" : "建立者",
        v: entry.auditMetadata.createdBy ?? "—",
      },
      {
        k: locale === "en" ? "Created at" : "建立時間",
        v: formatDateTime(entry.createdAt),
        mono: true,
      },
      {
        k: locale === "en" ? "Updated by" : "更新者",
        v: entry.auditMetadata.updatedBy ?? "—",
      },
      {
        k: locale === "en" ? "Updated at" : "更新時間",
        v: formatDateTime(entry.updatedAt),
        mono: true,
      },
      {
        k: locale === "en" ? "Revoked at" : "撤銷時間",
        v: entry.revokedAt ? formatDateTime(entry.revokedAt) : "—",
        mono: true,
      },
      {
        k: locale === "en" ? "Revoke reason" : "撤銷原因",
        v: entry.revokeReason ?? "—",
      },
    ];
  }, [entry, locale]);

  const credentialRows = useMemo<CredentialRow[]>(
    () =>
      [...credentials]
        .sort((left, right) => {
          if (Boolean(left.revokedAt) !== Boolean(right.revokedAt)) {
            return left.revokedAt ? 1 : -1;
          }
          return (
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime()
          );
        })
        .map((credential) => ({
          keyId: credential.keyId,
          kind:
            credential.source === "env_bootstrap"
              ? "bootstrap"
              : "platform_admin",
          masked: `${credential.keyPrefix}${credential.maskedSuffix}`,
          rotated: formatDateTime(credential.createdAt),
        })),
    [credentials],
  );

  const credentialColumns = useMemo<CanvasTableColumn<CredentialRow>[]>(
    () => [
      {
        h: locale === "en" ? "kind" : "kind",
        k: "kind",
        mono: true,
        w: 140,
      },
      {
        h: locale === "en" ? "masked" : "masked",
        k: "masked",
        mono: true,
        w: 180,
      },
      {
        h: locale === "en" ? "rotated" : "rotated",
        k: "rotated",
        mono: true,
        w: 180,
      },
    ],
    [locale],
  );

  async function reloadEntry(options?: { preserveIssuedCredential?: boolean }) {
    if (!entrySlug) {
      setEntry(null);
      setCredentials([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const entries = await client.listPlatformPartnerEntries();
      const selected =
        entries.find((candidate) => candidate.entrySlug === entrySlug) ?? null;

      setEntry(selected);
      setCredentials(
        selected
          ? ((await client.listPlatformPartnerIngressCredentials(
              selected.entrySlug,
            )) ?? [])
          : [],
      );

      if (!options?.preserveIssuedCredential) {
        setIssuedCredential(null);
      }
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
      setEntry(null);
      setCredentials([]);
    } finally {
      setLoading(false);
    }
  }

  async function submitCredentialAction() {
    if (!entry || !pendingCredentialAction) {
      return;
    }

    setSubmittingCredential(true);
    setError(null);

    try {
      const issued = await client.issuePlatformPartnerIngressCredential(
        entry.entrySlug,
        {
          rotationReason: credentialActionReason.trim() || null,
        },
      );

      setIssuedCredential(issued);
      setPendingCredentialAction(null);
      setCredentialActionReason("");
      setSecretAcknowledged(false);
      setSecretCopied(false);
      await reloadEntry({ preserveIssuedCredential: true });
    } catch (nextError: unknown) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    } finally {
      setSubmittingCredential(false);
    }
  }

  async function copySecret() {
    if (!issuedCredential?.plaintextKey || typeof navigator === "undefined") {
      return;
    }

    await navigator.clipboard.writeText(issuedCredential.plaintextKey);
    setSecretCopied(true);
  }

  function downloadSecret() {
    if (!issuedCredential || typeof document === "undefined") {
      return;
    }

    const payload = [
      `entry_slug=${entry?.entrySlug ?? ""}`,
      `partner_id=${entry?.partnerId ?? ""}`,
      `issued_at=${issuedCredential.credential.createdAt}`,
      `scope=${credentialScope}`,
      `plaintext_key=${issuedCredential.plaintextKey}`,
    ].join("\n");

    const blob = new Blob([payload], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${entry?.entrySlug ?? "partner-entry"}-credential.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div style={pageShellStyle}>
        <div style={pageBodyStyle}>
          <div style={emptyStateStyle}>{t("partners.loading")}</div>
        </div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div style={pageShellStyle}>
        <CanvasPageHeader
          theme={theme}
          title={copy.title}
          subtitle={copy.notFound}
          actions={
            <Link href="/partners" style={linkButtonStyle()}>
              {copy.back}
            </Link>
          }
        />
        <div style={pageBodyStyle}>
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.unavailableTitle}
            body={error ?? copy.notFound}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={pageShellStyle}>
      <CanvasPageHeader
        theme={theme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            {bankLabel} · {programLabel}
            <CanvasPill
              theme={theme}
              tone={statusTone}
              dot={entry.status === "active"}
            >
              {formatPlatformCodeLabel(locale, entry.status)}
            </CanvasPill>
          </span>
        }
        subtitle={`/${entry.entrySlug} · partner_id ${entry.partnerId}`}
        tabs={copy.tabs}
        activeTab="credentials"
        actions={
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            {previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                style={linkButtonStyle("secondary")}
              >
                {copy.preview}
              </a>
            ) : null}
            <CanvasBtn
              theme={theme}
              variant="secondary"
              disabled={submittingCredential || entry.status === "revoked"}
              onClick={() => {
                setPendingCredentialAction({
                  mode: "issue",
                  title: copy.issueCredentialTitle,
                });
                setCredentialActionReason("");
              }}
            >
              {copy.issueCredentialTitle}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="secondary"
              disabled={submittingCredential || entry.status === "revoked"}
              onClick={() => {
                setPendingCredentialAction({
                  mode: "rotate",
                  title: copy.rotateCredentialTitle,
                });
                setCredentialActionReason("");
              }}
            >
              {copy.rotateCredentialTitle}
            </CanvasBtn>
            <CanvasBtn
              theme={theme}
              variant="ghost"
              onClick={() => void reloadEntry()}
            >
              {t("common.refresh")}
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        <div id="overview" style={sectionAnchorStyle}>
          <div
            style={
              isCompactViewport ? { ...stackStyle } : { ...twoColumnStyle }
            }
          >
            <CanvasCard
              theme={theme}
              title={copy.overviewTitle}
              subtitle={copy.overviewSubtitle}
              actions={
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <CanvasPill theme={theme} tone={statusTone} dot>
                    {formatPlatformCodeLabel(locale, entry.status)}
                  </CanvasPill>
                  <CanvasPill theme={theme} tone="info">
                    {formatPlatformCodeLabel(locale, entry.authMode)}
                  </CanvasPill>
                  <CanvasPill theme={theme} tone="accent">
                    {formatPlatformCodeLabel(locale, entry.eligibilityMode)}
                  </CanvasPill>
                </div>
              }
            >
              <CanvasDL
                theme={theme}
                items={overviewItems}
                cols={isCompactViewport ? 1 : 2}
              />
            </CanvasCard>

            <div style={stackStyle}>
              <CanvasCard
                theme={theme}
                title={copy.readinessTitle}
                subtitle={copy.readinessSubtitle}
              >
                <div style={compactStackStyle}>
                  <CanvasBanner
                    theme={theme}
                    tone={readinessBannerTone}
                    title={
                      readinessComplete ? copy.readyTitle : copy.blockedTitle
                    }
                    body={readinessComplete ? copy.readyBody : copy.blockedBody}
                  />
                  <div style={compactStackStyle}>
                    {readinessItems.map((item, index) => (
                      <div
                        key={`${item.label}-${index}`}
                        style={{
                          ...readinessRowBaseStyle,
                          borderBottom:
                            index === readinessItems.length - 1
                              ? "none"
                              : readinessRowBaseStyle.borderBottom,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: 10,
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              ...badgeDotStyle,
                              background: item.ready
                                ? theme.successBg
                                : theme.warnBg,
                              color: item.ready ? theme.success : theme.warn,
                            }}
                          >
                            <CanvasIcon
                              name={item.ready ? "check" : "warn"}
                              size={12}
                              stroke={2}
                            />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: theme.text,
                              }}
                            >
                              {item.label}
                            </div>
                            <div
                              style={{
                                ...mutedTextStyle,
                                overflowWrap: "anywhere",
                              }}
                            >
                              {item.value}
                            </div>
                          </div>
                        </div>
                        <CanvasPill
                          theme={theme}
                          tone={item.ready ? "success" : "warn"}
                        >
                          {item.ready
                            ? t("partners.ready")
                            : t("partners.missing")}
                        </CanvasPill>
                      </div>
                    ))}
                  </div>
                </div>
              </CanvasCard>

              <div id="credentials" style={sectionAnchorStyle}>
                <CanvasCard
                  theme={theme}
                  title={copy.credentialsTitle}
                  subtitle={copy.credentialsSubtitle}
                >
                  {credentialRows.length > 0 ? (
                    <CanvasTable
                      theme={theme}
                      dense
                      columns={credentialColumns}
                      rows={credentialRows}
                    />
                  ) : (
                    <CanvasBanner
                      theme={theme}
                      tone="info"
                      title={copy.credentialsTitle}
                      body={copy.credentialsEmpty}
                    />
                  )}
                </CanvasCard>
              </div>
            </div>
          </div>
        </div>

        <div style={isCompactViewport ? stackStyle : secondaryGridStyle}>
          <div id="branding" style={sectionAnchorStyle}>
            <CanvasCard
              theme={theme}
              title={copy.brandingTitle}
              subtitle={copy.brandingSubtitle}
            >
              <div style={compactStackStyle}>
                <CanvasDL theme={theme} items={brandingItems} cols={1} />
                {previewUrl ? (
                  <div style={mutedTextStyle}>
                    {copy.routeHint}: {previewUrl}
                  </div>
                ) : null}
                {entry.themeAccent ? (
                  <div style={mutedTextStyle}>
                    {copy.accentHint}: {entry.themeAccent}
                  </div>
                ) : null}
              </div>
            </CanvasCard>
          </div>

          <div id="auth" style={sectionAnchorStyle}>
            <CanvasCard
              theme={theme}
              title={copy.authTitle}
              subtitle={copy.authSubtitle}
            >
              <div style={compactStackStyle}>
                <CanvasBanner
                  theme={theme}
                  tone={
                    entry.authMode !== "partner_api_key"
                      ? "info"
                      : activeCredentialCount > 0
                        ? "success"
                        : "warn"
                  }
                  title={copy.authTitle}
                  body={
                    entry.authMode !== "partner_api_key"
                      ? locale === "en"
                        ? "This entry does not require partner-managed ingress credentials."
                        : "此 entry 不需要 partner-managed ingress credential。"
                      : activeCredentialCount > 0
                        ? locale === "en"
                          ? `${activeCredentialCount} active credential(s) can gate ingress traffic.`
                          : `${activeCredentialCount} 筆有效憑證可作為 ingress traffic gate。`
                        : locale === "en"
                          ? "Partner API key mode is active, but no usable ingress credential is available."
                          : "partner API key 模式已啟用，但目前沒有可用的 ingress credential。"
                  }
                />
                <CanvasDL theme={theme} items={authItems} cols={1} />
              </div>
            </CanvasCard>
          </div>
        </div>

        <div id="eligibility" style={sectionAnchorStyle}>
          <CanvasCard
            theme={theme}
            title={copy.eligibilityTitle}
            subtitle={copy.eligibilitySubtitle}
          >
            <div style={compactStackStyle}>
              <CanvasBanner
                theme={theme}
                tone={
                  entry.eligibilityMode === "none"
                    ? "info"
                    : entry.eligibilityContract?.contractId
                      ? "accent"
                      : "warn"
                }
                title={copy.eligibilityTitle}
                body={
                  entry.eligibilityMode === "none"
                    ? locale === "en"
                      ? "No partner-side eligibility verification is required before fulfillment."
                      : "此流程在 fulfill 前不要求 partner-side eligibility verification。"
                    : entry.eligibilityContract?.contractId
                      ? locale === "en"
                        ? "Eligibility remains platform-governed and is backed by the linked contract snapshot."
                        : "Eligibility 仍由平台治理，且已有對應 contract snapshot。"
                      : locale === "en"
                        ? "No eligibility contract snapshot is linked to this entry yet."
                        : "此 entry 尚未綁定 eligibility contract snapshot。"
                }
              />
              <CanvasDL
                theme={theme}
                items={eligibilityItems}
                cols={isCompactViewport ? 1 : 2}
              />
              {entry.eligibilityContract?.notes?.[0] ? (
                <div style={mutedTextStyle}>
                  {entry.eligibilityContract.notes[0]}
                </div>
              ) : null}
            </div>
          </CanvasCard>
        </div>

        <div id="audit" style={sectionAnchorStyle}>
          <CanvasCard
            theme={theme}
            title={copy.auditTitle}
            subtitle={copy.auditSubtitle}
            actions={
              <CanvasPill theme={theme} tone={statusTone}>
                {formatPlatformCodeLabel(locale, entry.status)}
              </CanvasPill>
            }
          >
            <div style={compactStackStyle}>
              {entry.revokedAt ? (
                <CanvasBanner
                  theme={theme}
                  tone="danger"
                  title={copy.statusRevoked}
                  body={entry.revokeReason ?? copy.statusRevokedBody}
                />
              ) : null}
              <CanvasDL
                theme={theme}
                items={auditItems}
                cols={isCompactViewport ? 1 : 2}
              />
            </div>
          </CanvasCard>
        </div>
      </div>

      {pendingCredentialAction ? (
        <ModalShell
          title={pendingCredentialAction.title}
          subtitle={entry.displayName}
          closeLabel={copy.close}
          canClose={!submittingCredential}
          onClose={() => {
            if (!submittingCredential) {
              setPendingCredentialAction(null);
              setCredentialActionReason("");
            }
          }}
          footer={
            <>
              <div style={mutedTextStyle}>{copy.credentialActionHint}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <CanvasBtn
                  theme={theme}
                  variant="ghost"
                  disabled={submittingCredential}
                  onClick={() => {
                    setPendingCredentialAction(null);
                    setCredentialActionReason("");
                  }}
                >
                  {copy.cancel}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  disabled={
                    submittingCredential || !credentialActionReason.trim()
                  }
                  onClick={() => void submitCredentialAction()}
                >
                  {submittingCredential
                    ? t("partners.rotatingCredential")
                    : pendingCredentialAction.mode === "issue"
                      ? copy.confirmIssue
                      : copy.confirmRotate}
                </CanvasBtn>
              </div>
            </>
          }
        >
          <CanvasBanner
            theme={theme}
            tone="warn"
            title={pendingCredentialAction.title}
            body={copy.credentialActionHint}
          />
          <CanvasField theme={theme} label={copy.credentialActionReasonLabel}>
            <input
              value={credentialActionReason}
              onChange={(event) =>
                setCredentialActionReason(event.target.value)
              }
              placeholder={copy.credentialActionReasonPlaceholder}
              style={{
                width: "100%",
                minHeight: 32,
                boxSizing: "border-box",
                padding: "7px 10px",
                borderRadius: 7,
                border: `1px solid ${theme.border}`,
                background: theme.bgRaised,
                color: theme.text,
                fontSize: 12.5,
                lineHeight: 1.4,
                fontFamily: theme.fontFamily,
                outline: "none",
              }}
            />
          </CanvasField>
        </ModalShell>
      ) : null}

      {issuedCredential ? (
        <ModalShell
          title={copy.oneTimeSecretTitle}
          subtitle={`${entry.displayName} · ${entry.entrySlug}`}
          closeLabel={copy.close}
          canClose={secretAcknowledged}
          onClose={() => {
            setIssuedCredential(null);
            setSecretAcknowledged(false);
            setSecretCopied(false);
          }}
          footer={
            <>
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 12.5,
                  color: theme.text,
                }}
              >
                <input
                  type="checkbox"
                  checked={secretAcknowledged}
                  onChange={(event) =>
                    setSecretAcknowledged(event.target.checked)
                  }
                />
                <span>{copy.oneTimeSecretAck}</span>
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => void copySecret()}
                >
                  {secretCopied ? copy.copied : copy.copySecret}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="secondary"
                  onClick={() => downloadSecret()}
                >
                  {copy.downloadSecret}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  disabled={!secretAcknowledged}
                  onClick={() => {
                    setIssuedCredential(null);
                    setSecretAcknowledged(false);
                    setSecretCopied(false);
                  }}
                >
                  {copy.dismissSecret}
                </CanvasBtn>
              </div>
            </>
          }
        >
          <CanvasBanner
            theme={theme}
            tone="warn"
            title={copy.oneTimeSecretTitle}
            body={copy.oneTimeSecretHint}
          />
          <div style={compactStackStyle}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: 4,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceLo,
                }}
              >
                <strong>{copy.secretIssuedLabel}</strong>
                <span style={mutedTextStyle}>
                  {formatDateTime(issuedCredential.credential.createdAt)}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 4,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceLo,
                }}
              >
                <strong>{copy.secretScopeLabel}</strong>
                <span style={mutedTextStyle}>{credentialScope}</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 4,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: theme.surfaceLo,
                }}
              >
                <strong>{copy.secretExpiryLabel}</strong>
                <span style={mutedTextStyle}>
                  {copy.secretUnavailableExpiry}
                </span>
              </div>
            </div>
            <CanvasField theme={theme} label={copy.secretLabel}>
              <div style={monoBlockStyle}>{issuedCredential.plaintextKey}</div>
            </CanvasField>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
