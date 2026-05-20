"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import { getPlatformLabel } from "@/lib/localized-labels";
import type {
  CreatePublicInfoVersionCommand,
  GeneratePlacardVersionCommand,
  PlacardVersionRecord,
  PublicInfoVersionRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  KpiCard,
  KpiRow,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
} from "@drts/ui-web";
import { getPlacardVersionCodePrecheckMessage } from "./placard-version-code";
import {
  formatPlacardSourceOptionLabel,
  getPlacardRetiredSourceAuditNote,
  getPlacardSourceSelectionHint,
  getPreferredPlacardSourceVersion,
  isPlacardSourceSelectionBlocked,
} from "./placard-source";

type PlacardFormState = {
  versionCode: string;
  publicInfoVersionId: string;
  templateName: string;
  artifactFileId: string;
};

type PublicInfoRow = PublicInfoVersionRecord & Record<string, unknown>;
type PlacardRow = PlacardVersionRecord & Record<string, unknown>;
type SwitchboardTab = "publicInfo" | "placards";

const EMPTY_PUBLIC_INFO_FORM: CreatePublicInfoVersionCommand = {
  title: "",
  callPhone: "",
  complaintPhone: "",
  callRateText: "",
  fareText: "",
  paymentMethodText: "",
  effectiveFrom: "",
  effectiveTo: "",
};

const EMPTY_PLACARD_FORM: PlacardFormState = {
  versionCode: "",
  publicInfoVersionId: "",
  templateName: "seatback-default",
  artifactFileId: "",
};

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const viewportStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
  background: theme.bg,
} satisfies CSSProperties;

const pageBodyStyle = {
  display: "grid",
  gap: 20,
  padding: 24,
  maxWidth: 1160,
  margin: "0 auto",
} satisfies CSSProperties;

const splitLayoutStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 20,
  alignItems: "start",
} satisfies CSSProperties;

const mainColumnStyle = {
  flex: "1.6 1 680px",
  display: "grid",
  gap: 16,
  minWidth: 0,
} satisfies CSSProperties;

const sideColumnStyle = {
  flex: "1 1 340px",
  display: "grid",
  gap: 16,
  minWidth: 320,
} satisfies CSSProperties;

const cardStackStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const tabRailStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const placardCardPreviewStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const previewActionRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
} satisfies CSSProperties;

const historyGridStyle = {
  display: "grid",
  gap: 12,
} satisfies CSSProperties;

const historyItemStyle = {
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  padding: 12,
  background: theme.bgRaised,
  display: "grid",
  gap: 6,
} satisfies CSSProperties;

const historyLabelStyle = {
  fontSize: 11,
  color: theme.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
} satisfies CSSProperties;

const historyValueStyle = {
  fontSize: 13,
  color: theme.text,
  fontWeight: 600,
} satisfies CSSProperties;

const historyHintStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
} satisfies CSSProperties;

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
} satisfies CSSProperties;

const stackedCellStyle = {
  display: "grid",
  gap: 4,
  minWidth: 0,
} satisfies CSSProperties;

const secondaryTextStyle = {
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
  whiteSpace: "normal",
} satisfies CSSProperties;

const monoTextStyle = {
  fontSize: 11,
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  lineHeight: 1.45,
  whiteSpace: "normal",
} satisfies CSSProperties;

const rowActionStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 4,
} satisfies CSSProperties;

const placardPreviewStyle = {
  background: "#fcfaf2",
  border: `1px solid ${theme.border}`,
  borderRadius: 12,
  padding: 14,
  display: "grid",
  gap: 8,
  color: "#1a1a1a",
  fontSize: 11.5,
  lineHeight: 1.55,
} satisfies CSSProperties;

const inputStyle = (mono = false): CSSProperties => ({
  width: "100%",
  boxSizing: "border-box",
  padding: "8px 10px",
  borderRadius: 7,
  border: `1px solid ${theme.border}`,
  background: theme.bgRaised,
  color: theme.text,
  fontSize: 12.5,
  fontFamily: mono ? theme.monoFamily : theme.fontFamily,
  outline: "none",
});

const textAreaStyle = {
  ...inputStyle(),
  minHeight: 84,
  resize: "vertical",
} satisfies CSSProperties;

const helperTextStyle = {
  margin: 0,
  fontSize: 11.5,
  color: theme.textMuted,
  lineHeight: 1.45,
} satisfies CSSProperties;

const richTextStyle = {
  fontSize: 12.5,
  color: theme.text,
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
} satisfies CSSProperties;

const mutedValueStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
} satisfies CSSProperties;

const submitRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
} satisfies CSSProperties;

const submitButtonStyle = (disabled: boolean): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 128,
  height: 30,
  padding: "6px 12px",
  borderRadius: 7,
  border: `1px solid ${theme.accent}`,
  background: theme.accent,
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 600,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: theme.fontFamily,
});

const loadingStateStyle = {
  padding: 24,
  borderRadius: 12,
  background: theme.bg,
  color: theme.textMuted,
  fontFamily: theme.fontFamily,
} satisfies CSSProperties;

