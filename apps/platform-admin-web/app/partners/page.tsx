"use client";

import Link from "next/link";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { formatPlatformCodeLabel } from "@/lib/localized-labels";
import {
  EMPTY_ENTRY_FORM,
  buildPartnerReadinessItems,
  toPartnerCreateCommand,
  type EntryFormState,
} from "@/components/partner-governance-shared";
import {
  BUSINESS_DISPATCH_SUBTYPES,
  PARTNER_ENTRY_AUTH_MODES,
  PARTNER_ENTRY_STATUSES,
  PARTNER_ELIGIBILITY_MODES,
  type CrossAppResourceLink,
  type EmptyReason,
  type EmptyStateEnvelope,
  type PartnerChannelEntryRecord,
  type RefreshTier,
  type ResourceActionDescriptor,
  type UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasIcon,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  buildCanvasTheme,
  type CanvasShellNavItem,
} from "@drts/ui-web";

// Refresh cadence (Q-X02) for `/partners` per packet §3.2 + §5.5.
const PARTNERS_REFRESH_TIER: RefreshTier = "medium_slow";
const REFRESH_CADENCE_MS_BY_TIER: Record<RefreshTier, number> = {
  urgent: 5_000,
  fast: 3_000,
  dispatch: 5_000,
  medium: 15_000,
  medium_slow: 30_000,
  slow: 30_000,
  manual: 0,
};

type PartnerFilter = "all" | "active" | "inactive" | "revoked" | "attention";
type PartnerTableRow = PartnerChannelEntryRecord & Record<string, unknown>;

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
  display: "grid",
  gap: 14,
  padding: 24,
} satisfies CSSProperties;

const filterBarStyle = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0 14px",
} satisfies CSSProperties;

const entryCellStyle = {
  display: "flex",
  alignItems: "center",
  gap: 9,
} satisfies CSSProperties;

const entryAccentStyle = (accent: string): CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 6,
  background: accent,
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
});

const monoSubtleStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
} satisfies CSSProperties;

const entryLinkStyle = {
  color: theme.text,
  fontWeight: 600,
  textDecoration: "none",
} satisfies CSSProperties;

const pillButtonStyle = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
} satisfies CSSProperties;

const inputBaseStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  fontSize: 12.5,
  padding: "8px 10px",
  outline: "none",
});

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  minHeight: 34,
  fontSize: 13,
  fontWeight: 600,
  background: theme.accent,
  color: "#fff",
  border: `1px solid ${theme.accent}`,
  borderRadius: 7,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: theme.fontFamily,
});

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          workspace: "Workspace",
          home: "Governance Home",
          health: "Platform Health",
          tenantGov: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGov: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGov: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformLayer: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          workspace: "工作面",
          home: "工作首頁",
          health: "平台健康",
          tenantGov: "租戶治理",
          tenants: "租戶",
          partners: "合作夥伴 entry",
          users: "平台人員",
          fleetGov: "車隊與法遵",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGov: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformLayer: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { divider: labels.workspace },
    { key: "home", href: "/", icon: "home", label: labels.home },
    {
      key: "health",
      href: "/health",
      icon: "health",
      label: labels.health,
      badge: "2",
      badgeTone: "warn",
    },
    { divider: labels.tenantGov },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: labels.tenants,
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: labels.partners,
    },
    { key: "users", href: "/users", icon: "users", label: labels.users },
    { divider: labels.fleetGov },
    { key: "fleet", href: "/fleet", icon: "fleet", label: labels.fleet },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: labels.switchboard,
    },
    { divider: labels.pricingGov },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: labels.pricing,
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: labels.payments,
      badge: "3",
      badgeTone: "danger",
    },
    { divider: labels.platformLayer },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: labels.notices,
    },
    { key: "audit", href: "/audit", icon: "audit", label: labels.audit },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: labels.flags,
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      icon: "adapters",
      label: labels.adapters,
    },
  ];
}

