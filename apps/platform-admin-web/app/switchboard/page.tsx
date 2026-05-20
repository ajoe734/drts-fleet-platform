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
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
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
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
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

type SwitchboardTab = "versions" | "placards" | "contacts" | "history";
type PublicInfoRow = PublicInfoVersionRecord & Record<string, unknown>;
type PlacardRow = PlacardVersionRecord & Record<string, unknown>;

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
  gap: 16,
  padding: 24,
} satisfies CSSProperties;

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
} satisfies CSSProperties;

const splitLayoutStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
} satisfies CSSProperties;

const mainColumnStyle = {
  flex: "1.6 1 680px",
  minWidth: 0,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const sideColumnStyle = {
  flex: "1 1 340px",
  minWidth: 300,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const stackedCellStyle = {
  display: "grid",
  gap: 4,
  minWidth: 0,
} satisfies CSSProperties;

const primaryTextStyle = {
  color: theme.text,
  fontWeight: 600,
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

const cardStackStyle = {
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const fieldGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
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

function cleanNullable(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function shortHash(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return `${value.slice(0, 12)}...`;
}

function publicInfoStatusTone(status: PublicInfoVersionRecord["status"]) {
  if (status === "published") {
    return "success" as const;
  }
  if (status === "retired") {
    return "neutral" as const;
  }
  return "warning" as const;
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

function formatEffectiveRange(
  locale: string,
  version: Pick<PublicInfoVersionRecord, "effectiveFrom" | "effectiveTo">,
) {
  const from = version.effectiveFrom ?? "—";
  const to = version.effectiveTo ?? (locale === "en" ? "open ended" : "未設定");
  return `${from} ~ ${to}`;
}

export default function SwitchboardPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const [publicInfo, setPublicInfo] = useState<PublicInfoVersionRecord[]>([]);
  const [placards, setPlacards] = useState<PlacardVersionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SwitchboardTab>("versions");
  const [showPublicInfoForm, setShowPublicInfoForm] = useState(false);
  const [showPlacardForm, setShowPlacardForm] = useState(false);
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
  const [publishingPlacardId, setPublishingPlacardId] = useState<string | null>(
    null,
  );

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

  const retiredVersions = useMemo(
    () => publicInfo.filter((version) => version.status === "retired"),
    [publicInfo],
  );

  const livePublicInfoVersion = publishedVersions[0] ?? null;
  const livePlacardVersion =
    placards.find((placard) => placard.publishedAt != null) ??
    placards[0] ??
    null;
  const latestDraftVersion = draftVersions[0] ?? null;
  const latestDraftPlacard =
    placards.find((placard) => placard.publishedAt == null) ?? null;

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

  const tabLabels = useMemo(
    () =>
      locale === "en"
        ? {
            versions: "Versions",
            placards: "Placards",
            contacts: "Public Contact",
            history: "History",
          }
        : {
            versions: "版本",
            placards: "牌貼",
            contacts: "公開聯絡",
            history: "歷史",
          },
    [locale],
  );

  const headerTabs = [
    tabLabels.versions,
    tabLabels.placards,
    tabLabels.contacts,
    tabLabels.history,
  ];

  const activeHeaderTab =
    activeTab === "versions"
      ? tabLabels.versions
      : activeTab === "placards"
        ? tabLabels.placards
        : activeTab === "contacts"
          ? tabLabels.contacts
          : tabLabels.history;

  const bannerCopy =
    locale === "en"
      ? {
          title: "Public disclosure versions and placard lineage stay governed together",
          body: "Draft, publish, and placard generation all share one surface so rider disclosure never drifts away from the physical seatback artifact.",
          eyebrow: "Disclosure Governance",
          breadcrumbParent: "Fleet & Compliance",
          pageTitle: "Switchboard",
          contactTitle: "Live public contact posture",
          contactNote:
            "This tab keeps current public phones, fare text, and payment disclosures in a DL layout while still using the same underlying public-info records.",
          historyTitle: "Immutable lineage framing",
          historyNote:
            "Published public info and published placards remain immutable. Drafts are the only editable stage.",
          noLiveVersion: "No published public info version yet.",
          noLivePlacard: "No placard artifact generated yet.",
          createHint: "Create draft versions here, then publish them from the row controls or the header action.",
          placardHint:
            "Generate placards from a published source version and keep download metadata server-controlled.",
          previewTitle: livePlacardVersion
            ? `Current placard (${livePlacardVersion.versionCode})`
            : "Current placard",
          previewFallback: "No published placard yet.",
          historyEmpty: "No immutable history available yet.",
          publishLatest: "Publish latest draft",
          publishLatestPlacard: "Publish latest placard",
        }
      : {
          title: "公開揭露版本與牌貼沿革一起維護",
          body: "草稿、發布與牌貼生成共用同一治理畫面，避免 rider disclosure 與實體 seatback artifact 脫鉤。",
          eyebrow: "Disclosure Governance",
          breadcrumbParent: "車隊與合規",
          pageTitle: "Switchboard",
          contactTitle: "現行公開聯絡姿態",
          contactNote:
            "此分頁以 DL 呈現目前公開電話、費率與支付揭露，但底層仍沿用同一組 public-info records。",
          historyTitle: "不可變沿革框架",
          historyNote:
            "已發布的公開資訊與已發布牌貼都保持 immutable；只有草稿階段可以編輯或刪除。",
          noLiveVersion: "目前尚無已發布公開資訊版本。",
          noLivePlacard: "目前尚未產生牌貼成品。",
          createHint: "先在這裡建立草稿版本，再從列操作或頁首按鈕發布。",
          placardHint:
            "牌貼需從已允許的來源版本生成，下載 metadata 維持由伺服器治理。",
          previewTitle: livePlacardVersion
            ? `目前發行牌貼 (${livePlacardVersion.versionCode})`
            : "目前發行牌貼",
          previewFallback: "尚未有已發布牌貼。",
          historyEmpty: "目前尚無不可變沿革資料。",
          publishLatest: "發布最新草稿",
          publishLatestPlacard: "發布最新牌貼",
        };

  async function handleCreatePublicInfo(event: FormEvent) {
    event.preventDefault();
    setCreatingPublicInfo(true);
    setError(null);
    try {
      await client.createPublicInfoVersion({
        title: publicInfoForm.title.trim(),
        callPhone: cleanNullable(publicInfoForm.callPhone ?? ""),
        complaintPhone: cleanNullable(publicInfoForm.complaintPhone ?? ""),
        callRateText: cleanNullable(publicInfoForm.callRateText ?? ""),
        fareText: cleanNullable(publicInfoForm.fareText ?? ""),
        paymentMethodText: cleanNullable(
          publicInfoForm.paymentMethodText ?? "",
        ),
        effectiveFrom: cleanNullable(publicInfoForm.effectiveFrom ?? ""),
        effectiveTo: cleanNullable(publicInfoForm.effectiveTo ?? ""),
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

  async function handlePublishPlacard(placardVersionId: string) {
    setPublishingPlacardId(placardVersionId);
    setError(null);
    try {
      await client.publishPlacardVersion(placardVersionId);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingPlacardId(null);
    }
  }

  const publicInfoColumns = useMemo<CanvasTableColumn<PublicInfoRow>[]>(
    () => [
      {
        h: t("switchboard.col.version"),
        w: 190,
        r: (version) => (
          <div style={stackedCellStyle}>
            <span style={primaryTextStyle}>{version.title}</span>
            <span style={monoTextStyle}>{version.versionId}</span>
          </div>
        ),
      },
      {
        h: t("pricing.col.effectiveFrom"),
        w: 150,
        mono: true,
        r: (version) => version.effectiveFrom ?? "—",
      },
      {
        h: t("pricing.col.effectiveTo"),
        w: 150,
        mono: true,
        r: (version) => version.effectiveTo ?? "—",
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
        w: 150,
        r: (version) => (
          <div style={stackedCellStyle}>
            <span>
              <CanvasPill
                theme={theme}
                tone={publicInfoStatusTone(version.status)}
                dot
              >
                {formatPlatformCodeLabel(locale, version.status)}
              </CanvasPill>
            </span>
            <span style={secondaryTextStyle}>
              {version.publishedBy ?? t("switchboard.immutableHistory")}
            </span>
          </div>
        ),
      },
      {
        h: getPlatformLabel(locale, "updatedAt"),
        w: 220,
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
                {formatDateTime(version.publishedAt ?? "")}
              </span>
            )}
          </div>
        ),
      },
    ],
    [
      deletingVersionId,
      locale,
      publishingVersionId,
      t,
    ],
  );

  const placardColumns = useMemo<CanvasTableColumn<PlacardRow>[]>(
    () => [
      {
        h: t("switchboard.col.placardId"),
        w: 180,
        r: (placard) => (
          <div style={stackedCellStyle}>
            <span style={primaryTextStyle}>{placard.versionCode}</span>
            <span style={monoTextStyle}>{placard.placardVersionId}</span>
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
              <span style={primaryTextStyle}>
                {sourceVersion?.title ?? placard.publicInfoVersionId}
              </span>
              <span style={monoTextStyle}>{placard.publicInfoVersionId}</span>
            </div>
          );
        },
      },
      {
        h: t("switchboard.col.template"),
        w: 140,
        mono: true,
        k: "templateName",
      },
      {
        h: t("switchboard.col.artifact"),
        w: 220,
        r: (placard) => (
          <div style={stackedCellStyle}>
            <span style={monoTextStyle}>
              {placard.artifactFileId ??
                getPlatformLabel(locale, "pendingArtifactId")}
            </span>
            <span style={monoTextStyle}>{shortHash(placard.artifactManifestHash)}</span>
            {placard.artifactDownloadUrl ? (
              <a
                href={placard.artifactDownloadUrl}
                rel="noreferrer"
                target="_blank"
                style={{ color: theme.accent, fontSize: 11.5 }}
              >
                {t("payments.downloadPdf")}
              </a>
            ) : (
              <span style={secondaryTextStyle}>—</span>
            )}
          </div>
        ),
      },
      {
        h: getPlatformLabel(locale, "status"),
        w: 120,
        r: (placard) => (
          <CanvasPill
            theme={theme}
            tone={placard.publishedAt ? "success" : "warning"}
            dot
          >
            {formatPlatformCodeLabel(
              locale,
              placard.publishedAt ? "published" : "draft",
            )}
          </CanvasPill>
        ),
      },
      {
        h: getPlatformLabel(locale, "updatedAt"),
        w: 220,
        r: (placard) => (
          <div style={stackedCellStyle}>
            <span style={monoTextStyle}>{formatDateTime(placard.updatedAt)}</span>
            <span style={secondaryTextStyle}>
              {formatDateTime(placard.publishedAt ?? placard.createdAt)}
            </span>
            {!placard.publishedAt ? (
              <div style={rowActionStyle}>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  size="xs"
                  icon="check"
                  disabled={publishingPlacardId === placard.placardVersionId}
                  onClick={() =>
                    void handlePublishPlacard(placard.placardVersionId)
                  }
                >
                  {publishingPlacardId === placard.placardVersionId
                    ? t("switchboard.publishing")
                    : t("common.publish")}
                </CanvasBtn>
              </div>
            ) : null}
          </div>
        ),
      },
    ],
    [locale, publicInfoById, publishingPlacardId, t],
  );

  const immutablePublicInfoRows = useMemo(
    () => publicInfo.filter((version) => version.status !== "draft"),
    [publicInfo],
  );

  const renderHeaderActions = () => (
    <>
      <CanvasBtn
        theme={theme}
        icon="plus"
        onClick={() => {
          setActiveTab("versions");
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
          : bannerCopy.publishLatest}
      </CanvasBtn>
    </>
  );

  const renderPublicInfoForm = () => (
    <CanvasCard
      theme={theme}
      title={t("switchboard.newPublicInfoVersion")}
      subtitle={bannerCopy.createHint}
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
                  : "現金、信用卡、企業簽單"
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
      subtitle={bannerCopy.placardHint}
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

  const renderContactsCard = () => (
    <CanvasCard
      theme={theme}
      title={bannerCopy.contactTitle}
      subtitle={bannerCopy.contactNote}
    >
      <CanvasDL
        theme={theme}
        cols={2}
        items={[
          {
            label: t("switchboard.form.title"),
            value: livePublicInfoVersion?.title ?? bannerCopy.noLiveVersion,
          },
          {
            label: t("switchboard.form.sourceVersion"),
            value: livePublicInfoVersion?.versionId ?? "—",
            mono: true,
          },
          {
            label: t("switchboard.form.callPhone"),
            value: livePublicInfoVersion?.callPhone ?? "—",
            mono: true,
          },
          {
            label: t("switchboard.form.complaintPhone"),
            value: livePublicInfoVersion?.complaintPhone ?? "—",
            mono: true,
          },
          {
            label: t("switchboard.form.callRateText"),
            value:
              livePublicInfoVersion?.callRateText ?? t("switchboard.noRateText"),
          },
          {
            label: t("switchboard.form.paymentMethodText"),
            value: livePublicInfoVersion?.paymentMethodText ?? "—",
          },
          {
            label: t("switchboard.form.effectiveFrom"),
            value: livePublicInfoVersion?.effectiveFrom ?? "—",
            mono: true,
          },
          {
            label: t("switchboard.form.effectiveTo"),
            value: livePublicInfoVersion?.effectiveTo ?? "—",
            mono: true,
          },
        ]}
      />
    </CanvasCard>
  );

  const renderHistoryCard = () => (
    <CanvasCard
      theme={theme}
      title={bannerCopy.historyTitle}
      subtitle={bannerCopy.historyNote}
    >
      {immutablePublicInfoRows.length === 0 && placards.length === 0 ? (
        <p style={helperTextStyle}>{bannerCopy.historyEmpty}</p>
      ) : (
        <CanvasDL
          theme={theme}
          cols={1}
          items={[
            {
              label: locale === "en" ? "Live disclosure" : "目前生效揭露",
              value: livePublicInfoVersion
                ? `${livePublicInfoVersion.versionId} · ${formatEffectiveRange(locale, livePublicInfoVersion)}`
                : bannerCopy.noLiveVersion,
              mono: !livePublicInfoVersion,
            },
            {
              label: locale === "en" ? "Current placard" : "現行牌貼",
              value: livePlacardVersion
                ? `${livePlacardVersion.versionCode} · ${livePlacardVersion.templateName}`
                : bannerCopy.noLivePlacard,
            },
            {
              label: locale === "en" ? "Published versions" : "已發布版本數",
              value: String(publishedVersions.length),
              mono: true,
            },
            {
              label: locale === "en" ? "Retired versions" : "已退役版本數",
              value: String(retiredVersions.length),
              mono: true,
            },
          ]}
        />
      )}
    </CanvasCard>
  );

  const renderMainContent = () => {
    if (activeTab === "placards") {
      return (
        <>
          <CanvasCard
            theme={theme}
            padding={0}
            title={t("switchboard.tab.placards")}
            subtitle={bannerCopy.placardHint}
            actions={
              <>
                <CanvasBtn
                  theme={theme}
                  icon="refresh"
                  onClick={() => void loadData()}
                >
                  {t("common.refresh")}
                </CanvasBtn>
                <CanvasBtn
                  theme={theme}
                  variant="primary"
                  icon="check"
                  disabled={!latestDraftPlacard || publishingPlacardId != null}
                  onClick={() =>
                    latestDraftPlacard
                      ? void handlePublishPlacard(
                          latestDraftPlacard.placardVersionId,
                        )
                      : undefined
                  }
                >
                  {publishingPlacardId === latestDraftPlacard?.placardVersionId
                    ? t("switchboard.publishing")
                    : bannerCopy.publishLatestPlacard}
                </CanvasBtn>
              </>
            }
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
          {showPlacardForm ? renderPlacardForm() : null}
        </>
      );
    }

    if (activeTab === "contacts") {
      return (
        <>
          {renderContactsCard()}
          {showPublicInfoForm ? renderPublicInfoForm() : null}
        </>
      );
    }

    if (activeTab === "history") {
      return (
        <>
          <CanvasCard
            theme={theme}
            padding={0}
            title={bannerCopy.historyTitle}
            subtitle={bannerCopy.historyNote}
          >
            {immutablePublicInfoRows.length === 0 ? (
              <div style={{ padding: 16 }}>
                <p style={helperTextStyle}>{bannerCopy.historyEmpty}</p>
              </div>
            ) : (
              <CanvasTable<PublicInfoRow>
                theme={theme}
                rows={immutablePublicInfoRows}
                columns={publicInfoColumns}
              />
            )}
          </CanvasCard>
          {renderHistoryCard()}
        </>
      );
    }

    return (
      <>
        <CanvasCard
          theme={theme}
          padding={0}
          title="Public info versions"
          subtitle="版本 · effective 區間 · 公開聯絡 · 狀態"
          actions={
            <CanvasBtn theme={theme} icon="refresh" onClick={() => void loadData()}>
              {t("common.refresh")}
            </CanvasBtn>
          }
        >
          {publicInfo.length === 0 ? (
            <div style={{ padding: 16 }}>
              <p style={helperTextStyle}>{t("switchboard.noPublicInfo")}</p>
            </div>
          ) : (
            <CanvasTable<PublicInfoRow>
              theme={theme}
              rows={publicInfo}
              columns={publicInfoColumns}
            />
          )}
        </CanvasCard>
        {showPublicInfoForm ? renderPublicInfoForm() : null}
      </>
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
        breadcrumb={[bannerCopy.breadcrumbParent, bannerCopy.pageTitle]}
        env="production"
        versionLabel="canvas"
        avatarLabel={locale === "en" ? "PA" : "平台"}
        style={{ height: "100%" }}
      >
        <div style={pageBodyStyle}>
          <CanvasPageHeader
            theme={theme}
            eyebrow={bannerCopy.eyebrow}
            title={locale === "en" ? "Public Info & Placards" : "法定資訊與牌貼"}
            subtitle="public info versioning · placard generation · publish"
            tabs={headerTabs}
            activeTab={activeHeaderTab}
            actions={renderHeaderActions()}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(Object.entries(tabLabels) as [SwitchboardTab, string][]).map(
              ([tabKey, label]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setActiveTab(tabKey)}
                  style={{
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <CanvasPill
                    theme={theme}
                    tone={activeTab === tabKey ? "accent" : "neutral"}
                  >
                    {label}
                  </CanvasPill>
                </button>
              ),
            )}
          </div>

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
            title={bannerCopy.title}
            body={bannerCopy.body}
          />

          <div style={kpiGridStyle}>
            <CanvasKPI
              theme={theme}
              label={t("switchboard.publishedPublicInfo")}
              value={publishedVersions.length}
              sub={t("switchboard.publishedPublicInfoNote")}
            />
            <CanvasKPI
              theme={theme}
              label={t("switchboard.draftPublicInfo")}
              value={draftVersions.length}
              sub={t("switchboard.draftPublicInfoNote")}
            />
            <CanvasKPI
              theme={theme}
              label={t("switchboard.placardVersions")}
              value={placards.length}
              sub={t("switchboard.placardVersionsNote")}
            />
            <CanvasKPI
              theme={theme}
              label={t("switchboard.placardsTiedToLive")}
              value={
                placards.filter((placard) => {
                  const source = publicInfoById[placard.publicInfoVersionId];
                  return source?.status === "published";
                }).length
              }
              sub={t("switchboard.placardsTiedToLiveNote")}
            />
          </div>

          <div style={splitLayoutStyle}>
            <div style={mainColumnStyle}>{renderMainContent()}</div>

            <div style={sideColumnStyle}>
              <CanvasCard theme={theme} title={bannerCopy.previewTitle}>
                {previewPublicInfoVersion ? (
                  <div style={cardStackStyle}>
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
                        {previewPublicInfoVersion.callPhone ?? "—"} {"  "}
                        {getPlatformLabel(locale, "complaint")}：
                        {previewPublicInfoVersion.complaintPhone ?? "—"}
                      </div>
                      <div>車輛編號 ARJ-2891 / 駕駛 林志偉</div>
                      <div>
                        {previewPublicInfoVersion.callRateText ??
                          t("switchboard.noRateText")}
                      </div>
                      <div>
                        {previewPublicInfoVersion.paymentMethodText ?? "—"}
                      </div>
                      <div style={{ color: "#666" }}>
                        {locale === "en" ? "Generated from" : "本牌貼依"}{" "}
                        {previewPublicInfoVersion.versionId} (
                        {formatEffectiveRange(locale, previewPublicInfoVersion)})
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
                  <p style={helperTextStyle}>{bannerCopy.previewFallback}</p>
                )}
              </CanvasCard>

              {renderHistoryCard()}

              <CanvasCard
                theme={theme}
                title={locale === "en" ? "Live governance" : "現況治理摘要"}
              >
                <CanvasDL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      label: locale === "en" ? "Live disclosure" : "目前生效揭露",
                      value: livePublicInfoVersion?.versionId ?? bannerCopy.noLiveVersion,
                    },
                    {
                      label: locale === "en" ? "Current placard" : "現行牌貼",
                      value:
                        livePlacardVersion?.versionCode ?? bannerCopy.noLivePlacard,
                    },
                    {
                      label: locale === "en" ? "Selected source" : "目前來源版本",
                      value: selectedPublicInfoVersion?.versionId ?? "—",
                      mono: true,
                    },
                    {
                      label: locale === "en" ? "Artifact hash" : "成品雜湊",
                      value: shortHash(livePlacardVersion?.artifactManifestHash),
                      mono: true,
                    },
                  ]}
                />
              </CanvasCard>
            </div>
          </div>
        </div>
      </CanvasShell>
    </div>
  );
}