function cleanNullable(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function publicInfoStatusTone(status: PublicInfoVersionRecord["status"]) {
  if (status === "published") {
    return "success" as const;
  }
  if (status === "retired") {
    return "neutral" as const;
  }
  return "warn" as const;
}

function formatEffectiveCell(value: string | null, locale: string) {
  return value ?? (locale === "en" ? "open ended" : "未設定");
}

function formatEffectiveRange(
  locale: string,
  version: Pick<PublicInfoVersionRecord, "effectiveFrom" | "effectiveTo">,
) {
  const from = version.effectiveFrom ?? "—";
  const to = version.effectiveTo ?? (locale === "en" ? "open ended" : "未設定");
  return `${from} ~ ${to}`;
}

function buildPlatformNav(locale: string): CanvasShellNavItem[] {
  const labels =
    locale === "en"
      ? {
          home: "Governance Home",
          health: "Platform Health",
          tenantGroup: "Tenant Governance",
          tenants: "Tenants",
          partners: "Partner entry",
          users: "Platform staff",
          fleetGroup: "Fleet & Compliance",
          fleet: "Fleet & compliance",
          switchboard: "Public info & placards",
          pricingGroup: "Pricing & Settlement",
          pricing: "Pricing",
          payments: "Settlement governance",
          platformGroup: "Platform Layer",
          notices: "Notices & maintenance",
          audit: "Audit & evidence",
          flags: "Feature flags",
          adapters: "Adapter registry",
        }
      : {
          home: "治理首頁",
          health: "平台健康",
          tenantGroup: "租戶治理",
          tenants: "租戶",
          partners: "合作通路",
          users: "平台人員",
          fleetGroup: "車隊與合規",
          fleet: "車隊與合規",
          switchboard: "法定資訊與牌貼",
          pricingGroup: "計價與結算",
          pricing: "計價",
          payments: "結算治理",
          platformGroup: "平台層",
          notices: "公告與維護",
          audit: "稽核與證據",
          flags: "功能旗標",
          adapters: "介接登錄",
        };

  return [
    { key: "home", href: "/", label: labels.home, icon: "dashboard" },
    { key: "health", href: "/health", label: labels.health, icon: "health" },
    { divider: labels.tenantGroup },
    { key: "tenants", href: "/tenants", label: labels.tenants, icon: "tenants" },
    {
      key: "partners",
      href: "/partners",
      label: labels.partners,
      icon: "partners",
    },
    { key: "users", href: "/users", label: labels.users, icon: "users" },
    { divider: labels.fleetGroup },
    { key: "fleet", href: "/fleet", label: labels.fleet, icon: "fleet" },
    {
      key: "switchboard",
      href: "/switchboard",
      label: labels.switchboard,
      icon: "switchboard",
    },
    { divider: labels.pricingGroup },
    {
      key: "pricing",
      href: "/pricing",
      label: labels.pricing,
      icon: "pricing",
    },
    {
      key: "payments",
      href: "/payments",
      label: labels.payments,
      icon: "payments",
    },
    { divider: labels.platformGroup },
    {
      key: "notices",
      href: "/notices",
      label: labels.notices,
      icon: "bell",
    },
    { key: "audit", href: "/audit", label: labels.audit, icon: "audit" },
    {
      key: "flags",
      href: "/feature-flags",
      label: labels.flags,
      icon: "flag",
    },
    {
      key: "adapters",
      href: "/adapter-registry",
      label: labels.adapters,
      icon: "plugins",
    },
  ];
}

export default function SwitchboardPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [publicInfo, setPublicInfo] = useState<PublicInfoVersionRecord[]>([]);
  const [placards, setPlacards] = useState<PlacardVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPublicInfoForm, setShowPublicInfoForm] = useState(false);
  const [showPlacardForm, setShowPlacardForm] = useState(false);
  const [activeTab, setActiveTab] = useState<SwitchboardTab>("publicInfo");
  const [publicInfoForm, setPublicInfoForm] = useState(EMPTY_PUBLIC_INFO_FORM);
  const [placardForm, setPlacardForm] = useState(EMPTY_PLACARD_FORM);
  const [creatingPublicInfo, setCreatingPublicInfo] = useState(false);
  const [publishingVersionId, setPublishingVersionId] = useState<string | null>(
    null,
  );
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(
    null,
  );
  const [creatingPlacard, setCreatingPlacard] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [publicInfoVersions, placardVersions] = await Promise.all([
        client.listPublicInfo(),
        client.listPlacards(),
      ]);
      setPublicInfo(publicInfoVersions ?? []);
      setPlacards(placardVersions ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const publicInfoById = useMemo(
    () =>
      Object.fromEntries(
        publicInfo.map((version) => [version.versionId, version]),
      ),
    [publicInfo],
  );

  const publishedVersions = useMemo(
    () => publicInfo.filter((version) => version.status === "published"),
    [publicInfo],
  );

  const draftVersions = useMemo(
    () => publicInfo.filter((version) => version.status === "draft"),
    [publicInfo],
  );

  const livePublicInfoVersion = publishedVersions[0] ?? null;
  const latestDraftVersion = draftVersions[0] ?? null;
  const livePlacardVersion =
    placards.find((placard) => placard.publishedAt != null) ??
    placards[0] ??
    null;

  useEffect(() => {
    const preferredVersion = getPreferredPlacardSourceVersion(publicInfo);
    if (!preferredVersion || placardForm.publicInfoVersionId) {
      return;
    }
    setPlacardForm((current) => ({
      ...current,
      publicInfoVersionId: preferredVersion.versionId,
    }));
  }, [placardForm.publicInfoVersionId, publicInfo]);

  const selectedPublicInfoVersion =
    publicInfoById[placardForm.publicInfoVersionId] ?? null;
  const previewPublicInfoVersion =
    selectedPublicInfoVersion ??
    (livePlacardVersion
      ? (publicInfoById[livePlacardVersion.publicInfoVersionId] ?? null)
      : null) ??
    livePublicInfoVersion;
  const placardsTiedToLiveCount = useMemo(
    () =>
      placards.filter((placard) => {
        const sourceVersion = publicInfoById[placard.publicInfoVersionId];
        return sourceVersion?.status === "published";
      }).length,
    [placards, publicInfoById],
  );

  const versionCodePrecheckMessage = useMemo(
    () =>
      getPlacardVersionCodePrecheckMessage(
        placardForm.versionCode,
        placards,
        locale,
      ),
    [locale, placardForm.versionCode, placards],
  );

  const placardSourceBlocked = isPlacardSourceSelectionBlocked(
    selectedPublicInfoVersion,
  );

  const tabItems = [
    { key: "publicInfo" as const, label: t("switchboard.tab.publicInfo") },
    { key: "placards" as const, label: t("switchboard.tab.placards") },
  ];

  const activeTabLabel =
    tabItems.find((tab) => tab.key === activeTab)?.label ?? tabItems[0].label;

  const copy =
    locale === "en"
      ? {
          breadcrumbParent: "Fleet & Compliance",
          pageTitle: "Switchboard",
          title: "Public Info & Placards",
          subtitle: "public info versioning · placard generation · publish",
          bannerTitle:
            "Public disclosure versions and placard lineage stay governed together",
          bannerBody:
            "Draft, publish, and placard generation share one surface so rider disclosure does not drift away from the physical placard artifact.",
          versionsTitle: "Public info versions",
          versionsSubtitle:
            "Version · effective window · public contact · status",
          previewTitle: livePlacardVersion
            ? `Current placard (${livePlacardVersion.versionCode})`
            : "Current placard",
          previewSubtitle: livePublicInfoVersion
            ? `Generated from ${livePublicInfoVersion.versionId}`
            : "No published public info yet.",
          noPublicInfo: "No public info versions.",
          noLiveVersion: "No published public info version yet.",
          noLivePlacard: "No placard artifact generated yet.",
          createHint:
            "Create draft versions here, then publish them from the row controls or the header action.",
          placardHint:
            "Generate placards from an allowed source version and keep artifact metadata server-controlled.",
          generatedFrom: "Generated from",
          vehicleLine: "Vehicle ARJ-2891 / Driver Lin Zhi-Wei",
          paymentPrefix: "Payment",
          kpiPublished: "Published versions",
          kpiPublishedDetail: "live disclosure lineage",
          kpiDrafts: "Draft versions",
          kpiDraftsDetail: "awaiting publish",
          kpiPlacards: "Placard versions",
          kpiPlacardsDetail: "artifact lineage tracked",
          kpiTied: "Tied to live",
          kpiTiedDetail: "source status = published",
          historyTitle: "History framing",
          historySubtitle:
            "Published versions keep immutable lineage while drafts remain operational.",
          tabsTitle: "Switchboard lanes",
          tabsSubtitle:
            "Keep the primary review posture stable while operational forms live in dedicated tabs.",
          placardTableTitle: "Placard lineage",
          placardTableSubtitle:
            "Generated outputs stay tied to public-info source versions and controlled downloads.",
          publicContactTitle: "Public contact framing",
          publicContactSubtitle:
            "Preview the live disclosure copy before creating the next draft.",
          publicContactSummary:
            "Use the draft form to prepare the next rider-facing disclosure without breaking published lineage.",
          historyCardTitle: "History framing",
          historyCardSubtitle:
            "Drafts remain editable; published versions stay traceable and immutable.",
          historyLiveDisclosure: "Live disclosure",
          historyCurrentPlacard: "Current placard",
          historyDraftPosture: "Draft posture",
          historySelectedSource: "Selected source",
          historyPlacardSource: "Placard source posture",
          downloadReady: "controlled download",
          notAvailable: "not available",
        }
      : {
          breadcrumbParent: "車隊與合規",
          pageTitle: "Switchboard",
          title: "法定資訊與牌貼",
          subtitle: "public info versioning · placard generation · publish",
          bannerTitle: "公開揭露版本與牌貼沿革一起維護",
          bannerBody:
            "草稿、發布與牌貼生成共用同一治理畫面，避免 rider disclosure 與實體牌貼脫鉤。",
          versionsTitle: "Public info versions",
          versionsSubtitle: "版本 · effective 區間 · 公開聯絡 · 狀態",
          previewTitle: livePlacardVersion
            ? `目前發行牌貼 (${livePlacardVersion.versionCode})`
            : "目前發行牌貼",
          previewSubtitle: livePublicInfoVersion
            ? `依 ${livePublicInfoVersion.versionId} 生成`
            : "目前尚無已發布公開資訊版本。",
          noPublicInfo: "目前沒有公開資訊版本。",
          noLiveVersion: "目前尚無已發布公開資訊版本。",
          noLivePlacard: "目前尚未產生牌貼成品。",
          createHint: "先在這裡建立草稿版本，再從列操作或頁首按鈕發布。",
          placardHint:
            "牌貼需從允許的來源版本生成，下載 metadata 由伺服器治理。",
          generatedFrom: "本牌貼依",
          vehicleLine: "車輛編號 ARJ-2891 / 駕駛 林志偉",
          paymentPrefix: "支付",
          kpiPublished: "已發布版本",
          kpiPublishedDetail: "現行揭露沿革",
          kpiDrafts: "草稿版本",
          kpiDraftsDetail: "待發布",
          kpiPlacards: "牌貼版本",
          kpiPlacardsDetail: "成品沿革受管",
          kpiTied: "綁定現行",
          kpiTiedDetail: "來源狀態 = published",
          historyTitle: "History framing",
          historySubtitle: "已發布版本維持 immutable lineage，草稿則保留操作空間。",
          tabsTitle: "Switchboard lanes",
          tabsSubtitle: "主畫面維持審查姿態，操作表單則收在對應分頁。",
          placardTableTitle: "牌貼沿革",
          placardTableSubtitle: "生成成品需持續綁定來源版本與受控下載。",
          publicContactTitle: "公開聯絡 framing",
          publicContactSubtitle: "建立下一版草稿前，先檢查目前對乘客揭露的文案。",
          publicContactSummary:
            "以草稿表單準備下一版對外揭露，同時維持已發布版本的 lineage 不被破壞。",
          historyCardTitle: "History framing",
          historyCardSubtitle: "草稿可編輯；published 版本保留可追溯且不可變的沿革。",
          historyLiveDisclosure: "目前生效揭露",
          historyCurrentPlacard: "現行牌貼",
          historyDraftPosture: "草稿姿態",
          historySelectedSource: "目前來源版本",
          historyPlacardSource: "牌貼來源姿態",
          downloadReady: "受控下載",
          notAvailable: "不可用",
        };

  async function handleCreatePublicInfo(event: FormEvent) {
    event.preventDefault();
    setCreatingPublicInfo(true);
    setError(null);
    try {
      await client.createPublicInfoVersion({
        title: publicInfoForm.title.trim(),
        callPhone: cleanNullable(publicInfoForm.callPhone),
        complaintPhone: cleanNullable(publicInfoForm.complaintPhone),
        callRateText: cleanNullable(publicInfoForm.callRateText),
        fareText: cleanNullable(publicInfoForm.fareText),
        paymentMethodText: cleanNullable(publicInfoForm.paymentMethodText),
        effectiveFrom: cleanNullable(publicInfoForm.effectiveFrom),
        effectiveTo: cleanNullable(publicInfoForm.effectiveTo),
      });
      setPublicInfoForm(EMPTY_PUBLIC_INFO_FORM);
      setShowPublicInfoForm(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPublicInfo(false);
    }
  }

  async function handlePublish(versionId: string) {
    setPublishingVersionId(versionId);
    setError(null);
    try {
      await client.publishPublicInfoVersion(versionId, {});
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingVersionId(null);
    }
  }

  async function handleDeleteDraft(versionId: string) {
    setDeletingVersionId(versionId);
    setError(null);
    try {
      await client.deletePublicInfoVersion(versionId);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingVersionId(null);
    }
  }

  async function handleGeneratePlacard(event: FormEvent) {
    event.preventDefault();
    setCreatingPlacard(true);
    setError(null);
    try {
      const command: GeneratePlacardVersionCommand = {
        versionCode: placardForm.versionCode.trim(),
        publicInfoVersionId: placardForm.publicInfoVersionId,
        templateName: placardForm.templateName.trim(),
        artifactFileId: cleanNullable(placardForm.artifactFileId),
      };
      await client.generatePlacardVersion(command);
      setPlacardForm((current) => ({
        ...EMPTY_PLACARD_FORM,
        publicInfoVersionId: current.publicInfoVersionId,
      }));
      setShowPlacardForm(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPlacard(false);
    }
  }

  const publicInfoColumns = useMemo<CanvasTableColumn<PublicInfoRow>[]>(
    () => [
      {
        h: t("switchboard.col.version"),
        w: 150,
        r: (version) => (
          <div style={stackedCellStyle}>
            <span style={monoTextStyle}>{version.versionId}</span>
            <span style={secondaryTextStyle}>{version.title}</span>
          </div>
        ),
      },
      {
        h: t("pricing.col.effectiveFrom"),
        w: 140,
        mono: true,
        r: (version) => version.effectiveFrom ?? "—",
      },
      {
        h: t("pricing.col.effectiveTo"),
        w: 140,
        mono: true,
        r: (version) => formatEffectiveCell(version.effectiveTo, locale),
      },
      {
        h: t("switchboard.form.callPhone"),
        w: 140,
        mono: true,
        r: (version) => version.callPhone ?? "—",
      },
      {
        h: t("switchboard.form.complaintPhone"),
        w: 140,
        mono: true,
        r: (version) => version.complaintPhone ?? "—",
      },
      {
        h: getPlatformLabel(locale, "status"),
        w: 120,
        r: (version) => (
          <CanvasPill
            theme={theme}
            tone={publicInfoStatusTone(version.status)}
            dot
          >
            {version.status}
          </CanvasPill>
        ),
      },
      {
        h: getPlatformLabel(locale, "updated"),
        w: 180,
        r: (version) => (
          <div style={stackedCellStyle}>
            <span style={monoTextStyle}>{formatDateTime(version.updatedAt)}</span>
            {version.status === "draft" ? (
              <div style={rowActionStyle}>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  size="xs"
                  icon="check"
                  disabled={
                    publishingVersionId === version.versionId ||
                    deletingVersionId === version.versionId
                  }
                  onClick={() => void handlePublish(version.versionId)}
                >
                  {publishingVersionId === version.versionId
                    ? t("switchboard.publishing")
                    : t("switchboard.publishDraft")}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  size="xs"
                  danger
                  icon="close"
                  disabled={
                    deletingVersionId === version.versionId ||
                    publishingVersionId === version.versionId
                  }
                  onClick={() => void handleDeleteDraft(version.versionId)}
                >
                  {deletingVersionId === version.versionId
                    ? t("common.deleting")
                    : t("switchboard.deleteDraft")}
                </CanvasBtn>
              </div>
            ) : (
              <span style={secondaryTextStyle}>
                {formatDateTime(version.publishedAt ?? version.updatedAt)}
              </span>
            )}
          </div>
        ),
      },
    ],
    [deletingVersionId, locale, publishingVersionId, t],
  );

  const renderPublicInfoForm = () => (
    <CanvasCard
      theme={theme}
      title={t("switchboard.newPublicInfoVersion")}
      subtitle={copy.createHint}
    >
      <form onSubmit={handleCreatePublicInfo} style={cardStackStyle}>
        <div style={fieldGridStyle}>
          <CanvasField theme={theme} label={t("switchboard.form.title")}>
            <input
              value={publicInfoForm.title ?? ""}
              onChange={(event) =>
                setPublicInfoForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder={
                locale === "en" ? "2026 Q3 public info" : "2026 Q3 公開資訊版"
              }
              style={inputStyle()}
            />
          </CanvasField>
          <CanvasField theme={theme} label={t("switchboard.form.callPhone")}>
            <input
              value={publicInfoForm.callPhone ?? ""}
              onChange={(event) =>
                setPublicInfoForm((current) => ({
                  ...current,
                  callPhone: event.target.value,
                }))
              }
              placeholder="02-2543-9988"
              style={inputStyle(true)}
            />
          </CanvasField>
          <CanvasField
            theme={theme}
            label={t("switchboard.form.complaintPhone")}
          >
            <input
              value={publicInfoForm.complaintPhone ?? ""}
              onChange={(event) =>
                setPublicInfoForm((current) => ({
                  ...current,
                  complaintPhone: event.target.value,
                }))
              }
              placeholder="0800-088-122"
              style={inputStyle(true)}
            />
          </CanvasField>
          <CanvasField theme={theme} label={t("switchboard.form.effectiveFrom")}>
            <input
              value={publicInfoForm.effectiveFrom ?? ""}
              onChange={(event) =>
                setPublicInfoForm((current) => ({
                  ...current,
                  effectiveFrom: event.target.value,
                }))
              }
              placeholder="2026-04-01T00:00:00.000Z"
              style={inputStyle(true)}
            />
          </CanvasField>
          <CanvasField theme={theme} label={t("switchboard.form.effectiveTo")}>
            <input
              value={publicInfoForm.effectiveTo ?? ""}
              onChange={(event) =>
                setPublicInfoForm((current) => ({
                  ...current,
                  effectiveTo: event.target.value,
                }))
              }
              placeholder={t("switchboard.form.effectiveToHint")}
              style={inputStyle(true)}
            />
          </CanvasField>
          <CanvasField theme={theme} label={t("switchboard.form.callRateText")}>
            <textarea
              value={publicInfoForm.callRateText ?? ""}
              onChange={(event) =>
                setPublicInfoForm((current) => ({
                  ...current,
                  callRateText: event.target.value,
                }))
              }
              placeholder={locale === "en" ? "Metered pricing" : "依表計費"}
              style={textAreaStyle}
            />
          </CanvasField>
          <CanvasField theme={theme} label={t("switchboard.form.fareText")}>
            <textarea
              value={publicInfoForm.fareText ?? ""}
              onChange={(event) =>
                setPublicInfoForm((current) => ({
                  ...current,
                  fareText: event.target.value,
                }))
              }
              placeholder={
                locale === "en"
                  ? "Night and remote surcharges per notice"
                  : "夜間與偏遠加成依公告"
              }
              style={textAreaStyle}
            />
          </CanvasField>
          <CanvasField
            theme={theme}
            label={t("switchboard.form.paymentMethodText")}
          >
            <textarea
              value={publicInfoForm.paymentMethodText ?? ""}
              onChange={(event) =>
                setPublicInfoForm((current) => ({
                  ...current,
                  paymentMethodText: event.target.value,
                }))
              }
              placeholder={
                locale === "en"
                  ? "Cash, credit card, corporate charge"
                  : "現金、台灣 Pay、街口、信用卡"
              }
              style={textAreaStyle}
            />
          </CanvasField>
        </div>
        <div style={submitRowStyle}>
          <button
            type="submit"
            style={submitButtonStyle(creatingPublicInfo)}
            disabled={creatingPublicInfo}
          >
            {creatingPublicInfo
              ? t("switchboard.creating")
              : t("switchboard.createDraftVersion")}
          </button>
        </div>
      </form>
    </CanvasCard>
  );

  const renderPlacardForm = () => (
    <CanvasCard
      theme={theme}
      title={t("switchboard.generatePlacardVersion")}
      subtitle={copy.placardHint}
    >
      <form onSubmit={handleGeneratePlacard} style={cardStackStyle}>
        <div style={fieldGridStyle}>
          <CanvasField theme={theme} label={t("switchboard.form.sourceVersion")}>
            <select
              value={placardForm.publicInfoVersionId}
              onChange={(event) =>
                setPlacardForm((current) => ({
                  ...current,
                  publicInfoVersionId: event.target.value,
                }))
              }
              style={inputStyle()}
            >
              <option value="">—</option>
              {publicInfo.map((version) => (
                <option
                  key={version.versionId}
                  value={version.versionId}
                  disabled={isPlacardSourceSelectionBlocked(version)}
                >
                  {formatPlacardSourceOptionLabel(version, locale)}
                </option>
              ))}
            </select>
          </CanvasField>
          <CanvasField theme={theme} label={t("switchboard.form.versionCode")}>
            <input
              value={placardForm.versionCode}
              onChange={(event) =>
                setPlacardForm((current) => ({
                  ...current,
                  versionCode: event.target.value,
                }))
              }
              placeholder="placard-v9"
              style={inputStyle(true)}
            />
          </CanvasField>
          <CanvasField theme={theme} label={t("switchboard.form.template")}>
            <input
              value={placardForm.templateName}
              onChange={(event) =>
                setPlacardForm((current) => ({
                  ...current,
                  templateName: event.target.value,
                }))
              }
              placeholder="seatback-default"
              style={inputStyle(true)}
            />
          </CanvasField>
          <CanvasField
            theme={theme}
            label={t("switchboard.form.artifactFileId")}
          >
            <input
              value={placardForm.artifactFileId}
              onChange={(event) =>
                setPlacardForm((current) => ({
                  ...current,
                  artifactFileId: event.target.value,
                }))
              }
              placeholder={t("switchboard.form.artifactHint")}
              style={inputStyle(true)}
            />
          </CanvasField>
        </div>
        <p style={helperTextStyle}>
          {getPlacardSourceSelectionHint(selectedPublicInfoVersion, locale)}
        </p>
        {placardSourceBlocked ? (
          <p style={{ ...helperTextStyle, color: "#b45309" }}>
            {getPlacardRetiredSourceAuditNote(locale)}
          </p>
        ) : null}
        {versionCodePrecheckMessage ? (
          <p style={{ ...helperTextStyle, color: "#b45309" }}>
            {versionCodePrecheckMessage}
          </p>
        ) : null}
        <div style={submitRowStyle}>
          <button
            type="submit"
            style={submitButtonStyle(
              creatingPlacard ||
                placardForm.publicInfoVersionId.trim() === "" ||
                placardSourceBlocked ||
                versionCodePrecheckMessage !== null,
            )}
            disabled={
              creatingPlacard ||
              placardForm.publicInfoVersionId.trim() === "" ||
              placardSourceBlocked ||
              versionCodePrecheckMessage !== null
            }
          >
            {creatingPlacard
              ? t("switchboard.generating")
              : t("switchboard.generatePlacardVersion")}
          </button>
        </div>
      </form>
    </CanvasCard>
  );

  const placardColumns = useMemo<CanvasTableColumn<PlacardRow>[]>(
    () => [
      {
        h: t("switchboard.col.placardId"),
        w: 180,
        r: (placard) => (
          <div style={stackedCellStyle}>
            <span style={monoTextStyle}>{placard.versionCode}</span>
            <span style={secondaryTextStyle}>{placard.placardVersionId}</span>
          </div>
        ),
      },
      {
        h: t("switchboard.col.sourceVersion"),
        w: 180,
        r: (placard) => {
          const sourceVersion = publicInfoById[placard.publicInfoVersionId];
          return (
            <div style={stackedCellStyle}>
              <span style={monoTextStyle}>{placard.publicInfoVersionId}</span>
              <span style={secondaryTextStyle}>
                {sourceVersion?.title ?? "—"}
              </span>
            </div>
          );
        },
      },
      {
        h: t("switchboard.col.template"),
        w: 160,
        r: (placard) => (
          <div style={stackedCellStyle}>
            <span style={monoTextStyle}>{placard.templateName}</span>
            <span style={secondaryTextStyle}>
              {placard.artifactFileId ?? copy.notAvailable}
            </span>
          </div>
        ),
      },
      {
        h: t("switchboard.col.tied"),
        w: 120,
        r: (placard) => {
          const sourceVersion = publicInfoById[placard.publicInfoVersionId];
          return (
            <CanvasPill
              theme={theme}
              tone={sourceVersion?.status === "published" ? "success" : "warn"}
              dot
            >
              {sourceVersion?.status === "published"
                ? copy.downloadReady
                : sourceVersion?.status ?? "draft"}
            </CanvasPill>
          );
        },
      },
      {
        h: getPlatformLabel(locale, "updated"),
        w: 180,
        r: (placard) => (
          <div style={stackedCellStyle}>
            <span style={monoTextStyle}>
              {formatDateTime(placard.updatedAt)}
            </span>
            <span style={secondaryTextStyle}>
              {placard.artifactExpiresAt
                ? `${copy.downloadReady} · ${formatDateTime(placard.artifactExpiresAt)}`
                : copy.notAvailable}
            </span>
          </div>
        ),
      },
    ],
    [copy.downloadReady, copy.notAvailable, locale, publicInfoById, t],
  );

  const renderVersionsTable = () => (
    <CanvasCard
      theme={theme}
      padding={0}
      title={copy.versionsTitle}
      subtitle={copy.versionsSubtitle}
      actions={
        <CanvasBtn theme={theme} icon="refresh" onClick={() => void loadData()}>
          {t("common.refresh")}
        </CanvasBtn>
      }
    >
      {publicInfo.length === 0 ? (
        <div style={{ padding: 16 }}>
          <p style={helperTextStyle}>{copy.noPublicInfo}</p>
        </div>
      ) : (
        <CanvasTable<PublicInfoRow>
          theme={theme}
          rows={publicInfo}
          columns={publicInfoColumns}
        />
      )}
    </CanvasCard>
  );

  const renderPlacardTable = () => (
    <CanvasCard
      theme={theme}
      padding={0}
      title={copy.placardTableTitle}
      subtitle={copy.placardTableSubtitle}
    >
      {placards.length === 0 ? (
        <div style={{ padding: 16 }}>
          <p style={helperTextStyle}>{t("switchboard.noPlacards")}</p>
        </div>
      ) : (
        <CanvasTable<PlacardRow>
          theme={theme}
          rows={placards}
          columns={placardColumns}
        />
      )}
    </CanvasCard>
  );

  const renderPublicContactPanel = () => (
    <CanvasCard
      theme={theme}
      title={copy.publicContactTitle}
      subtitle={copy.publicContactSubtitle}
    >
      <div style={cardStackStyle}>
        <p style={helperTextStyle}>{copy.publicContactSummary}</p>
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            {
              k: t("switchboard.form.callPhone"),
              v: livePublicInfoVersion?.callPhone ?? "—",
              mono: true,
            },
            {
              k: t("switchboard.form.complaintPhone"),
              v: livePublicInfoVersion?.complaintPhone ?? "—",
              mono: true,
            },
            {
              k: t("switchboard.form.callRateText"),
              v: (
                <span style={richTextStyle}>
                  {livePublicInfoVersion?.callRateText ?? t("switchboard.noRateText")}
                </span>
              ),
            },
            {
              k: t("switchboard.form.fareText"),
              v: (
                <span style={richTextStyle}>
                  {livePublicInfoVersion?.fareText ?? t("switchboard.noRateText")}
                </span>
              ),
            },
            {
              k: t("switchboard.form.paymentMethodText"),
              v: (
                <span style={richTextStyle}>
                  {livePublicInfoVersion?.paymentMethodText ?? "—"}
                </span>
              ),
            },
          ]}
        />
      </div>
    </CanvasCard>
  );

  const renderHistoryPanel = () => (
    <CanvasCard
      theme={theme}
      title={copy.historyCardTitle}
      subtitle={copy.historyCardSubtitle}
    >
      <div style={historyGridStyle}>
        <div style={historyItemStyle}>
          <span style={historyLabelStyle}>{copy.historyLiveDisclosure}</span>
          <span style={historyValueStyle}>
            {livePublicInfoVersion?.versionId ?? "—"}
          </span>
          <span style={historyHintStyle}>
            {livePublicInfoVersion
              ? formatEffectiveRange(locale, livePublicInfoVersion)
              : copy.noLiveVersion}
          </span>
        </div>
        <div style={historyItemStyle}>
          <span style={historyLabelStyle}>{copy.historyCurrentPlacard}</span>
          <span style={historyValueStyle}>
            {livePlacardVersion?.versionCode ?? "—"}
          </span>
          <span style={historyHintStyle}>
            {livePlacardVersion?.templateName ?? copy.noLivePlacard}
          </span>
        </div>
        <div style={historyItemStyle}>
          <span style={historyLabelStyle}>{copy.historyDraftPosture}</span>
          <span style={historyValueStyle}>
            {latestDraftVersion?.versionId ?? "—"}
          </span>
          <span style={historyHintStyle}>
            {latestDraftVersion
              ? formatDateTime(latestDraftVersion.updatedAt)
              : copy.noPublicInfo}
          </span>
        </div>
        <div style={historyItemStyle}>
          <span style={historyLabelStyle}>{copy.historyPlacardSource}</span>
          <span style={historyValueStyle}>
            {selectedPublicInfoVersion?.versionId ??
              previewPublicInfoVersion?.versionId ??
              "—"}
          </span>
          <span style={historyHintStyle}>
            {getPlacardSourceSelectionHint(
              selectedPublicInfoVersion ?? previewPublicInfoVersion,
              locale,
            )}
          </span>
        </div>
      </div>
    </CanvasCard>
  );

  const renderActiveTabPanel = () => {
    if (activeTab === "placards") {
      return (
        <div style={cardStackStyle}>
          {showPlacardForm ? renderPlacardForm() : null}
          {renderPlacardTable()}
        </div>
      );
    }

    return (
      <div style={cardStackStyle}>
        {showPublicInfoForm ? renderPublicInfoForm() : null}
        {renderPublicContactPanel()}
        {renderHistoryPanel()}
      </div>
    );
  };

  if (loading) {
    return <div style={loadingStateStyle}>{t("switchboard.loading")}</div>;
  }

  return (
    <div style={viewportStyle}>
      <CanvasShell
        theme={theme}
        nav={buildPlatformNav(locale)}
        active="switchboard"
        brandLabel={t("app.name")}
        brandSubLabel={t("app.sub")}
        breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
        env="production"
        versionLabel="canvas"
        avatarLabel={locale === "en" ? "PA" : "平台"}
        style={{ height: "100%" }}
      >
        <div style={pageBodyStyle}>
          <CanvasPageHeader
            theme={theme}
            title={copy.title}
            subtitle={copy.subtitle}
            tabs={tabItems.map((tab) => tab.label)}
            activeTab={activeTabLabel}
            actions={
              <>
                <CanvasBtn
                  theme={theme}
                  icon="plus"
                  onClick={() => {
                    setActiveTab("publicInfo");
                    setShowPublicInfoForm((current) => !current);
                  }}
                >
                  {showPublicInfoForm
                    ? t("switchboard.hidePublicInfoForm")
                    : t("switchboard.createDraftVersion")}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  icon="check"
                  disabled={!latestDraftVersion || publishingVersionId != null}
                  onClick={() =>
                    latestDraftVersion
                      ? void handlePublish(latestDraftVersion.versionId)
                      : undefined
                  }
                >
                  {publishingVersionId === latestDraftVersion?.versionId
                    ? t("switchboard.publishing")
                    : t("switchboard.publishDraft")}
                </CanvasBtn>
              </>
            }
          />

          {error ? (
            <CanvasBanner
              theme={theme}
              tone="danger"
              icon="warn"
              title={getPlatformLabel(locale, "error")}
              body={error}
            />
          ) : null}

          <CanvasBanner
            theme={theme}
            tone="info"
            icon="info"
            title={copy.bannerTitle}
            body={copy.bannerBody}
          />

          <KpiRow minWidth="180px">
            <KpiCard
              label={copy.kpiPublished}
              value={publishedVersions.length}
              detail={copy.kpiPublishedDetail}
              tone="success"
            />
            <KpiCard
              label={copy.kpiDrafts}
              value={draftVersions.length}
              detail={copy.kpiDraftsDetail}
              tone="warning"
            />
            <KpiCard
              label={copy.kpiPlacards}
              value={placards.length}
              detail={copy.kpiPlacardsDetail}
              tone="info"
            />
            <KpiCard
              label={copy.kpiTied}
              value={placardsTiedToLiveCount}
              detail={copy.kpiTiedDetail}
              tone="platform"
            />
          </KpiRow>

          <div style={splitLayoutStyle}>
            <div style={mainColumnStyle}>
              {renderVersionsTable()}
            </div>

            <div style={sideColumnStyle}>
              <CanvasCard
                theme={theme}
                title={copy.previewTitle}
                subtitle={copy.previewSubtitle}
              >
                {previewPublicInfoVersion ? (
                  <div style={placardCardPreviewStyle}>
                    <div style={placardPreviewStyle}>
                      <strong style={{ textAlign: "center", fontSize: 13 }}>
                        {previewPublicInfoVersion.title}
                      </strong>
                      <div
                        style={{
                          borderTop: "1px solid #1a1a1a",
                          borderBottom: "1px solid #1a1a1a",
                          padding: "6px 0",
                          textAlign: "center",
                          fontWeight: 600,
                        }}
                      >
                        {getPlatformLabel(locale, "call")}：
                        {previewPublicInfoVersion.callPhone ?? "—"} {" "}
                        {getPlatformLabel(locale, "complaint")}：
                        {previewPublicInfoVersion.complaintPhone ?? "—"}
                      </div>
                      <div>{copy.vehicleLine}</div>
                      <div>
                        {previewPublicInfoVersion.fareText ??
                          previewPublicInfoVersion.callRateText ??
                          t("switchboard.noRateText")}
                      </div>
                      <div>
                        {copy.paymentPrefix}：
                        {previewPublicInfoVersion.paymentMethodText ?? "—"}
                      </div>
                      <div style={{ color: "#666" }}>
                        {copy.generatedFrom} {previewPublicInfoVersion.versionId} (
                        {formatEffectiveRange(locale, previewPublicInfoVersion)})
                      </div>
                    </div>
                    <div style={previewActionRowStyle}>
                      <CanvasBtn
                        theme={theme}
                        icon="copy"
                        disabled={!livePlacardVersion?.artifactDownloadUrl}
                        onClick={() => {
                          if (livePlacardVersion?.artifactDownloadUrl) {
                            window.open(
                              livePlacardVersion.artifactDownloadUrl,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }
                        }}
                      >
                        {t("payments.downloadPdf")}
                      </CanvasBtn>
                      <CanvasBtn
                        theme={theme}
                        variant="primary"
                        icon="plus"
                        onClick={() => {
                          setActiveTab("placards");
                          setShowPlacardForm((current) => !current);
                        }}
                      >
                        {showPlacardForm
                          ? t("switchboard.hidePlacardForm")
                          : t("switchboard.generatePlacardVersion")}
                      </CanvasBtn>
                    </div>
                  </div>
                ) : (
                  <p style={helperTextStyle}>{copy.noLivePlacard}</p>
                )}
              </CanvasCard>
              <CanvasCard
                theme={theme}
                title={copy.historyTitle}
                subtitle={copy.historySubtitle}
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: copy.historyLiveDisclosure,
                      v: livePublicInfoVersion ? (
                        `${livePublicInfoVersion.versionId} · ${formatEffectiveRange(locale, livePublicInfoVersion)}`
                      ) : (
                        <span style={mutedValueStyle}>{copy.noLiveVersion}</span>
                      ),
                      mono: Boolean(livePublicInfoVersion),
                    },
                    {
                      k: copy.historyCurrentPlacard,
                      v: livePlacardVersion ? (
                        `${livePlacardVersion.versionCode} · ${livePlacardVersion.templateName}`
                      ) : (
                        <span style={mutedValueStyle}>{copy.noLivePlacard}</span>
                      ),
                      mono: Boolean(livePlacardVersion),
                    },
                    {
                      k: copy.historyDraftPosture,
                      v: latestDraftVersion ? (
                        latestDraftVersion.versionId
                      ) : (
                        <span style={mutedValueStyle}>—</span>
                      ),
                      mono: true,
                    },
                    {
                      k: copy.historySelectedSource,
                      v: selectedPublicInfoVersion ? (
                        selectedPublicInfoVersion.versionId
                      ) : (
                        <span style={mutedValueStyle}>—</span>
                      ),
                      mono: true,
                    },
                  ]}
                />
              </CanvasCard>
            </div>
          </div>

          <CanvasCard
            theme={theme}
            title={copy.tabsTitle}
            subtitle={copy.tabsSubtitle}
          >
            <div style={cardStackStyle}>
              <div style={tabRailStyle}>
                {tabItems.map((tab) => (
                  <CanvasBtn
                    key={tab.key}
                    theme={theme}
                    variant={activeTab === tab.key ? "primary" : "secondary"}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </CanvasBtn>
                ))}
              </div>
              {renderActiveTabPanel()}
            </div>
          </CanvasCard>
        </div>
      </CanvasShell>
    </div>
  );
}