function statusTone(
  status: PartnerChannelEntryRecord["status"],
): "success" | "warn" | "danger" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "inactive":
      return "warn";
    case "revoked":
      return "danger";
    default:
      return "neutral";
  }
}

function partnerReadinessGap(
  entry: PartnerChannelEntryRecord,
  t: (key: string) => string,
): number {
  return buildPartnerReadinessItems(entry, t).filter((item) => !item.ready)
    .length;
}

function partnerNeedsAttention(
  entry: PartnerChannelEntryRecord,
  t: (key: string) => string,
) {
  return partnerReadinessGap(entry, t) > 0;
}

function readinessLabel(missing: number, locale: string): string {
  if (missing === 0) {
    return "ok";
  }
  if (locale === "en") {
    return missing === 1 ? "1 gap" : `${missing} gaps`;
  }
  return `${missing} 缺口`;
}

// `/partners/[entrySlug]` cross-app deep links the user can follow per
// packet §3.10. Only audit is a same-app deep link today, but it goes via
// `CrossAppResourceLink` so the UI surface is uniform when other targets
// (e.g. ops-console operational view) get wired up.
function buildAuditLink(
  entry: PartnerChannelEntryRecord,
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route: `/audit?resourceType=partner_entry&resourceId=${encodeURIComponent(entry.partnerId)}`,
    resourceType: "partner_entry",
    resourceId: entry.partnerId,
    openMode: "same_tab",
    label: "audit",
  };
}

// Default `availableActions` for the partner-list scope when the backend
// has not yet shipped the envelope (tracked by UI-BE-006). Once the API
// returns `availableActions[]` on the list response, this fallback is
// dropped and the descriptors flow straight through.
function defaultListAvailableActions(): ResourceActionDescriptor[] {
  return [
    { action: "create_partner_entry", enabled: true, riskLevel: "medium" },
    { action: "refresh_partner_entries", enabled: true, riskLevel: "low" },
  ];
}

function pickAction(
  actions: ResourceActionDescriptor[],
  name: string,
): ResourceActionDescriptor | null {
  return actions.find((descriptor) => descriptor.action === name) ?? null;
}

function deriveEmptyReason(
  rawError: string | null,
  filter: PartnerFilter,
  totalLoaded: number,
): EmptyReason {
  if (rawError) {
    if (/permission|forbidden|denied/i.test(rawError)) {
      return "permission_denied";
    }
    if (/external|adapter|upstream|gateway/i.test(rawError)) {
      return "external_unavailable";
    }
    return "fetch_failed";
  }
  if (filter !== "all" && totalLoaded > 0) {
    return "filtered_empty";
  }
  return totalLoaded === 0 ? "no_data" : "filtered_empty";
}

