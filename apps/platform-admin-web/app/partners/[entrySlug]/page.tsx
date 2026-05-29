"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_ENTRY_FORM,
  buildPartnerReadinessItems,
  partnerStatusTone,
  toPartnerFormState,
  toPartnerUpdateCommand,
  type EntryFormState,
} from "@/components/partner-governance-shared";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  PARTNER_ENTRY_AUTH_MODES,
  PARTNER_ELIGIBILITY_MODES,
  type BusinessDispatchSubtype,
  type PartnerChannelEntryRecord,
  type PartnerEntryAuthMode,
  type PartnerEligibilityMode,
  type PartnerIngressCredentialIssued,
  type PartnerIngressCredentialRecord,
} from "@drts/contracts";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
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

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies React.CSSProperties;

const sideStackStyle = {
  display: "grid",
  gap: 16,
} satisfies React.CSSProperties;

const saveBarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${theme.border}`,
  background: theme.surface,
} satisfies React.CSSProperties;

const mutedTextStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
} satisfies React.CSSProperties;

const sectionAnchorStyle = {
  scrollMarginTop: 92,
} satisfies React.CSSProperties;

function heroGridStyle(isCompact: boolean) {
  return {
    display: "grid",
    gridTemplateColumns: isCompact
      ? "minmax(0, 1fr)"
      : "minmax(0, 1.4fr) minmax(320px, 1fr)",
    gap: 16,
    alignItems: "start",
  } satisfies React.CSSProperties;
}

function detailGridStyle(isCompact: boolean) {
  return {
    display: "grid",
    gridTemplateColumns: isCompact
      ? "minmax(0, 1fr)"
      : "repeat(2, minmax(0, 1fr))",
    gap: 16,
  } satisfies React.CSSProperties;
}

function fieldGridStyle(isCompact: boolean) {
  return {
    display: "grid",
    gridTemplateColumns: isCompact
      ? "minmax(0, 1fr)"
      : "repeat(2, minmax(0, 1fr))",
    gap: 12,
  } satisfies React.CSSProperties;
}

function readinessItemStyle(ready: boolean) {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: `1px solid ${theme.border}`,
    color: ready ? theme.text : theme.textMuted,
  } satisfies React.CSSProperties;
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

function controlStyle({
  mono = false,
  disabled = false,
}: {
  mono?: boolean;
  disabled?: boolean;
} = {}) {
  return {
    width: "100%",
    minHeight: 32,
    boxSizing: "border-box",
    padding: "7px 10px",
    borderRadius: 7,
    border: `1px solid ${theme.border}`,
    background: disabled ? theme.surfaceLo : theme.bgRaised,
    color: disabled ? theme.textDim : theme.text,
    fontSize: 12.5,
    lineHeight: 1.4,
    fontFamily: mono ? theme.monoFamily : theme.fontFamily,
    outline: "none",
    opacity: disabled ? 0.72 : 1,
  } satisfies React.CSSProperties;
}

function toCanvasTone(
  tone: ReturnType<typeof partnerStatusTone>,
): "neutral" | "success" | "warn" | "danger" {
  if (tone === "warning") {
    return "warn";
  }
  return tone;
}

function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
  mono = false,
  required = false,
  disabled = false,
}: {
  label: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  hint?: React.ReactNode;
  placeholder?: string;
  mono?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Field theme={theme} label={label} hint={hint} required={required}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={controlStyle({ mono, disabled })}
      />
    </Field>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  formatOption,
  hint,
}: {
  label: React.ReactNode;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  formatOption: (value: string) => string;
  hint?: React.ReactNode;
}) {
  return (
    <Field theme={theme} label={label} hint={hint}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        style={controlStyle()}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOption(option)}
          </option>
        ))}
      </select>
    </Field>
  );
}

type CredentialRow = Record<string, unknown> & {
  keyId: string;
  masked: string;
  source: string;
  createdAt: string;
  lastUsedAt: string;
  revokedAt: string | null;
};

export default function PartnerDetailPage() {
  const params = useParams<{ entrySlug: string }>();
  const entrySlug = Array.isArray(params?.entrySlug)
    ? params.entrySlug[0]
    : (params?.entrySlug ?? "");
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [entry, setEntry] = useState<PartnerChannelEntryRecord | null>(null);
  const [editForm, setEditForm] = useState<EntryFormState>(EMPTY_ENTRY_FORM);
  const [credentials, setCredentials] = useState<
    PartnerIngressCredentialRecord[]
  >([]);
  const [issuedCredential, setIssuedCredential] =
    useState<PartnerIngressCredentialIssued | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);
  const [issuingCredential, setIssuingCredential] = useState(false);
  const [revokingCredentialId, setRevokingCredentialId] = useState<
    string | null
  >(null);
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
          refresh: "Refresh",
          preview: "Preview entry",
          save: "Save changes",
          saveHint:
            "Applies branding, routing, auth, and eligibility edits for this partner-facing entry.",
          title: "Partner entry detail",
          unavailableTitle: "Partner entry unavailable",
          notFound: "Partner entry not found.",
          errorTitle: "Unable to update partner entry",
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
          readinessTitle: "Readiness checks",
          readinessSubtitle:
            "Keep activation blocked until branding, routing, contract, and credential gates are green.",
          credentialsTitle: "Active credentials",
          credentialsSubtitle:
            "Ingress material is shown once at issue time and stays platform-governed afterward.",
          brandingTitle: "Branding",
          brandingSubtitle:
            "Partner-facing display, route, accent, and support metadata.",
          authTitle: "Auth",
          authSubtitle:
            "Auth authority, partner identity, and lifecycle control remain on the platform side.",
          eligibilityTitle: "Eligibility",
          eligibilitySubtitle:
            "Contract snapshot, adapter posture, and fallback policy for this entry.",
          auditTitle: "Audit",
          auditSubtitle:
            "Creation, update, revocation, and request lineage for platform review.",
          lifecycleLabel: "Lifecycle",
          readinessLabel: "Readiness",
          activeCredentialsLabel: "Active credentials",
          auditSourceLabel: "Audit source",
          updatedLabel: "Last updated",
          readyTitle: "Ready to promote",
          blockedTitle: "Readiness gaps remain",
          readyBody:
            "Checklist is clear. This entry can be promoted without hiding platform governance boundaries.",
          blockedBody:
            "Do not activate external traffic until the remaining readiness gaps are resolved.",
          contractEmpty:
            "No eligibility contract snapshot is linked to this entry yet.",
          routeHint: "Public route preview",
          accentHint: "Brand accent delivered to the entry skin",
          authBannerTitle: "Credential posture",
          eligibilityBannerTitle: "Contract posture",
        }
      : {
          back: "返回 partner entries",
          refresh: "重新整理",
          preview: "預覽 entry",
          save: "儲存變更",
          saveHint:
            "儲存會同步更新此 partner-facing entry 的 branding、routing、auth 與 eligibility 設定。",
          title: "Partner entry 詳情",
          unavailableTitle: "Partner entry 目前不可用",
          notFound: "找不到此 partner entry。",
          errorTitle: "Partner entry 更新失敗",
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
            "集中檢視平台治理下的 partner routing、識別與上線姿態。",
          readinessTitle: "Readiness 檢查",
          readinessSubtitle:
            "在 branding、routing、contract 與 credential gate 全部轉綠前，不應直接啟用流量。",
          credentialsTitle: "Active credentials",
          credentialsSubtitle:
            "入口憑證只會在核發當下顯示一次，之後持續由平台治理。",
          brandingTitle: "Branding",
          brandingSubtitle:
            "partner-facing entry 的顯示名稱、入口路由、色彩與支援資訊。",
          authTitle: "Auth",
          authSubtitle:
            "驗證權限、合作方識別與 lifecycle control 都應保留在平台側。",
          eligibilityTitle: "Eligibility",
          eligibilitySubtitle:
            "檢視此 entry 的資格驗證模式、契約快照、adapter posture 與 fallback policy。",
          auditTitle: "Audit",
          auditSubtitle:
            "建立、更新、撤銷與 request lineage 都需保留給平台稽核。",
          lifecycleLabel: "Lifecycle",
          readinessLabel: "Readiness",
          activeCredentialsLabel: "有效憑證",
          auditSourceLabel: "Audit 來源",
          updatedLabel: "最近更新",
          readyTitle: "可推進上線",
          blockedTitle: "仍有 readiness 缺口",
          readyBody:
            "Checklist 已補齊，可在不模糊平台治理邊界的前提下推進流量啟用。",
          blockedBody: "在剩餘 gate 補齊前，不應讓外部流量直接進入此 entry。",
          contractEmpty: "此 entry 尚未綁定 eligibility contract snapshot。",
          routeHint: "公開入口預覽",
          accentHint: "交付到 entry skin 的品牌 accent",
          authBannerTitle: "憑證姿態",
          eligibilityBannerTitle: "契約姿態",
        };

  const loadEntry = useCallback(
    async (options?: { preserveIssuedCredential?: boolean }) => {
      if (!entrySlug) {
        setEntry(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const entries = await client.listPlatformPartnerEntries();
        const selected =
          entries.items.find(
            (candidate) => candidate.entrySlug === entrySlug,
          ) ?? null;

        setEntry(selected);
        setEditForm(selected ? toPartnerFormState(selected) : EMPTY_ENTRY_FORM);

        if (!options?.preserveIssuedCredential) {
          setIssuedCredential(null);
        }

        if (selected) {
          const nextCredentials =
            await client.listPlatformPartnerIngressCredentials(
              selected.entrySlug,
            );
          setCredentials(nextCredentials ?? []);
        } else {
          setCredentials([]);
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        setEntry(null);
        setEditForm(EMPTY_ENTRY_FORM);
        setCredentials([]);
      } finally {
        setLoading(false);
      }
    },
    [client, entrySlug],
  );

  useEffect(() => {
    void loadEntry();
  }, [loadEntry]);

  const saveEntry = useCallback(async () => {
    if (!entry) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await client.updatePlatformPartnerEntry(
        entry.entrySlug,
        toPartnerUpdateCommand(editForm),
      );
      await loadEntry();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [client, editForm, entry, loadEntry]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    await saveEntry();
  };

  const setEntryStatus = useCallback(
    async (nextStatus: "active" | "inactive" | "revoked") => {
      if (!entry) {
        return;
      }

      setChangingStatus(nextStatus);
      setError(null);

      try {
        if (nextStatus === "active") {
          await client.activatePlatformPartnerEntry(entry.entrySlug);
        } else if (nextStatus === "inactive") {
          await client.deactivatePlatformPartnerEntry(entry.entrySlug);
        } else {
          await client.revokePlatformPartnerEntry(entry.entrySlug);
        }

        await loadEntry();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setChangingStatus(null);
      }
    },
    [client, entry, loadEntry],
  );

  const issueCredential = useCallback(async () => {
    if (!entry) {
      return;
    }

    setIssuingCredential(true);
    setError(null);

    try {
      const issued = await client.issuePlatformPartnerIngressCredential(
        entry.entrySlug,
        {},
      );
      setIssuedCredential(issued);
      await loadEntry({ preserveIssuedCredential: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIssuingCredential(false);
    }
  }, [client, entry, loadEntry]);

  const revokeCredential = useCallback(
    async (keyId: string) => {
      if (!entry) {
        return;
      }

      setRevokingCredentialId(keyId);
      setError(null);

      try {
        await client.revokePlatformPartnerIngressCredential(
          entry.entrySlug,
          keyId,
          {},
        );
        await loadEntry();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRevokingCredentialId(null);
      }
    },
    [client, entry, loadEntry],
  );

  const updateFormField = <Key extends keyof EntryFormState>(
    key: Key,
    value: EntryFormState[Key],
  ) => {
    setEditForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

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

  const readinessReadyCount = readinessItems.filter(
    (item) => item.ready,
  ).length;
  const readinessMissingCount = readinessItems.length - readinessReadyCount;
  const readinessComplete =
    readinessItems.length > 0 && readinessItems.every((item) => item.ready);

  const previewUrl =
    entry?.entryHost && entry?.entryPath
      ? `https://${entry.entryHost}${entry.entryPath}`
      : null;

  const supportValue = useMemo(() => {
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
        v: `${entry.partnerCode} · ${entry.programId}`,
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
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: entry.themeAccent,
                border: `1px solid ${theme.border}`,
                flexShrink: 0,
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
        v: supportValue,
      },
    ];
  }, [entry, locale, supportValue]);

  const eligibilitySnapshotItems = useMemo(() => {
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
          masked: `${credential.keyPrefix}${credential.maskedSuffix}`,
          source: credential.source,
          createdAt: formatDateTime(credential.createdAt),
          lastUsedAt: credential.lastUsedAt
            ? formatDateTime(credential.lastUsedAt)
            : "—",
          revokedAt: credential.revokedAt,
        })),
    [credentials],
  );

  const credentialColumns = useMemo<CanvasTableColumn<CredentialRow>[]>(
    () => [
      {
        h: locale === "en" ? "masked" : "憑證",
        k: "masked",
        mono: true,
        w: 180,
      },
      {
        h: locale === "en" ? "source" : "來源",
        k: "source",
        mono: true,
        w: 160,
      },
      {
        h: locale === "en" ? "created" : "建立",
        k: "createdAt",
        mono: true,
        w: 160,
      },
      {
        h: locale === "en" ? "last used" : "最後使用",
        k: "lastUsedAt",
        mono: true,
        w: 160,
      },
      {
        h: locale === "en" ? "status" : "狀態",
        w: 110,
        r: (row) => (
          <Pill
            theme={theme}
            tone={row.revokedAt ? "danger" : "success"}
            dot={!row.revokedAt}
          >
            {row.revokedAt
              ? t("partners.credentialStatus.revoked")
              : t("partners.credentialStatus.active")}
          </Pill>
        ),
      },
      {
        h: "",
        w: 116,
        r: (row) =>
          row.revokedAt ? (
            <span style={mutedTextStyle}>—</span>
          ) : (
            <Btn
              theme={theme}
              variant="secondary"
              size="xs"
              disabled={revokingCredentialId === row.keyId}
              onClick={() => void revokeCredential(row.keyId)}
            >
              {revokingCredentialId === row.keyId
                ? t("partners.revokingCredential")
                : t("partners.revokeCredential")}
            </Btn>
          ),
      },
    ],
    [locale, revokeCredential, revokingCredentialId, t],
  );

  if (loading) {
    return <div style={emptyStateStyle}>{t("partners.loading")}</div>;
  }

  if (!entry) {
    return (
      <div style={pageShellStyle}>
        <PageHeader
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
          <Banner
            theme={theme}
            tone="danger"
            title={copy.unavailableTitle}
            body={error ?? copy.notFound}
          />
        </div>
      </div>
    );
  }

  const statusTone = toCanvasTone(partnerStatusTone(entry.status));
  const lifecycleAction =
    entry.status === "active" ? (
      <Btn
        theme={theme}
        variant="secondary"
        disabled={changingStatus === "inactive"}
        onClick={() => void setEntryStatus("inactive")}
      >
        {t("partners.deactivate")}
      </Btn>
    ) : entry.status === "inactive" ? (
      <Btn
        theme={theme}
        variant="primary"
        disabled={changingStatus === "active"}
        onClick={() => void setEntryStatus("active")}
      >
        {t("partners.activate")}
      </Btn>
    ) : null;

  const credentialBannerTone =
    entry.authMode !== "partner_api_key"
      ? "info"
      : activeCredentialCount > 0
        ? "success"
        : "warn";

  return (
    <div style={pageShellStyle}>
      <PageHeader
        theme={theme}
        title={`${entry.displayName}`}
        subtitle={`/${entry.entrySlug} · ${entry.partnerCode} · ${entry.programId}`}
        tabs={copy.tabs}
        activeTab={copy.tabs[0]}
        actions={
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <Link href="/partners" style={linkButtonStyle()}>
              {copy.back}
            </Link>
            <Btn
              theme={theme}
              variant="secondary"
              onClick={() => void loadEntry()}
            >
              {copy.refresh}
            </Btn>
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
            {lifecycleAction}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {error ? (
          <Banner
            theme={theme}
            tone="danger"
            title={copy.errorTitle}
            body={error}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={copy.lifecycleLabel}
            value={formatPlatformCodeLabel(locale, entry.status)}
            sub={entry.activeFlag ? "active flag on" : "active flag off"}
            hint={formatDateTime(entry.updatedAt)}
          />
          <KPI
            theme={theme}
            label={copy.readinessLabel}
            value={`${readinessReadyCount}/${readinessItems.length}`}
            sub={
              readinessComplete
                ? copy.readyTitle
                : `${readinessMissingCount} ${locale === "en" ? "gap(s)" : "項缺口"}`
            }
            hint={copy.updatedLabel}
          />
          <KPI
            theme={theme}
            label={copy.activeCredentialsLabel}
            value={activeCredentialCount}
            sub={
              credentials[0]?.lastUsedAt
                ? `${locale === "en" ? "Last used" : "最後使用"} ${formatDateTime(
                    credentials[0].lastUsedAt,
                  )}`
                : locale === "en"
                  ? "No last-used telemetry yet"
                  : "目前尚無 last-used telemetry"
            }
            hint={`${credentials.length} ${locale === "en" ? "issued total" : "筆已核發"}`}
          />
          <KPI
            theme={theme}
            label={copy.auditSourceLabel}
            value={entry.auditMetadata.source ?? "—"}
            sub={entry.auditMetadata.requestId ?? "—"}
            hint={formatDateTime(entry.updatedAt)}
          />
        </div>

        <div id="overview" style={sectionAnchorStyle}>
          <div style={heroGridStyle(isCompactViewport)}>
            <Card
              theme={theme}
              title={copy.overviewTitle}
              subtitle={copy.overviewSubtitle}
              actions={
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Pill theme={theme} tone={statusTone} dot>
                    {formatPlatformCodeLabel(locale, entry.status)}
                  </Pill>
                  <Pill theme={theme} tone="info">
                    {formatPlatformCodeLabel(locale, entry.authMode)}
                  </Pill>
                  <Pill theme={theme} tone="accent">
                    {formatPlatformCodeLabel(locale, entry.eligibilityMode)}
                  </Pill>
                </div>
              }
            >
              <DL
                theme={theme}
                items={overviewItems}
                cols={isCompactViewport ? 1 : 2}
              />
            </Card>

            <div style={sideStackStyle}>
              <Card
                theme={theme}
                title={copy.readinessTitle}
                subtitle={copy.readinessSubtitle}
              >
                <div style={{ display: "grid", gap: 10 }}>
                  <Banner
                    theme={theme}
                    tone={
                      readinessComplete
                        ? "success"
                        : entry.status === "active"
                          ? "danger"
                          : "warn"
                    }
                    title={
                      readinessComplete ? copy.readyTitle : copy.blockedTitle
                    }
                    body={readinessComplete ? copy.readyBody : copy.blockedBody}
                  />

                  <div style={{ display: "grid" }}>
                    {readinessItems.map((item, index) => (
                      <div
                        key={`${item.label}-${index}`}
                        style={{
                          ...readinessItemStyle(item.ready),
                          borderBottom:
                            index === readinessItems.length - 1
                              ? "none"
                              : readinessItemStyle(item.ready).borderBottom,
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
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 20,
                              height: 20,
                              borderRadius: "50%",
                              background: item.ready
                                ? theme.successBg
                                : theme.warnBg,
                              color: item.ready ? theme.success : theme.warn,
                              flexShrink: 0,
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

                        <Pill
                          theme={theme}
                          tone={item.ready ? "success" : "warn"}
                        >
                          {item.ready
                            ? t("partners.ready")
                            : t("partners.missing")}
                        </Pill>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <div id="credentials" style={sectionAnchorStyle}>
                <Card
                  theme={theme}
                  title={copy.credentialsTitle}
                  subtitle={copy.credentialsSubtitle}
                  actions={
                    <Btn
                      theme={theme}
                      variant="secondary"
                      disabled={issuingCredential || entry.status === "revoked"}
                      onClick={() => void issueCredential()}
                    >
                      {issuingCredential
                        ? t("partners.rotatingCredential")
                        : t("partners.rotateCredential")}
                    </Btn>
                  }
                >
                  <div style={{ display: "grid", gap: 12 }}>
                    {issuedCredential ? (
                      <Banner
                        theme={theme}
                        tone="info"
                        title={t("partners.plaintextCredential")}
                        body={issuedCredential.plaintextKey}
                      />
                    ) : null}

                    {credentialRows.length > 0 ? (
                      <Table<CredentialRow>
                        theme={theme}
                        dense
                        columns={credentialColumns}
                        rows={credentialRows}
                      />
                    ) : (
                      <Banner
                        theme={theme}
                        tone="info"
                        title={copy.credentialsTitle}
                        body={t("partners.emptyCredentials")}
                      />
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} style={{ display: "grid", gap: 16 }}>
          <div id="branding" style={sectionAnchorStyle}>
            <Card
              theme={theme}
              title={copy.brandingTitle}
              subtitle={copy.brandingSubtitle}
            >
              <div style={{ display: "grid", gap: 12 }}>
                <div style={fieldGridStyle(isCompactViewport)}>
                  <TextField
                    label={t("partners.form.displayName")}
                    value={editForm.displayName}
                    onChange={(value) => updateFormField("displayName", value)}
                    required
                  />
                  <TextField
                    label={t("partners.form.entryHost")}
                    value={editForm.entryHost}
                    onChange={(value) => updateFormField("entryHost", value)}
                    placeholder="partner.example"
                    mono
                  />
                  <TextField
                    label={t("partners.form.entryPath")}
                    value={editForm.entryPath}
                    onChange={(value) => updateFormField("entryPath", value)}
                    placeholder="/partner/bank-demo-alpha-airport"
                    mono
                    hint={
                      previewUrl
                        ? `${copy.routeHint}: ${previewUrl}`
                        : undefined
                    }
                  />
                  <TextField
                    label={t("partners.form.themeAccent")}
                    value={editForm.themeAccent}
                    onChange={(value) => updateFormField("themeAccent", value)}
                    placeholder="#0b7285"
                    mono
                    hint={copy.accentHint}
                  />
                  <TextField
                    label={t("partners.form.supportEmail")}
                    value={editForm.supportEmail}
                    onChange={(value) => updateFormField("supportEmail", value)}
                  />
                  <TextField
                    label={t("partners.form.supportPhone")}
                    value={editForm.supportPhone}
                    onChange={(value) => updateFormField("supportPhone", value)}
                  />
                </div>
              </div>
            </Card>
          </div>

          <div style={detailGridStyle(isCompactViewport)}>
            <div id="auth" style={sectionAnchorStyle}>
              <Card
                theme={theme}
                title={copy.authTitle}
                subtitle={copy.authSubtitle}
                actions={
                  entry.status !== "revoked" ? (
                    <Btn
                      theme={theme}
                      variant="secondary"
                      danger
                      disabled={changingStatus === "revoked"}
                      onClick={() => void setEntryStatus("revoked")}
                    >
                      {t("partners.revoke")}
                    </Btn>
                  ) : (
                    <Pill theme={theme} tone="danger">
                      {t("partners.status.revoked")}
                    </Pill>
                  )
                }
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <Banner
                    theme={theme}
                    tone={credentialBannerTone}
                    title={copy.authBannerTitle}
                    body={
                      entry.authMode === "partner_api_key"
                        ? activeCredentialCount > 0
                          ? locale === "en"
                            ? `${activeCredentialCount} active credential(s) can gate ingress traffic.`
                            : `${activeCredentialCount} 筆有效憑證可作為 ingress traffic gate。`
                          : locale === "en"
                            ? "Partner API key mode is active, but no usable ingress credential is available."
                            : "partner API key 模式已啟用，但目前沒有可用的 ingress credential。"
                        : locale === "en"
                          ? "This entry does not require partner-managed ingress credentials."
                          : "此 entry 不需要 partner-managed ingress credential。"
                    }
                  />

                  <div style={fieldGridStyle(isCompactViewport)}>
                    <TextField
                      label={t("partners.form.tenantId")}
                      value={editForm.tenantId}
                      onChange={(value) => updateFormField("tenantId", value)}
                      mono
                    />
                    <TextField
                      label={t("partners.form.partnerType")}
                      value={editForm.partnerType}
                      onChange={(value) =>
                        updateFormField("partnerType", value)
                      }
                      mono
                    />
                    <TextField
                      label={t("partners.form.partnerCode")}
                      value={editForm.partnerCode}
                      onChange={(value) =>
                        updateFormField("partnerCode", value)
                      }
                      mono
                    />
                    <TextField
                      label={t("partners.form.programId")}
                      value={editForm.programId}
                      onChange={(value) => updateFormField("programId", value)}
                      mono
                    />
                    <TextField
                      label={t("partners.form.programCode")}
                      value={editForm.programCode}
                      onChange={(value) =>
                        updateFormField("programCode", value)
                      }
                      mono
                    />
                    <TextField
                      label={t("partners.form.bankCode")}
                      value={editForm.bankCode}
                      onChange={(value) => updateFormField("bankCode", value)}
                      mono
                    />
                    <TextField
                      label={t("partners.form.entrySlug")}
                      value={editForm.entrySlug}
                      onChange={(value) => updateFormField("entrySlug", value)}
                      mono
                      disabled
                    />
                    <SelectField
                      label={t("partners.form.dispatchSubtype")}
                      value={editForm.businessDispatchSubtype}
                      options={BUSINESS_DISPATCH_SUBTYPES}
                      onChange={(value) =>
                        updateFormField(
                          "businessDispatchSubtype",
                          value as BusinessDispatchSubtype,
                        )
                      }
                      formatOption={(value) =>
                        formatPlatformCodeLabel(locale, value)
                      }
                    />
                    <SelectField
                      label={t("partners.form.authMode")}
                      value={editForm.authMode}
                      options={PARTNER_ENTRY_AUTH_MODES}
                      onChange={(value) =>
                        updateFormField(
                          "authMode",
                          value as PartnerEntryAuthMode,
                        )
                      }
                      formatOption={(value) =>
                        formatPlatformCodeLabel(locale, value)
                      }
                    />
                  </div>
                </div>
              </Card>
            </div>

            <div id="eligibility" style={sectionAnchorStyle}>
              <Card
                theme={theme}
                title={copy.eligibilityTitle}
                subtitle={copy.eligibilitySubtitle}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <Banner
                    theme={theme}
                    tone={
                      entry.eligibilityMode === "none"
                        ? "info"
                        : entry.eligibilityContract?.contractId
                          ? "accent"
                          : "warn"
                    }
                    title={copy.eligibilityBannerTitle}
                    body={
                      entry.eligibilityMode === "none"
                        ? locale === "en"
                          ? "No partner-side eligibility verification is required before fulfillment."
                          : "此流程在 fulfill 前不要求 partner-side eligibility verification。"
                        : entry.eligibilityContract?.contractId
                          ? locale === "en"
                            ? "Eligibility remains platform-governed and is backed by the linked contract snapshot."
                            : "Eligibility 仍由平台治理，且已有對應 contract snapshot。"
                          : copy.contractEmpty
                    }
                  />

                  <SelectField
                    label={t("partners.form.eligibilityMode")}
                    value={editForm.eligibilityMode}
                    options={PARTNER_ELIGIBILITY_MODES}
                    onChange={(value) =>
                      updateFormField(
                        "eligibilityMode",
                        value as PartnerEligibilityMode,
                      )
                    }
                    formatOption={(value) =>
                      formatPlatformCodeLabel(locale, value)
                    }
                  />

                  <DL
                    theme={theme}
                    items={eligibilitySnapshotItems}
                    cols={isCompactViewport ? 1 : 2}
                  />

                  {entry.eligibilityContract?.notes?.[0] ? (
                    <div style={mutedTextStyle}>
                      {entry.eligibilityContract.notes[0]}
                    </div>
                  ) : null}
                </div>
              </Card>
            </div>
          </div>

          <div style={saveBarStyle}>
            <div style={mutedTextStyle}>
              {copy.saveHint}
              <br />
              {copy.updatedLabel}: {formatDateTime(entry.updatedAt)}
            </div>
            <Btn
              theme={theme}
              variant="primary"
              disabled={saving || !editForm.displayName.trim()}
              onClick={() => void saveEntry()}
            >
              {saving ? t("common.saving") : copy.save}
            </Btn>
            <button type="submit" style={{ display: "none" }} />
          </div>
        </form>

        <div id="audit" style={sectionAnchorStyle}>
          <Card
            theme={theme}
            title={copy.auditTitle}
            subtitle={copy.auditSubtitle}
            actions={
              <Pill theme={theme} tone={statusTone}>
                {formatPlatformCodeLabel(locale, entry.status)}
              </Pill>
            }
          >
            <div style={{ display: "grid", gap: 12 }}>
              {entry.revokedAt ? (
                <Banner
                  theme={theme}
                  tone="danger"
                  title={locale === "en" ? "Entry revoked" : "Entry 已撤銷"}
                  body={
                    entry.revokeReason ??
                    (locale === "en"
                      ? "Traffic should remain blocked for this entry."
                      : "此 entry 應持續維持流量封鎖。")
                  }
                />
              ) : null}
              <DL
                theme={theme}
                items={auditItems}
                cols={isCompactViewport ? 1 : 2}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
