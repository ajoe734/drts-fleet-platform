"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { actionButtonStyle, emptyStateStyle } from "@/components/platform-ui";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EMPTY_ENTRY_FORM,
  EntryForm,
  buildPartnerReadinessItems,
  partnerStatusTone,
  toPartnerFormState,
  toPartnerUpdateCommand,
} from "@/components/partner-governance-shared";
import type {
  PartnerChannelEntryRecord,
  PartnerIngressCredentialIssued,
  PartnerIngressCredentialRecord,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataViewCard,
  DetailMetadataGrid,
  FilterPill,
  FilterPillRow,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  WorkflowPanel,
  WorkflowSplitLayout,
  type DetailListItem,
} from "@drts/ui-web";

const anchorSectionStyle = {
  display: "grid",
  gap: 12,
  scrollMarginTop: 96,
} satisfies React.CSSProperties;

function heroGridStyle(isCompact: boolean) {
  return {
    display: "grid",
    gridTemplateColumns: isCompact
      ? "minmax(0, 1fr)"
      : "minmax(0, 1.35fr) minmax(280px, 1fr)",
    gap: 16,
    alignItems: "start",
  } satisfies React.CSSProperties;
}

const statusSummaryGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies React.CSSProperties;

export default function PartnerDetailPage() {
  const params = useParams<{ entrySlug: string }>();
  const entrySlug = Array.isArray(params?.entrySlug)
    ? params.entrySlug[0]
    : (params?.entrySlug ?? "");
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [entry, setEntry] = useState<PartnerChannelEntryRecord | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_ENTRY_FORM);
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

    const mediaQuery = window.matchMedia("(max-width: 960px)");
    const syncViewport = () => setIsCompactViewport(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  const copy =
    locale === "en"
      ? {
          back: "Back to partner entries",
          title: "Partner entry detail",
          subtitle:
            "Review readiness, lifecycle, credentials, routing, and audit metadata from the platform side.",
          routingTitle: "Routing and branding",
          routingSubtitle:
            "Entry routing, partner identity, auth mode, and branding remain platform-governed surfaces.",
          overviewTitle: "Entry overview",
          overviewSubtitle:
            "Core identity, audit, and eligibility linkage for the selected entry.",
          authTitle: "Auth authority",
          authSubtitle:
            "Keep partner entry auth decisions explicit so rollout authority does not drift into tenant-owned settings.",
          eligibilityTitle: "Eligibility contract",
          eligibilitySubtitle:
            "Partner-side eligibility is governed by contract snapshots, fallback policy, and adapter posture.",
          readinessTitle: "Readiness checks",
          readinessSubtitle:
            "Do not enable the entry until every required routing, branding, and support dependency is present.",
          readinessBlocked:
            "This entry still has unresolved readiness gaps. Keep rollout authority on the platform side until every gate is green.",
          readinessReady:
            "Checklist is clear. The entry can be promoted without hiding platform authority boundaries.",
          lifecycleTitle: "Lifecycle controls",
          lifecycleSubtitle:
            "Lifecycle actions affect whether external traffic can reach this partner-facing entry.",
          credentialsTitle: "Active credentials",
          credentialsSubtitle:
            "Rotate ingress credentials here. Plaintext material is only shown once after issuance.",
          auditTitle: "Audit lineage",
          auditSubtitle:
            "Creation, update, revoke, and credential activity must remain visible for platform review.",
          navigationTitle: "Entry sections",
          navigationSubtitle:
            "Use anchored sections to keep overview, auth, eligibility, routing, readiness, credentials, and audit posture in the same review lane.",
          snapshotTitle: "Promotion posture",
          snapshotSubtitle:
            "Keep readiness, entry routing, and credential coverage visible before enabling partner-facing traffic.",
          nav: {
            overview: "Overview",
            auth: "Auth",
            eligibility: "Eligibility",
            routing: "Routing",
            readiness: "Readiness",
            lifecycle: "Lifecycle",
            credentials: "Credentials",
            audit: "Audit",
          },
          notFound: "Partner entry not found.",
          save: "Save entry",
          preview: "Preview route",
        }
      : {
          back: "返回 partner entries",
          title: "Partner entry 詳情",
          subtitle:
            "從平台側檢視 readiness、lifecycle、credentials、routing 與 audit metadata。",
          routingTitle: "Routing 與 branding",
          routingSubtitle:
            "Entry routing、partner identity、auth mode 與 branding 皆屬平台治理面。",
          overviewTitle: "Entry 概況",
          overviewSubtitle:
            "此 entry 的核心識別、audit 與 eligibility linkage。",
          authTitle: "Auth 治理權限",
          authSubtitle:
            "明確保留 partner entry 的 auth 決策在平台側，避免與 tenant 自主管理設定混淆。",
          eligibilityTitle: "Eligibility 契約",
          eligibilitySubtitle:
            "partner eligibility 由契約快照、fallback policy 與 adapter 狀態共同治理。",
          readinessTitle: "Readiness 檢查",
          readinessSubtitle:
            "在 routing、branding、support 依賴補齊前，不應直接啟用此 entry。",
          readinessBlocked:
            "此 entry 仍有未解 readiness 缺口；在所有 gate 轉綠前，應維持平台側 rollout authority。",
          readinessReady:
            "Checklist 已補齊；可在不模糊平台治理邊界的前提下推進上線。",
          lifecycleTitle: "Lifecycle controls",
          lifecycleSubtitle:
            "生命週期動作會直接影響外部流量是否能進入這個 partner-facing entry。",
          credentialsTitle: "有效憑證",
          credentialsSubtitle:
            "在此輪替 ingress credential；明文只會在發出後顯示一次。",
          auditTitle: "Audit 脈絡",
          auditSubtitle:
            "建立、更新、撤銷與 credential 活動都必須保留給平台稽核檢視。",
          navigationTitle: "Entry 區段",
          navigationSubtitle:
            "用 anchored sections 把 overview、auth、eligibility、routing、readiness、credentials 與 audit posture 放在同一條治理路徑裡檢視。",
          snapshotTitle: "Promotion posture",
          snapshotSubtitle:
            "在啟用 partner-facing 流量前，先把 readiness、entry routing 與 credential coverage 放在同一屏檢視。",
          nav: {
            overview: "Overview",
            auth: "Auth",
            eligibility: "Eligibility",
            routing: "Routing",
            readiness: "Readiness",
            lifecycle: "Lifecycle",
            credentials: "Credentials",
            audit: "Audit",
          },
          notFound: "找不到此 partner entry。",
          save: "儲存 entry",
          preview: "預覽路由",
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
          entries.find((candidate) => candidate.entrySlug === entrySlug) ??
          null;
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

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!entry) return;
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
  };

  const setEntryStatus = useCallback(
    async (nextStatus: "active" | "inactive" | "revoked") => {
      if (!entry) return;
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
    if (!entry) return;
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
      if (!entry) return;
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

  const detailItems = useMemo<DetailListItem[]>(() => {
    if (!entry) {
      return [];
    }
    return [
      {
        id: "tenant",
        label: "Tenant",
        value: entry.tenantId,
      },
      {
        id: "partner",
        label: locale === "en" ? "Partner / program" : "合作方 / 方案",
        value: `${entry.partnerCode} · ${entry.programId}`,
        hint: entry.programCode ?? undefined,
      },
      {
        id: "subtype",
        label: locale === "en" ? "Dispatch subtype" : "派單子類型",
        value: formatPlatformCodeLabel(locale, entry.businessDispatchSubtype),
      },
      {
        id: "entry-host",
        label: "Entry host",
        value: entry.entryHost ?? "—",
      },
      {
        id: "entry-path",
        label: "Entry path",
        value: entry.entryPath ?? "—",
      },
      {
        id: "audit-source",
        label: locale === "en" ? "Audit source" : "Audit 來源",
        value: entry.auditMetadata.source ?? "—",
      },
      {
        id: "eligibility-contract",
        label:
          locale === "en" ? "Eligibility contract" : "Eligibility contract",
        value: entry.eligibilityContract?.contractId ?? "—",
        hint: entry.eligibilityContract
          ? `${entry.eligibilityContract.adapterCode} · ${entry.eligibilityContract.adapterVersion}`
          : undefined,
        columnSpan: 2,
      },
    ];
  }, [entry, locale]);

  const authItems = useMemo<DetailListItem[]>(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        id: "auth-mode",
        label: locale === "en" ? "Auth mode" : "驗證模式",
        value: formatPlatformCodeLabel(locale, entry.authMode),
        hint:
          entry.authMode === "partner_api_key"
            ? locale === "en"
              ? "Platform-managed ingress secrets gate partner traffic."
              : "由平台管理 ingress secret，作為 partner 流量入口 gate。"
            : locale === "en"
              ? "Tenant portal bearer identity governs session entry."
              : "由 tenant portal bearer identity 管理進入流程。",
      },
      {
        id: "dispatch-subtype",
        label: locale === "en" ? "Dispatch subtype" : "派單子類型",
        value: formatPlatformCodeLabel(locale, entry.businessDispatchSubtype),
      },
      {
        id: "active-flag",
        label: locale === "en" ? "Rollout flag" : "Rollout 旗標",
        value: entry.activeFlag ? "active" : "inactive",
        hint:
          locale === "en"
            ? "Keep lifecycle status and rollout flag aligned."
            : "生命週期狀態與 rollout flag 應保持一致。",
      },
      {
        id: "credential-coverage",
        label: locale === "en" ? "Credential coverage" : "憑證覆蓋",
        value:
          entry.authMode === "partner_api_key"
            ? `${activeCredentialCount} active`
            : locale === "en"
              ? "Not required"
              : "不需要",
        tone:
          entry.authMode === "partner_api_key" && activeCredentialCount === 0
            ? "warning"
            : "success",
      },
    ];
  }, [activeCredentialCount, entry, locale]);

  const eligibilityItems = useMemo<DetailListItem[]>(() => {
    if (!entry) {
      return [];
    }

    const contract = entry.eligibilityContract;

    return [
      {
        id: "eligibility-mode",
        label: locale === "en" ? "Eligibility mode" : "資格驗證模式",
        value: formatPlatformCodeLabel(locale, entry.eligibilityMode),
        hint:
          entry.eligibilityMode === "none"
            ? locale === "en"
              ? "No partner-side verification required before fulfillment."
              : "此流程在 fulfill 前不要求 partner-side verification。"
            : locale === "en"
              ? "Eligibility remains a platform-governed pre-dispatch gate."
              : "Eligibility 仍屬平台治理的 pre-dispatch gate。",
      },
      {
        id: "contract-id",
        label: locale === "en" ? "Contract ID" : "契約 ID",
        value: contract?.contractId ?? "—",
        hint: contract
          ? `${contract.adapterCode} · ${contract.adapterVersion}`
          : undefined,
      },
      {
        id: "adapter-kind",
        label: locale === "en" ? "Adapter posture" : "Adapter 狀態",
        value: contract?.adapterKind ?? "—",
        hint: contract?.notes?.[0] ?? undefined,
      },
      {
        id: "fallback",
        label: locale === "en" ? "Manual fallback" : "人工 fallback",
        value: contract?.manualFallbackPolicy?.requiredOnTimeout
          ? locale === "en"
            ? "Ops queue required"
            : "需進 ops queue"
          : locale === "en"
            ? "No timeout fallback"
            : "無 timeout fallback",
        hint: contract?.manualFallbackPolicy
          ? `${contract.manualFallbackPolicy.queue} · ${contract.manualFallbackPolicy.requiredAuditFields.join(", ")}`
          : undefined,
      },
    ];
  }, [entry, locale]);

  const auditItems = useMemo<DetailListItem[]>(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        id: "audit-source",
        label: locale === "en" ? "Audit source" : "Audit 來源",
        value: entry.auditMetadata.source ?? "—",
      },
      {
        id: "request-id",
        label: locale === "en" ? "Request ID" : "Request ID",
        value: entry.auditMetadata.requestId ?? "—",
      },
      {
        id: "created-by",
        label: locale === "en" ? "Created by" : "建立者",
        value: entry.auditMetadata.createdBy ?? "—",
        hint: formatDateTime(entry.createdAt),
      },
      {
        id: "updated-by",
        label: locale === "en" ? "Updated by" : "更新者",
        value: entry.auditMetadata.updatedBy ?? "—",
        hint: formatDateTime(entry.updatedAt),
      },
      {
        id: "revoked-at",
        label: locale === "en" ? "Revoked at" : "撤銷時間",
        value: entry.revokedAt ? formatDateTime(entry.revokedAt) : "—",
        hint: entry.revokedBy ?? undefined,
      },
      {
        id: "revoke-reason",
        label: locale === "en" ? "Revoke reason" : "撤銷原因",
        value: entry.revokeReason ?? "—",
      },
    ];
  }, [entry, locale]);

  const credentialPreviewUrl =
    entry?.entryHost && entry?.entryPath
      ? `https://${entry.entryHost}${entry.entryPath}`
      : (entry?.entryPath ?? entry?.entryHost ?? null);

  const snapshotItems = useMemo<DetailListItem[]>(() => {
    if (!entry) {
      return [];
    }

    return [
      {
        id: "updated-at",
        label: locale === "en" ? "Last updated" : "最近更新",
        value: formatDateTime(entry.updatedAt),
      },
      {
        id: "credential-coverage",
        label: locale === "en" ? "Credential coverage" : "憑證覆蓋",
        value:
          entry.authMode === "partner_api_key"
            ? `${activeCredentialCount} active`
            : locale === "en"
              ? "Not required"
              : "不需要",
        hint:
          credentials.length > activeCredentialCount
            ? locale === "en"
              ? `${credentials.length} issued total`
              : `共核發 ${credentials.length} 筆`
            : undefined,
      },
      {
        id: "support-contact",
        label: locale === "en" ? "Support contact" : "支援窗口",
        value: entry.brandingMetadata?.supportEmail ?? "—",
        hint: entry.brandingMetadata?.supportPhone ?? undefined,
      },
      {
        id: "entry-route",
        label: locale === "en" ? "Entry route" : "入口路由",
        value: credentialPreviewUrl ?? "—",
      },
    ];
  }, [
    activeCredentialCount,
    credentialPreviewUrl,
    credentials.length,
    entry,
    locale,
  ]);

  const readinessReadyCount = readinessItems.filter(
    (item) => item.ready,
  ).length;
  const readinessMissingCount = readinessItems.length - readinessReadyCount;
  const readinessComplete =
    readinessItems.length > 0 && readinessItems.every((item) => item.ready);
  const readinessFilterCountProps =
    readinessMissingCount > 0 ? { count: readinessMissingCount } : {};

  if (loading) {
    return <div style={emptyStateStyle}>{t("partners.loading")}</div>;
  }

  if (!entry) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <PageHeader
          eyebrow={copy.title}
          title={copy.title}
          subtitle={copy.subtitle}
          actions={
            <Link
              href="/partners"
              style={actionButtonStyle({ tone: "secondary" })}
            >
              {copy.back}
            </Link>
          }
        />
        <CalloutBanner
          tone="danger"
          title={
            locale === "en"
              ? "Partner entry unavailable"
              : "Partner entry 目前不可用"
          }
          description={error ?? copy.notFound}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <PageHeader
        eyebrow={copy.title}
        title={entry.displayName}
        subtitle={`/${entry.entrySlug} · ${entry.partnerCode} · ${entry.programId}`}
        meta={[
          {
            label: locale === "en" ? "Status" : "狀態",
            value: formatPlatformCodeLabel(locale, entry.status),
            tone: partnerStatusTone(entry.status),
          },
          {
            label: "Auth",
            value: formatPlatformCodeLabel(locale, entry.authMode),
            tone: "info",
          },
          {
            label: locale === "en" ? "Eligibility" : "資格",
            value: formatPlatformCodeLabel(locale, entry.eligibilityMode),
            tone: "info",
          },
        ]}
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link
              href="/partners"
              style={actionButtonStyle({ tone: "secondary" })}
            >
              {copy.back}
            </Link>
            <button
              type="button"
              style={actionButtonStyle({ tone: "secondary" })}
              onClick={() => void loadEntry()}
            >
              {t("common.refresh")}
            </button>
          </div>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={
            locale === "en"
              ? "Unable to update partner entry"
              : "Partner entry 更新失敗"
          }
          description={error}
        />
      ) : null}

      <KpiRow minWidth="220px">
        <KpiCard
          label={locale === "en" ? "Lifecycle" : "生命週期"}
          value={formatPlatformCodeLabel(locale, entry.status)}
          detail={entry.activeFlag ? "active flag on" : "active flag off"}
          tone={partnerStatusTone(entry.status)}
        />
        <KpiCard
          label={locale === "en" ? "Readiness checks" : "Readiness 檢查"}
          value={`${readinessReadyCount}/${readinessItems.length}`}
          detail={
            readinessComplete
              ? locale === "en"
                ? "All checks passed"
                : "全部檢查通過"
              : locale === "en"
                ? "Some dependencies are still missing"
                : "仍有依賴尚未補齊"
          }
          tone={readinessComplete ? "success" : "warning"}
        />
        <KpiCard
          label={locale === "en" ? "Active credentials" : "有效憑證"}
          value={activeCredentialCount}
          detail={
            credentials[0]?.lastUsedAt
              ? `${locale === "en" ? "Last used" : "最後使用"} ${formatDateTime(
                  credentials[0].lastUsedAt,
                )}`
              : locale === "en"
                ? "No last-used telemetry yet"
                : "目前尚無 last-used telemetry"
          }
          tone="accent"
        />
      </KpiRow>

      <WorkflowPanel
        title={copy.navigationTitle}
        description={copy.navigationSubtitle}
      >
        <FilterPillRow>
          <a href="#overview" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.overview} tone="neutral" active />
          </a>
          <a href="#auth" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.auth} tone="info" />
          </a>
          <a href="#eligibility" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.eligibility} tone="neutral" />
          </a>
          <a href="#routing" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.routing} tone="platform" />
          </a>
          <a href="#readiness" style={{ textDecoration: "none" }}>
            <FilterPill
              label={copy.nav.readiness}
              tone={readinessComplete ? "success" : "warning"}
              {...readinessFilterCountProps}
            />
          </a>
          <a href="#lifecycle" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.lifecycle} tone="warning" />
          </a>
          <a href="#credentials" style={{ textDecoration: "none" }}>
            <FilterPill
              label={copy.nav.credentials}
              tone="info"
              count={activeCredentialCount}
            />
          </a>
          <a href="#audit" style={{ textDecoration: "none" }}>
            <FilterPill label={copy.nav.audit} tone="neutral" />
          </a>
        </FilterPillRow>
      </WorkflowPanel>

      <div id="overview" style={anchorSectionStyle}>
        <div style={heroGridStyle(isCompactViewport)}>
          <DataViewCard
            title={copy.overviewTitle}
            subtitle={copy.overviewSubtitle}
            tone="platform"
          >
            <DetailMetadataGrid items={detailItems} minColumnWidth="220px" />
          </DataViewCard>
          <DataViewCard
            title={copy.snapshotTitle}
            subtitle={copy.snapshotSubtitle}
            tone={readinessComplete ? "platform" : "warning"}
            actions={
              credentialPreviewUrl ? (
                <a
                  href={credentialPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    ...actionButtonStyle({ tone: "secondary", size: "sm" }),
                    width: "fit-content",
                  }}
                >
                  {copy.preview}
                </a>
              ) : undefined
            }
          >
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <StatusChip
                  label={formatPlatformCodeLabel(locale, entry.status)}
                  tone={partnerStatusTone(entry.status)}
                />
                <StatusChip
                  label={formatPlatformCodeLabel(locale, entry.authMode)}
                  tone="info"
                />
                <StatusChip
                  label={formatPlatformCodeLabel(locale, entry.eligibilityMode)}
                  tone="neutral"
                />
              </div>
              <div style={statusSummaryGridStyle}>
                <CalloutBanner
                  tone={
                    readinessComplete
                      ? "success"
                      : entry.status === "active"
                        ? "danger"
                        : "warning"
                  }
                  title={
                    readinessComplete
                      ? locale === "en"
                        ? "Promotion clear"
                        : "可推進上線"
                      : locale === "en"
                        ? "Readiness gaps remain"
                        : "仍有 readiness 缺口"
                  }
                  description={
                    readinessComplete
                      ? copy.readinessReady
                      : copy.readinessBlocked
                  }
                />
                <CalloutBanner
                  tone={
                    entry.authMode !== "partner_api_key" ||
                    activeCredentialCount > 0
                      ? "info"
                      : "warning"
                  }
                  title={locale === "en" ? "Credential posture" : "憑證姿態"}
                  description={
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
              </div>
              <DetailMetadataGrid
                columns={1}
                minColumnWidth="100%"
                items={snapshotItems}
              />
            </div>
          </DataViewCard>
        </div>
      </div>

      <WorkflowSplitLayout
        main={
          <>
            <div id="auth" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.authTitle}
                description={copy.authSubtitle}
              >
                <DetailMetadataGrid items={authItems} minColumnWidth="220px" />
              </WorkflowPanel>
            </div>

            <div id="eligibility" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.eligibilityTitle}
                description={copy.eligibilitySubtitle}
              >
                <DetailMetadataGrid
                  items={eligibilityItems}
                  minColumnWidth="220px"
                />
              </WorkflowPanel>
            </div>

            <div id="routing" style={anchorSectionStyle}>
              <form onSubmit={handleSave}>
                <WorkflowPanel
                  title={copy.routingTitle}
                  description={copy.routingSubtitle}
                >
                  <EntryForm
                    form={editForm}
                    setForm={(value) => {
                      setEditForm((current) => {
                        if (!current) {
                          return current;
                        }
                        return typeof value === "function"
                          ? value(current)
                          : value;
                      });
                    }}
                    t={t}
                    lockSlug
                  />
                  <button
                    type="submit"
                    style={actionButtonStyle({ tone: "primary" })}
                    disabled={saving || !editForm.displayName.trim()}
                  >
                    {saving ? t("common.saving") : copy.save}
                  </button>
                </WorkflowPanel>
              </form>
            </div>
          </>
        }
        side={
          <>
            <div id="readiness" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.readinessTitle}
                description={copy.readinessSubtitle}
              >
                <div style={{ display: "grid", gap: 8 }}>
                  {readinessItems.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid #e2e8f0",
                        background: "#f8fafc",
                      }}
                    >
                      <div style={{ display: "grid", gap: 4 }}>
                        <strong style={{ fontSize: 13, color: "#0f172a" }}>
                          {item.label}
                        </strong>
                        <span style={{ fontSize: 12, color: "#64748b" }}>
                          {item.value}
                        </span>
                      </div>
                      <StatusChip
                        label={
                          item.ready
                            ? t("partners.ready")
                            : t("partners.missing")
                        }
                        tone={item.ready ? "success" : "warning"}
                      />
                    </div>
                  ))}
                </div>
              </WorkflowPanel>
            </div>

            <div id="lifecycle" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.lifecycleTitle}
                description={copy.lifecycleSubtitle}
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <StatusChip
                    label={formatPlatformCodeLabel(locale, entry.status)}
                    tone={partnerStatusTone(entry.status)}
                  />
                  <StatusChip
                    label={formatPlatformCodeLabel(locale, entry.authMode)}
                    tone="info"
                  />
                  <StatusChip
                    label={formatPlatformCodeLabel(
                      locale,
                      entry.eligibilityMode,
                    )}
                    tone="info"
                  />
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {entry.status === "active" ? (
                    <button
                      type="button"
                      style={actionButtonStyle({ tone: "secondary" })}
                      disabled={changingStatus === "inactive"}
                      onClick={() => void setEntryStatus("inactive")}
                    >
                      {t("partners.deactivate")}
                    </button>
                  ) : entry.status === "inactive" ? (
                    <button
                      type="button"
                      style={actionButtonStyle({ tone: "secondary" })}
                      disabled={changingStatus === "active"}
                      onClick={() => void setEntryStatus("active")}
                    >
                      {t("partners.activate")}
                    </button>
                  ) : null}
                  {entry.status !== "revoked" ? (
                    <button
                      type="button"
                      style={actionButtonStyle({ tone: "secondary" })}
                      disabled={changingStatus === "revoked"}
                      onClick={() => void setEntryStatus("revoked")}
                    >
                      {t("partners.revoke")}
                    </button>
                  ) : null}
                </div>
              </WorkflowPanel>
            </div>

            <div id="credentials" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.credentialsTitle}
                description={copy.credentialsSubtitle}
              >
                <button
                  type="button"
                  style={actionButtonStyle({ tone: "secondary", size: "sm" })}
                  disabled={issuingCredential || entry.status === "revoked"}
                  onClick={() => void issueCredential()}
                >
                  {issuingCredential
                    ? t("partners.rotatingCredential")
                    : t("partners.rotateCredential")}
                </button>

                {issuedCredential ? (
                  <CalloutBanner
                    tone="info"
                    title={t("partners.plaintextCredential")}
                    description={issuedCredential.plaintextKey}
                  />
                ) : null}

                {credentials.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {credentials.map((credential) => (
                      <div
                        key={credential.keyId}
                        style={{
                          display: "grid",
                          gap: 6,
                          padding: "12px 14px",
                          borderRadius: 14,
                          border: "1px solid #e2e8f0",
                          background: "#f8fafc",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <strong style={{ fontSize: 13.5, color: "#0f172a" }}>
                            {credential.keyPrefix}
                            {credential.maskedSuffix}
                          </strong>
                          <StatusChip
                            label={
                              credential.revokedAt
                                ? t("partners.credentialStatus.revoked")
                                : t("partners.credentialStatus.active")
                            }
                            tone={credential.revokedAt ? "danger" : "success"}
                          />
                        </div>
                        <div style={{ fontSize: 12.5, color: "#64748b" }}>
                          {t("partners.credentialMeta.createdAt")}:{" "}
                          {formatDateTime(credential.createdAt)}
                        </div>
                        <div style={{ fontSize: 12.5, color: "#64748b" }}>
                          {t("partners.credentialMeta.lastUsedAt")}:{" "}
                          {credential.lastUsedAt
                            ? formatDateTime(credential.lastUsedAt)
                            : "—"}
                        </div>
                        <div style={{ fontSize: 12.5, color: "#64748b" }}>
                          {t("partners.credentialMeta.source")}:{" "}
                          {credential.source}
                        </div>
                        {!credential.revokedAt ? (
                          <button
                            type="button"
                            style={actionButtonStyle({
                              tone: "secondary",
                              size: "sm",
                            })}
                            disabled={revokingCredentialId === credential.keyId}
                            onClick={() =>
                              void revokeCredential(credential.keyId)
                            }
                          >
                            {revokingCredentialId === credential.keyId
                              ? t("partners.revokingCredential")
                              : t("partners.revokeCredential")}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: "#64748b", fontSize: 13 }}>
                    {t("partners.emptyCredentials")}
                  </div>
                )}
              </WorkflowPanel>
            </div>

            <div id="audit" style={anchorSectionStyle}>
              <WorkflowPanel
                title={copy.auditTitle}
                description={copy.auditSubtitle}
              >
                <DetailMetadataGrid items={auditItems} minColumnWidth="220px" />
              </WorkflowPanel>
            </div>
          </>
        }
      />
    </div>
  );
}