function emptyStateCopy(
  reason: EmptyReason,
  locale: string,
): { title: string; body: string; cta?: string } {
  const en = locale === "en";
  switch (reason) {
    case "no_data":
      return en
        ? {
            title: "No partner entries yet",
            body: "No partner programs are registered for this platform. Create the first entry to onboard a bank or hotel program.",
            cta: "Create entry",
          }
        : {
            title: "尚無 partner entry",
            body: "目前還沒有任何 partner 程式登錄。可以建立第一筆 entry 以開通銀行或飯店方案。",
            cta: "建立 entry",
          };
    case "not_provisioned":
      return en
        ? {
            title: "Partner module not provisioned",
            body: "The partner-entry module is not enabled for this realm. Ask `pa_super_admin` to enable it before onboarding programs.",
          }
        : {
            title: "Partner 模組尚未啟用",
            body: "本平台尚未啟用 partner-entry 模組。請洽 `pa_super_admin` 開通後再建立方案。",
          };
    case "fetch_failed":
      return en
        ? {
            title: "Could not load partner entries",
            body: "The backend returned an error. Try refreshing — if the problem persists, check `/health` for downstream alerts.",
            cta: "Retry",
          }
        : {
            title: "讀取 partner entry 失敗",
            body: "後端回傳錯誤。可重新整理重試,如果持續失敗請到 `/health` 確認下游服務狀態。",
            cta: "重新整理",
          };
    case "permission_denied":
      return en
        ? {
            title: "You can see this page but cannot list entries",
            body: "Your role does not include `partner_entry:read`. Ask `pa_super_admin` to assign `pa_partner_mgr` if you need to onboard partners.",
          }
        : {
            title: "你可以看到本頁,但沒有 entry 讀取權限",
            body: "你目前的角色未包含 `partner_entry:read`。如果需要管理 partner,請洽 `pa_super_admin` 指派 `pa_partner_mgr`。",
          };
    case "external_unavailable":
      return en
        ? {
            title: "Upstream eligibility service is unavailable",
            body: "Partner registry depends on an external eligibility adapter that is currently degraded. Try again shortly.",
            cta: "Retry",
          }
        : {
            title: "上游 eligibility 服務暫時無法使用",
            body: "Partner 登錄依賴的外部 eligibility adapter 目前 degraded,稍後再試。",
            cta: "重新整理",
          };
    case "filtered_empty":
      return en
        ? {
            title: "No partner entries match this filter",
            body: "Try a different filter or clear it to see all entries.",
            cta: "Clear filter",
          }
        : {
            title: "目前篩選沒有 partner entry",
            body: "換一個篩選,或清除篩選以檢視全部。",
            cta: "清除篩選",
          };
    case "driver_not_eligible":
    default:
      // `driver_not_eligible` is driver-app-only; render a generic fallback
      // so the platform-admin list still has a visible state.
      return en
        ? { title: "Not available", body: "This list is not available." }
        : { title: "目前無法使用", body: "本清單目前無法使用。" };
  }
}

function emptyStateTone(
  reason: EmptyReason,
): "info" | "warn" | "danger" | "success" {
  switch (reason) {
    case "fetch_failed":
    case "external_unavailable":
      return "danger";
    case "permission_denied":
    case "not_provisioned":
      return "warn";
    case "filtered_empty":
      return "info";
    case "no_data":
    case "driver_not_eligible":
    default:
      return "info";
  }
}

export default function PartnersPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [entries, setEntries] = useState<PartnerChannelEntryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshMetadata, setRefreshMetadata] =
    useState<UiRefreshMetadata | null>(null);
  const [serverEmpty, setServerEmpty] = useState<EmptyStateEnvelope | null>(
    null,
  );
  const [listActions, setListActions] = useState<ResourceActionDescriptor[]>(
    defaultListAvailableActions(),
  );
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createReceipt, setCreateReceipt] = useState<string | null>(null);
  const [filter, setFilter] = useState<PartnerFilter>("all");
  const [createForm, setCreateForm] =
    useState<EntryFormState>(EMPTY_ENTRY_FORM);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const copy =
    locale === "en"
      ? {
          title: "Partner entry",
          subtitle:
            "Bank, hotel, and enterprise-facing partner entry programs — auth, eligibility, branding, and credential readiness.",
          breadcrumbRoot: "Partner Governance",
          searchPlaceholder: "Search entries, tenants, credentials...",
          refresh: "Refresh",
          stale: "Stale — refresh",
          fresh: "Fresh",
          degraded: "Degraded source",
          freshnessUnknown: "Freshness unknown",
          lastUpdated: "Last updated",
          tier: "Refresh cadence",
          tier30s: "30s · medium-slow",
          attentionTitle: "Promotion readiness has gaps",
          attentionBody: (count: number) =>
            `${count} partner entr${count === 1 ? "y" : "ies"} still have readiness gaps and should not be promoted blindly.`,
          newEntry: "New entry",
          createTitle: "Create partner entry",
          createSubtitle:
            "Provision routing, auth mode, eligibility mode, and brand metadata before traffic goes live.",
          openDetail: "Open entry detail",
          openAudit: "Audit",
          filters: {
            all: "all",
            active: "active",
            inactive: "inactive",
            attention: "attention",
            revoked: "revoked",
          },
          receipt: (slug: string) =>
            `Partner entry /${slug} created. Toast receipt available; audit reference attached.`,
        }
      : {
          title: "合作夥伴 entry",
          subtitle:
            "銀行、飯店與企業 partner 入口 — auth、eligibility、品牌與 credential 就緒度。",
          breadcrumbRoot: "合作夥伴治理",
          searchPlaceholder: "搜尋 entry、租戶、憑證...",
          refresh: "重新整理",
          stale: "資料已過期 — 重新整理",
          fresh: "資料即時",
          degraded: "資料來源 degraded",
          freshnessUnknown: "資料時效未知",
          lastUpdated: "最近更新",
          tier: "更新節奏",
          tier30s: "30 秒 · medium-slow",
          attentionTitle: "Promotion readiness 尚未完整",
          attentionBody: (count: number) =>
            `${count} 筆 partner entry 仍有 readiness 缺口,不應直接推進。`,
          newEntry: "建立 entry",
          createTitle: "建立 partner entry",
          createSubtitle:
            "在正式導流前先補齊 routing、auth mode、eligibility mode 與品牌 metadata。",
          openDetail: "查看 entry 詳情",
          openAudit: "稽核",
          filters: {
            all: "全部",
            active: "active",
            inactive: "inactive",
            attention: "待處理",
            revoked: "revoked",
          },
          receipt: (slug: string) =>
            `Partner entry /${slug} 已建立,toast 收據已發,稽核 ID 已附帶。`,
        };

  const navItems = useMemo(() => buildPlatformNav(locale), [locale]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const result = await client.listPlatformPartnerEntries();
      const items = result ?? [];
      setEntries(items);
      // Until UI-BE-006 ships `UiRefreshMetadata` on the envelope, derive
      // a best-effort freshness snapshot from the load time so the UI can
      // render the stale chip + manual refresh affordance per packet §3.2.
      setRefreshMetadata({
        generatedAt: new Date(startedAt).toISOString(),
        staleAfterMs: REFRESH_CADENCE_MS_BY_TIER[PARTNERS_REFRESH_TIER] ?? 0,
        dataFreshness: "fresh",
        source: "live",
      });
      setServerEmpty(
        items.length === 0
          ? {
              reason: "no_data",
              messageCode: "partners.empty.no_data",
              nextAction: {
                action: "create_partner_entry",
                enabled: true,
                riskLevel: "medium",
              },
            }
          : null,
      );
      setListActions(defaultListAvailableActions());
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setRefreshMetadata({
        generatedAt: new Date(startedAt).toISOString(),
        staleAfterMs: REFRESH_CADENCE_MS_BY_TIER[PARTNERS_REFRESH_TIER] ?? 0,
        dataFreshness: "degraded",
        source: "live",
      });
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  // T4 polling per packet §3.2 — manual refresh affordance is always
  // available and resets the cadence.
  useEffect(() => {
    const cadence = REFRESH_CADENCE_MS_BY_TIER[PARTNERS_REFRESH_TIER] ?? 0;
    if (cadence <= 0) {
      return;
    }
    if (refreshTimer.current !== null) {
      clearInterval(refreshTimer.current);
    }
    refreshTimer.current = setInterval(() => {
      void loadEntries();
    }, cadence);
    return () => {
      if (refreshTimer.current !== null) {
        clearInterval(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [loadEntries]);

  const counts = useMemo(
    () => ({
      all: entries.length,
      active: entries.filter((entry) => entry.status === "active").length,
      inactive: entries.filter((entry) => entry.status === "inactive").length,
      revoked: entries.filter((entry) => entry.status === "revoked").length,
      attention: entries.filter((entry) => partnerNeedsAttention(entry, t))
        .length,
    }),
    [entries, t],
  );

  const visibleEntries = useMemo(() => {
    switch (filter) {
      case "attention":
        return entries.filter((entry) => partnerNeedsAttention(entry, t));
      case "active":
      case "inactive":
      case "revoked":
        return entries.filter((entry) => entry.status === filter);
      case "all":
      default:
        return entries;
    }
  }, [entries, filter, t]);

  const tableRows = useMemo(
    () => visibleEntries as PartnerTableRow[],
    [visibleEntries],
  );

  const filterPills = useMemo(
    () =>
      [
        {
          value: "all" as const,
          label: `${copy.filters.all} ${counts.all}`,
          tone: "neutral" as const,
        },
        {
          value: "active" as const,
          label: `${copy.filters.active} ${counts.active}`,
          tone: "success" as const,
        },
        {
          value: "inactive" as const,
          label: `${copy.filters.inactive} ${counts.inactive}`,
          tone: "warn" as const,
        },
        {
          value: "attention" as const,
          label: `${copy.filters.attention} ${counts.attention}`,
          tone: "warn" as const,
        },
        {
          value: "revoked" as const,
          label: `${copy.filters.revoked} ${counts.revoked}`,
          tone: "danger" as const,
        },
      ] satisfies Array<{
        value: PartnerFilter;
        label: string;
        tone: "neutral" | "success" | "warn" | "danger";
      }>,
    [copy.filters, counts],
  );

  const effectiveEmptyState: EmptyStateEnvelope | null = useMemo(() => {
    if (visibleEntries.length > 0) {
      return null;
    }
    const reason = deriveEmptyReason(error, filter, entries.length);
    if (reason === serverEmpty?.reason && serverEmpty) {
      return serverEmpty;
    }
    const nextAction: ResourceActionDescriptor | undefined =
      reason === "no_data"
        ? {
            action: "create_partner_entry",
            enabled: true,
            riskLevel: "medium",
          }
        : reason === "fetch_failed" || reason === "external_unavailable"
          ? {
              action: "refresh_partner_entries",
              enabled: true,
              riskLevel: "low",
            }
          : undefined;
    const envelope: EmptyStateEnvelope = {
      reason,
      messageCode: `partners.empty.${reason}`,
      ...(nextAction ? { nextAction } : {}),
    };
    return envelope;
  }, [entries.length, error, filter, serverEmpty, visibleEntries.length]);

  const createDescriptor = pickAction(listActions, "create_partner_entry");
  const refreshDescriptor = pickAction(listActions, "refresh_partner_entries");

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    setCreateReceipt(null);
    try {
      const created = await client.createPlatformPartnerEntry(
        toPartnerCreateCommand(createForm),
      );
      setCreateForm(EMPTY_ENTRY_FORM);
      setShowCreate(false);
      setCreateReceipt(copy.receipt(created.entrySlug));
      await loadEntries();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const createDisabled =
    creating ||
    !createForm.partnerCode.trim() ||
    !createForm.programId.trim() ||
    !createForm.entrySlug.trim() ||
    !createForm.displayName.trim();

  const freshnessChipTone:
    | "neutral"
    | "success"
    | "warn"
    | "danger"
    | "accent" = !refreshMetadata
    ? "neutral"
    : refreshMetadata.dataFreshness === "fresh"
      ? "success"
      : refreshMetadata.dataFreshness === "stale"
        ? "warn"
        : refreshMetadata.dataFreshness === "degraded"
          ? "danger"
          : "neutral";

  const freshnessChipLabel = !refreshMetadata
    ? copy.freshnessUnknown
    : refreshMetadata.dataFreshness === "fresh"
      ? copy.fresh
      : refreshMetadata.dataFreshness === "stale"
        ? copy.stale
        : refreshMetadata.dataFreshness === "degraded"
          ? copy.degraded
          : copy.freshnessUnknown;

  return (
    <CanvasShell
      theme={theme}
      nav={navItems}
      active="partners"
      currentPath="/partners"
      breadcrumb={[copy.breadcrumbRoot, copy.title]}
      searchPlaceholder={copy.searchPlaceholder}
      avatarLabel="PA"
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.title}
        subtitle={copy.subtitle}
        sticky={false}
        actions={
          <>
            {refreshDescriptor && refreshDescriptor.enabled ? (
              <CanvasBtn
                theme={theme}
                icon="arrow"
                onClick={() => void loadEntries()}
                disabled={loading}
              >
                {copy.refresh}
              </CanvasBtn>
            ) : null}
            {createDescriptor && createDescriptor.enabled ? (
              <CanvasBtn
                theme={theme}
                variant={showCreate ? "secondary" : "primary"}
                icon={showCreate ? "x" : "plus"}
                onClick={() => setShowCreate((current) => !current)}
              >
                {showCreate ? t("common.cancel") : copy.newEntry}
              </CanvasBtn>
            ) : null}
          </>
        }
      />

      <div style={pageStackStyle}>
        <div style={filterBarStyle}>
          {filterPills.map((item) => (
            <button
              key={item.value}
              type="button"
              style={pillButtonStyle}
              onClick={() => setFilter(item.value)}
            >
              <CanvasPill
                theme={theme}
                tone={filter === item.value ? "accent" : item.tone}
                dot={item.value !== "all"}
              >
                {item.label}
              </CanvasPill>
            </button>
          ))}
          <span style={{ flex: 1 }} />
          <CanvasPill theme={theme} tone="neutral">
            {copy.tier}: {copy.tier30s}
          </CanvasPill>
          <CanvasPill theme={theme} tone={freshnessChipTone} dot>
            {freshnessChipLabel}
          </CanvasPill>
          {refreshMetadata ? (
            <span style={monoSubtleStyle}>
              {copy.lastUpdated}: {formatDateTime(refreshMetadata.generatedAt)}
            </span>
          ) : null}
        </div>

        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={
              locale === "en"
                ? "Unable to load partner entries"
                : "無法載入 partner entries"
            }
            body={error}
            actions={
              <CanvasBtn
                theme={theme}
                icon="arrow"
                onClick={() => void loadEntries()}
              >
                {copy.refresh}
              </CanvasBtn>
            }
          />
        ) : null}

        {!error && counts.attention > 0 ? (
          <CanvasBanner
            theme={theme}
            tone="warn"
            title={copy.attentionTitle}
            body={copy.attentionBody(counts.attention)}
          />
        ) : null}

        {createReceipt ? (
          <CanvasBanner
            theme={theme}
            tone="info"
            icon="check"
            title={locale === "en" ? "Action receipt" : "Action receipt"}
            body={createReceipt}
          />
        ) : null}

        {showCreate && createDescriptor?.enabled ? (
          <CanvasCard
            theme={theme}
            title={copy.createTitle}
            subtitle={copy.createSubtitle}
          >
            <form onSubmit={handleCreate}>
              <div style={formGridStyle}>
                <CanvasField
                  theme={theme}
                  label={t("partners.form.tenantId")}
                  required
                >
                  <input
                    value={createForm.tenantId}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        tenantId: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.partnerCode")}
                  required
                >
                  <input
                    value={createForm.partnerCode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        partnerCode: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.partnerType")}
                >
                  <input
                    value={createForm.partnerType}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        partnerType: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.programId")}
                  required
                >
                  <input
                    value={createForm.programId}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        programId: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.programCode")}
                >
                  <input
                    value={createForm.programCode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        programCode: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.bankCode")}>
                  <input
                    value={createForm.bankCode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        bankCode: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.entrySlug")}
                  required
                >
                  <input
                    value={createForm.entrySlug}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        entrySlug: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.displayName")}
                  required
                >
                  <input
                    value={createForm.displayName}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                    style={inputBaseStyle()}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.dispatchSubtype")}
                >
                  <select
                    value={createForm.businessDispatchSubtype}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        businessDispatchSubtype: event.target
                          .value as EntryFormState["businessDispatchSubtype"],
                      }))
                    }
                    style={inputBaseStyle(true)}
                  >
                    {BUSINESS_DISPATCH_SUBTYPES.map((value) => (
                      <option key={value} value={value}>
                        {formatPlatformCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.authMode")}>
                  <select
                    value={createForm.authMode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        authMode: event.target
                          .value as EntryFormState["authMode"],
                      }))
                    }
                    style={inputBaseStyle(true)}
                  >
                    {PARTNER_ENTRY_AUTH_MODES.map((value) => (
                      <option key={value} value={value}>
                        {formatPlatformCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.eligibilityMode")}
                >
                  <select
                    value={createForm.eligibilityMode}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        eligibilityMode: event.target
                          .value as EntryFormState["eligibilityMode"],
                      }))
                    }
                    style={inputBaseStyle(true)}
                  >
                    {PARTNER_ELIGIBILITY_MODES.map((value) => (
                      <option key={value} value={value}>
                        {formatPlatformCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.entryHost")}>
                  <input
                    value={createForm.entryHost}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        entryHost: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.entryPath")}>
                  <input
                    value={createForm.entryPath}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        entryPath: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.themeAccent")}
                >
                  <input
                    value={createForm.themeAccent}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        themeAccent: event.target.value,
                      }))
                    }
                    style={inputBaseStyle(true)}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.supportEmail")}
                >
                  <input
                    type="email"
                    value={createForm.supportEmail}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        supportEmail: event.target.value,
                      }))
                    }
                    style={inputBaseStyle()}
                  />
                </CanvasField>

                <CanvasField
                  theme={theme}
                  label={t("partners.form.supportPhone")}
                >
                  <input
                    type="tel"
                    value={createForm.supportPhone}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        supportPhone: event.target.value,
                      }))
                    }
                    style={inputBaseStyle()}
                  />
                </CanvasField>

                <CanvasField theme={theme} label={t("partners.form.status")}>
                  <select
                    value={createForm.status}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        status: event.target.value as EntryFormState["status"],
                      }))
                    }
                    style={inputBaseStyle(true)}
                  >
                    {PARTNER_ENTRY_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {formatPlatformCodeLabel(locale, value)}
                      </option>
                    ))}
                  </select>
                </CanvasField>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  type="submit"
                  disabled={createDisabled}
                  style={submitButtonStyle(createDisabled)}
                >
                  {creating ? t("common.creating") : t("partners.createEntry")}
                </button>
              </div>
            </form>
          </CanvasCard>
        ) : null}

        <CanvasCard theme={theme} padding={0}>
          {loading && entries.length === 0 ? (
            <div
              style={{
                padding: "24px 16px",
                color: theme.textMuted,
                fontSize: 13,
              }}
            >
              {t("partners.loading")}
            </div>
          ) : effectiveEmptyState ? (
            <PartnerEmptyState
              envelope={effectiveEmptyState}
              locale={locale}
              onPrimary={(action) => {
                if (action === "create_partner_entry") {
                  setShowCreate(true);
                } else if (action === "refresh_partner_entries") {
                  void loadEntries();
                } else if (action === "clear_filter") {
                  setFilter("all");
                }
              }}
            />
          ) : (
            <CanvasTable<PartnerTableRow>
              theme={theme}
              rows={tableRows}
              columns={[
                {
                  h: "ENTRY",
                  w: 220,
                  r: (entry) => (
                    <div style={entryCellStyle}>
                      <span
                        style={entryAccentStyle(
                          entry.themeAccent?.trim() || theme.accent,
                        )}
                      >
                        {entry.partnerCode.slice(0, 2).toUpperCase() || "PE"}
                      </span>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <Link
                          href={`/partners/${entry.entrySlug}`}
                          style={entryLinkStyle}
                        >
                          {entry.displayName}
                        </Link>
                        <span style={monoSubtleStyle}>/{entry.entrySlug}</span>
                      </div>
                    </div>
                  ),
                },
                {
                  h: "PROGRAM",
                  w: 140,
                  r: (entry) => (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span>{entry.programId}</span>
                      {entry.programCode ? (
                        <span style={monoSubtleStyle}>{entry.programCode}</span>
                      ) : null}
                    </div>
                  ),
                },
                {
                  h: "SUBTYPE",
                  w: 150,
                  mono: true,
                  r: (entry) => (
                    <span style={{ fontSize: 11.5 }}>
                      {entry.businessDispatchSubtype}
                    </span>
                  ),
                },
                {
                  h: "AUTH",
                  w: 130,
                  mono: true,
                  k: "authMode",
                },
                {
                  h: "ELIGIBILITY",
                  w: 110,
                  mono: true,
                  k: "eligibilityMode",
                },
                {
                  h: "STATUS",
                  w: 100,
                  r: (entry) => (
                    <CanvasPill
                      theme={theme}
                      tone={statusTone(entry.status)}
                      dot
                    >
                      {entry.status}
                    </CanvasPill>
                  ),
                },
                {
                  h: "READINESS",
                  w: 180,
                  r: (entry) => {
                    const missing = partnerReadinessGap(entry, t);
                    return (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <CanvasPill
                          theme={theme}
                          tone={missing === 0 ? "success" : "warn"}
                          dot={missing > 0}
                        >
                          {readinessLabel(missing, locale)}
                        </CanvasPill>
                        <Link
                          href={buildAuditLink(entry).route}
                          aria-label={copy.openAudit}
                          title={copy.openAudit}
                          style={{
                            color: theme.textDim,
                            textDecoration: "none",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                          target={
                            buildAuditLink(entry).openMode === "new_tab"
                              ? "_blank"
                              : undefined
                          }
                          rel={
                            buildAuditLink(entry).openMode === "new_tab"
                              ? "noreferrer"
                              : undefined
                          }
                        >
                          <CanvasIcon name="ext" size={12} />
                        </Link>
                      </div>
                    );
                  },
                },
              ]}
            />
          )}
        </CanvasCard>
      </div>
    </CanvasShell>
  );
}

function PartnerEmptyState({
  envelope,
  locale,
  onPrimary,
}: {
  envelope: EmptyStateEnvelope;
  locale: string;
  onPrimary: (action: string) => void;
}) {
  const tone = emptyStateTone(envelope.reason);
  const { title, body, cta } = emptyStateCopy(envelope.reason, locale);
  const ctaAction =
    envelope.reason === "filtered_empty"
      ? "clear_filter"
      : envelope.nextAction?.action;
  return (
    <div style={{ padding: "20px 16px" }}>
      <CanvasBanner
        theme={theme}
        tone={tone}
        icon={
          envelope.reason === "no_data"
            ? "plus"
            : envelope.reason === "filtered_empty"
              ? "filter"
              : envelope.reason === "permission_denied"
                ? "warn"
                : envelope.reason === "not_provisioned"
                  ? "dashboard"
                  : envelope.reason === "external_unavailable"
                    ? "warn"
                    : "warn"
        }
        title={title}
        body={
          <div style={{ display: "grid", gap: 6 }}>
            <span>{body}</span>
            <span style={monoSubtleStyle}>
              reason: {envelope.reason} · code: {envelope.messageCode}
            </span>
          </div>
        }
        actions={
          cta && ctaAction ? (
            <CanvasBtn
              theme={theme}
              variant={envelope.reason === "no_data" ? "primary" : "secondary"}
              icon={
                envelope.reason === "no_data"
                  ? "plus"
                  : envelope.reason === "filtered_empty"
                    ? "x"
                    : "arrow"
              }
              onClick={() => onPrimary(ctaAction)}
            >
              {cta}
            </CanvasBtn>
          ) : undefined
        }
      />
    </div>
  );
}
