/**
 * Switchboard Page
 * Public information versioning and placard generation for platform compliance.
 */

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
  getPlacardSourceSelectionHint,
  getPreferredPlacardSourceVersion,
  getPlacardRetiredSourceAuditNote,
  isPlacardSourceSelectionBlocked,
} from "./placard-source";

type PlacardFormState = {
  versionCode: string;
  publicInfoVersionId: string;
  templateName: string;
  artifactFileId: string;
};

type PublicInfoTableRow = PublicInfoVersionRecord & Record<string, unknown>;
type PlacardTableRow = PlacardVersionRecord & Record<string, unknown>;

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

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const shellStyle = {
  margin: "-32px",
  minHeight: "calc(100vh - 64px)",
} satisfies CSSProperties;

const pageStackStyle = {
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
  flex: "1.65 1 640px",
  minWidth: 0,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const sideColumnStyle = {
  flex: "1 1 320px",
  minWidth: 280,
  display: "grid",
  gap: 16,
} satisfies CSSProperties;

const formGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0 14px",
} satisfies CSSProperties;

const headerActionRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  justifyContent: "flex-end",
} satisfies CSSProperties;

const tabButtonStyle = {
  appearance: "none",
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
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

const submitButtonStyle = (
  disabled: boolean,
  tone: "primary" | "secondary" = "primary",
): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "8px 14px",
  minHeight: 34,
  fontSize: 13,
  fontWeight: 600,
  background: tone === "primary" ? theme.accent : theme.surface,
  color: tone === "primary" ? "#fff" : theme.text,
  border: `1px solid ${tone === "primary" ? theme.accent : theme.border}`,
  borderRadius: 7,
  cursor: disabled ? "not-allowed" : "pointer",
  opacity: disabled ? 0.55 : 1,
  fontFamily: theme.fontFamily,
});

const tableCellStackStyle = {
  display: "grid",
  gap: 2,
  minWidth: 0,
} satisfies CSSProperties;

const tableActionStackStyle = {
  display: "grid",
  gap: 8,
  minWidth: 144,
} satisfies CSSProperties;

const cellPrimaryStyle = {
  color: theme.text,
  fontWeight: 600,
} satisfies CSSProperties;

const cellMutedStyle = {
  color: theme.textMuted,
  fontSize: 11.5,
  lineHeight: 1.4,
} satisfies CSSProperties;

const cellMonoStyle = {
  color: theme.textDim,
  fontFamily: theme.monoFamily,
  fontSize: 11,
  lineHeight: 1.35,
} satisfies CSSProperties;

const emptyStateStyle = {
  color: theme.textMuted,
  fontSize: 12.5,
} satisfies CSSProperties;

const placardPreviewStyle = {
  background: "#fcfaf2",
  border: "1px solid #d7d0bd",
  borderRadius: 12,
  padding: 14,
  display: "grid",
  gap: 8,
  color: "#1a1a1a",
  fontSize: 11.5,
  lineHeight: 1.55,
} satisfies CSSProperties;

const placardPreviewTitleStyle = {
  textAlign: "center",
  fontSize: 13,
  fontWeight: 700,
} satisfies CSSProperties;

const placardPreviewDividerStyle = {
  borderTop: "1px solid #1a1a1a",
  borderBottom: "1px solid #1a1a1a",
  padding: "6px 0",
  textAlign: "center",
  fontWeight: 600,
} satisfies CSSProperties;

const placardPreviewNoteStyle = {
  color: "#666",
  fontSize: 10.5,
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

function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  return value.slice(0, 10);
}

function publicInfoPillTone(status: PublicInfoVersionRecord["status"]) {
  if (status === "published") {
    return "success" as const;
  }
  if (status === "retired") {
    return "neutral" as const;
  }
  return "warn" as const;
}

function placardPillTone(record: PlacardVersionRecord) {
  return record.publishedAt ? ("success" as const) : ("warn" as const);
}

function buildPlatformNav(
  locale: string,
  t: (key: string) => string,
): CanvasShellNavItem[] {
  return [
    { divider: locale === "en" ? "Workspace" : "工作面" },
    { key: "home", href: "/", icon: "home", label: t("nav.home") },
    { key: "health", href: "/health", icon: "health", label: t("nav.health") },
    { divider: locale === "en" ? "Tenant Governance" : "租戶治理" },
    {
      key: "tenants",
      href: "/tenants",
      icon: "tenants",
      label: t("nav.tenants"),
    },
    {
      key: "partners",
      href: "/partners",
      icon: "partners",
      label: t("nav.partners"),
    },
    { key: "users", href: "/users", icon: "users", label: t("nav.users") },
    { divider: locale === "en" ? "Fleet & Compliance" : "車隊與法遵" },
    { key: "fleet", href: "/fleet", icon: "fleet", label: t("nav.fleet") },
    {
      key: "switchboard",
      href: "/switchboard",
      icon: "switchboard",
      label: locale === "en" ? "Public info & placards" : "法定資訊與牌貼",
    },
    { divider: locale === "en" ? "Pricing & Settlement" : "計價與結算" },
    {
      key: "pricing",
      href: "/pricing",
      icon: "pricing",
      label: t("nav.pricing"),
    },
    {
      key: "payments",
      href: "/payments",
      icon: "payments",
      label: t("nav.payments"),
    },
    { divider: locale === "en" ? "Platform Layer" : "平台層" },
    {
      key: "notices",
      href: "/notices",
      icon: "notices",
      label: t("nav.notices"),
    },
    { key: "audit", href: "/audit", icon: "audit", label: t("nav.audit") },
    {
      key: "flags",
      href: "/feature-flags",
      icon: "flags",
      label: t("nav.featureFlags"),
      matchPaths: ["/feature-flags"],
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
  const [activeTab, setActiveTab] = useState<"public-info" | "placards">(
    "public-info",
  );
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
      ) as Record<string, PublicInfoVersionRecord>,
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
  const livePlacardVersion =
    placards.find((placard) => placard.publishedAt != null) ??
    placards[0] ??
    null;
  const tiedToLivePlacards = placards.filter((placard) => {
    const source = publicInfoById[placard.publicInfoVersionId];
    return source?.status === "published";
  }).length;
  const latestDraftVersion = draftVersions[0] ?? null;
  const previewSourceVersion =
    (livePlacardVersion
      ? publicInfoById[livePlacardVersion.publicInfoVersionId]
      : null) ??
    livePublicInfoVersion ??
    publicInfo[0] ??
    null;
  const initialLoading =
    loading && publicInfo.length === 0 && placards.length === 0 && !error;

  const copy =
    locale === "en"
      ? {
          pageTitle: "Public info & placards",
          pageSubtitle: "public info versioning · placard generation · publish",
          breadcrumbParent: "Fleet & Compliance",
          tabs: ["Versions", "Placards", "Public contact", "History"],
          activeLaneVersions: "Public info table",
          activeLanePlacards: "Placard table",
          noLivePlacardPill: "No placard live",
          bannerTitle:
            "Public disclosure and placard lineage stay governed together",
          bannerBody:
            "Draft creation, publish flow, and placard generation stay on one operator surface so rider disclosure and physical placards do not drift.",
          versionsTitle: "Public info versions",
          versionsSubtitle:
            "Version, effective window, public contact, and status stay tabled in the primary governance lane.",
          placardsTitle: "Placard versions",
          placardsSubtitle:
            "Placard lineage, artifact, and publication state remain traceable from the same screen.",
          previewTitle: livePlacardVersion
            ? `Current placard (${livePlacardVersion.versionCode})`
            : "Current placard",
          previewSubtitle:
            "Placard preview aligned to the currently published disclosure source.",
          previewEmpty:
            "No placard artifact generated yet. Generate a new version from a published disclosure source.",
          previewBrand: "Passenger Information Placard",
          previewDownload: "Download PDF",
          previewWindowLabel: "Generated from",
          contactTitle: "Public contact & fare copy",
          contactSubtitle:
            "Live disclosure content currently exposed to riders and placard generation.",
          historyTitle: "History framing",
          historySubtitle:
            "Drafts can be edited or deleted until publication. Published records remain immutable.",
          openEnded: "open ended",
          noLiveVersion: "No published public info version yet.",
          noDraft: "No draft version in queue.",
          awaitingPublish: "awaiting publish",
          liveDisclosure: "Live disclosure",
          currentPlacard: "Current placard",
          draftPosture: "Draft posture",
          sourceStatus: "Source status",
          template: "Template",
          artifactHash: "Artifact hash",
          effectiveWindow: "Effective window",
          callRate: "Call rate copy",
          fareCopy: "Fare copy",
          paymentCopy: "Payment copy",
          searchPlaceholder: "Search placards, tenants, audits...",
        }
      : {
          pageTitle: "法定資訊與牌貼",
          pageSubtitle: "public info versioning · placard generation · publish",
          breadcrumbParent: "車隊與法遵",
          tabs: ["版本", "牌貼", "公開聯絡", "歷史"],
          activeLaneVersions: "公開資訊表格",
          activeLanePlacards: "牌貼表格",
          noLivePlacardPill: "尚無現行牌貼",
          bannerTitle: "公開揭露版本與牌貼沿革一起治理",
          bannerBody:
            "草稿建立、發佈與牌貼生成留在同一個操作面，避免 rider disclosure 與實體貼紙脫鉤。",
          versionsTitle: "Public info versions",
          versionsSubtitle: "版本、effective 區間、公開聯絡與狀態維持表格化。",
          placardsTitle: "Placard versions",
          placardsSubtitle: "牌貼沿革、成品與發佈狀態留在同一畫面追蹤。",
          previewTitle: livePlacardVersion
            ? `目前發行牌貼 (${livePlacardVersion.versionCode})`
            : "目前發行牌貼",
          previewSubtitle: "依目前公開資訊來源生成的牌貼預覽。",
          previewEmpty:
            "目前尚未產生牌貼成品。請從已發布的公開資訊版本建立新牌貼。",
          previewBrand: "乘客提示牌",
          previewDownload: "下載 PDF",
          previewWindowLabel: "本牌貼依",
          contactTitle: "公開聯絡與票價文案",
          contactSubtitle: "目前對乘客公開的聯絡、費率與支付說明。",
          historyTitle: "History framing",
          historySubtitle:
            "草稿可刪除；已發布版本與牌貼維持 immutable lineage。",
          openEnded: "未設定結束",
          noLiveVersion: "目前尚無已發布公開資訊版本。",
          noDraft: "目前沒有待發布草稿。",
          awaitingPublish: "等待發布",
          liveDisclosure: "目前生效揭露",
          currentPlacard: "現行牌貼",
          draftPosture: "草稿狀態",
          sourceStatus: "來源狀態",
          template: "範本",
          artifactHash: "成品雜湊",
          effectiveWindow: "生效區間",
          callRate: "通話費率文案",
          fareCopy: "票價文案",
          paymentCopy: "付款方式文案",
          searchPlaceholder: "搜尋牌貼、租戶、稽核...",
        };

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

  async function handleCreatePublicInfo(event: FormEvent<HTMLFormElement>) {
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

  async function handleGeneratePlacard(event: FormEvent<HTMLFormElement>) {
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

  const publicInfoColumns: CanvasTableColumn<PublicInfoTableRow>[] = [
    {
      h: t("switchboard.col.version"),
      w: 180,
      r: (version) => (
        <div style={tableCellStackStyle}>
          <div style={cellPrimaryStyle}>{version.title}</div>
          <div style={cellMonoStyle}>{version.versionId}</div>
        </div>
      ),
    },
    {
      h: t("switchboard.form.effectiveFrom"),
      w: 124,
      mono: true,
      r: (version) => formatShortDate(version.effectiveFrom),
    },
    {
      h: t("switchboard.form.effectiveTo"),
      w: 124,
      mono: true,
      r: (version) =>
        version.effectiveTo
          ? formatShortDate(version.effectiveTo)
          : copy.openEnded,
    },
    {
      h: t("switchboard.form.callPhone"),
      w: 138,
      mono: true,
      r: (version) => version.callPhone ?? "—",
    },
    {
      h: t("switchboard.form.complaintPhone"),
      w: 138,
      mono: true,
      r: (version) => version.complaintPhone ?? "—",
    },
    {
      h: t("common.status"),
      w: 120,
      r: (version) => (
        <CanvasPill
          theme={theme}
          tone={publicInfoPillTone(version.status)}
          dot={version.status !== "retired"}
        >
          {formatPlatformCodeLabel(locale, version.status)}
        </CanvasPill>
      ),
    },
    {
      h: locale === "en" ? "Updated" : "更新",
      w: 156,
      r: (version) => (
        <div style={tableCellStackStyle}>
          <div style={cellMonoStyle}>
            {formatShortDate(version.publishedAt ?? version.createdAt)}
          </div>
          <div style={cellMutedStyle}>{formatDateTime(version.createdAt)}</div>
        </div>
      ),
    },
    {
      h: t("switchboard.col.actions"),
      w: 164,
      r: (version) =>
        version.status === "draft" ? (
          <div style={tableActionStackStyle}>
            <CanvasBtn
              theme={theme}
              variant="primary"
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
              danger
              icon="x"
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
          <span style={cellMutedStyle}>
            {t("switchboard.immutableHistory")}
          </span>
        ),
    },
  ];

  const placardColumns: CanvasTableColumn<PlacardTableRow>[] = [
    {
      h: t("switchboard.col.placardId"),
      w: 176,
      r: (placard) => (
        <div style={tableCellStackStyle}>
          <div style={cellPrimaryStyle}>{placard.versionCode}</div>
          <div style={cellMonoStyle}>{placard.placardVersionId}</div>
        </div>
      ),
    },
    {
      h: t("switchboard.col.sourceVersion"),
      w: 160,
      r: (placard) => {
        const sourceVersion = publicInfoById[placard.publicInfoVersionId];
        return (
          <div style={tableCellStackStyle}>
            <div style={cellPrimaryStyle}>
              {sourceVersion?.title ?? placard.publicInfoVersionId}
            </div>
            <div style={cellMonoStyle}>
              {sourceVersion?.versionId ?? placard.publicInfoVersionId}
            </div>
          </div>
        );
      },
    },
    {
      h: t("switchboard.col.template"),
      w: 132,
      mono: true,
      r: (placard) => placard.templateName,
    },
    {
      h: t("switchboard.col.artifact"),
      w: 196,
      r: (placard) => (
        <div style={tableCellStackStyle}>
          <div style={cellMonoStyle}>
            {placard.artifactFileId ??
              getPlatformLabel(locale, "pendingArtifactId")}
          </div>
          <div style={cellMonoStyle}>
            {shortHash(placard.artifactManifestHash)}
          </div>
          <div style={cellMutedStyle}>
            {placard.artifactExpiresAt
              ? formatDateTime(placard.artifactExpiresAt)
              : "—"}
          </div>
        </div>
      ),
    },
    {
      h: t("common.status"),
      w: 120,
      r: (placard) => (
        <CanvasPill
          theme={theme}
          tone={placardPillTone(placard)}
          dot={!placard.publishedAt}
        >
          {formatPlatformCodeLabel(
            locale,
            placard.publishedAt ? "published" : "draft",
          )}
        </CanvasPill>
      ),
    },
    {
      h: t("switchboard.col.actions"),
      w: 156,
      r: (placard) =>
        !placard.publishedAt ? (
          <CanvasBtn
            theme={theme}
            variant="primary"
            icon="check"
            disabled={publishingPlacardId === placard.placardVersionId}
            onClick={() => void handlePublishPlacard(placard.placardVersionId)}
          >
            {publishingPlacardId === placard.placardVersionId
              ? t("switchboard.publishing")
              : t("common.publish")}
          </CanvasBtn>
        ) : (
          <span style={cellMutedStyle}>
            {t("switchboard.immutableHistory")}
          </span>
        ),
    },
  ];

  const publicInfoFormVisible =
    activeTab === "public-info" && showPublicInfoForm;
  const placardFormVisible = activeTab === "placards" && showPlacardForm;
  const activeHeaderTabs = [
    <button
      key="tab-public-info"
      type="button"
      onClick={() => setActiveTab("public-info")}
      style={tabButtonStyle}
    >
      {copy.tabs[0]}
    </button>,
    <button
      key="tab-placards"
      type="button"
      onClick={() => setActiveTab("placards")}
      style={tabButtonStyle}
    >
      {copy.tabs[1]}
    </button>,
    <span key="tab-contact">{copy.tabs[2]}</span>,
    <span key="tab-history">{copy.tabs[3]}</span>,
  ];
  const activeHeaderTab =
    activeTab === "placards" ? activeHeaderTabs[1] : activeHeaderTabs[0];
  const headerPillLabel =
    activeTab === "public-info"
      ? copy.activeLaneVersions
      : copy.activeLanePlacards;
  const headerActionLabel =
    activeTab === "public-info"
      ? showPublicInfoForm
        ? t("common.cancel")
        : t("switchboard.newPublicInfoVersion")
      : showPlacardForm
        ? t("common.cancel")
        : t("switchboard.generatePlacardVersion");
  const headerActionDisabled =
    activeTab === "placards" && publicInfo.length === 0;
  const currentContactSource = previewSourceVersion ?? livePublicInfoVersion;

  return (
    <CanvasShell
      theme={theme}
      nav={buildPlatformNav(locale, t)}
      active="switchboard"
      currentPath="/switchboard"
      brandLabel={t("app.name")}
      brandSubLabel={t("app.sub")}
      breadcrumb={[copy.breadcrumbParent, copy.pageTitle]}
      searchPlaceholder={copy.searchPlaceholder}
      avatarLabel={locale === "en" ? "PA" : "平台"}
      style={shellStyle}
    >
      <CanvasPageHeader
        theme={theme}
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        tabs={activeHeaderTabs}
        activeTab={activeHeaderTab}
        actions={
          <div style={headerActionRowStyle}>
            <CanvasPill
              theme={theme}
              tone={activeTab === "public-info" ? "warn" : "info"}
            >
              {headerPillLabel}
            </CanvasPill>
            <CanvasPill
              theme={theme}
              tone={livePlacardVersion?.publishedAt ? "success" : "neutral"}
            >
              {livePlacardVersion
                ? `${livePlacardVersion.versionCode} ${formatPlatformCodeLabel(
                    locale,
                    livePlacardVersion.publishedAt ? "published" : "draft",
                  )}`
                : copy.noLivePlacardPill}
            </CanvasPill>
            <CanvasBtn
              theme={theme}
              variant={
                publicInfoFormVisible || placardFormVisible
                  ? "secondary"
                  : "primary"
              }
              icon={publicInfoFormVisible || placardFormVisible ? "x" : "plus"}
              disabled={headerActionDisabled}
              onClick={() => {
                if (activeTab === "public-info") {
                  setShowPublicInfoForm((current) => !current);
                  setShowPlacardForm(false);
                  return;
                }
                setShowPlacardForm((current) => !current);
                setShowPublicInfoForm(false);
              }}
            >
              {headerActionLabel}
            </CanvasBtn>
            <CanvasBtn theme={theme} onClick={() => void loadData()}>
              {t("common.refresh")}
            </CanvasBtn>
          </div>
        }
      />

      <div style={pageStackStyle}>
        {error ? (
          <CanvasBanner
            theme={theme}
            tone="danger"
            title={getPlatformLabel(locale, "error")}
            body={error}
          />
        ) : null}

        <CanvasBanner
          theme={theme}
          tone="info"
          title={copy.bannerTitle}
          body={copy.bannerBody}
        />

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={theme}
            label={t("switchboard.publishedPublicInfo")}
            value={publishedVersions.length}
            sub={livePublicInfoVersion?.versionId ?? copy.noLiveVersion}
            hint={t("switchboard.publishedPublicInfoNote")}
          />
          <CanvasKPI
            theme={theme}
            label={t("switchboard.draftPublicInfo")}
            value={draftVersions.length}
            sub={latestDraftVersion?.versionId ?? copy.noDraft}
            hint={draftVersions.length > 0 ? copy.awaitingPublish : "—"}
          />
          <CanvasKPI
            theme={theme}
            label={t("switchboard.placardVersions")}
            value={placards.length}
            sub={livePlacardVersion?.templateName ?? copy.noLivePlacardPill}
            hint={t("switchboard.placardVersionsNote")}
          />
          <CanvasKPI
            theme={theme}
            label={t("switchboard.placardsTiedToLive")}
            value={tiedToLivePlacards}
            sub={previewSourceVersion?.versionId ?? "—"}
            hint={t("switchboard.placardsTiedToLiveNote")}
          />
        </div>

        <div style={splitLayoutStyle}>
          <div style={mainColumnStyle}>
            {initialLoading ? (
              <CanvasCard theme={theme} title={t("switchboard.loading")}>
                <div style={emptyStateStyle}>{t("switchboard.loading")}</div>
              </CanvasCard>
            ) : (
              <>
                {publicInfoFormVisible ? (
                  <CanvasCard
                    theme={theme}
                    title={t("switchboard.newPublicInfoVersion")}
                    subtitle={copy.versionsSubtitle}
                  >
                    <form onSubmit={handleCreatePublicInfo}>
                      <div style={formGridStyle}>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.title")}
                        >
                          <input
                            value={publicInfoForm.title ?? ""}
                            onChange={(event) =>
                              setPublicInfoForm({
                                ...publicInfoForm,
                                title: event.target.value,
                              })
                            }
                            style={inputBaseStyle()}
                            placeholder={
                              locale === "en"
                                ? "2026 Q3 public info"
                                : "2026 Q3 公開資訊版"
                            }
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.callPhone")}
                        >
                          <input
                            value={publicInfoForm.callPhone ?? ""}
                            onChange={(event) =>
                              setPublicInfoForm({
                                ...publicInfoForm,
                                callPhone: event.target.value,
                              })
                            }
                            style={inputBaseStyle(true)}
                            placeholder="0800-000-123"
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.complaintPhone")}
                        >
                          <input
                            value={publicInfoForm.complaintPhone ?? ""}
                            onChange={(event) =>
                              setPublicInfoForm({
                                ...publicInfoForm,
                                complaintPhone: event.target.value,
                              })
                            }
                            style={inputBaseStyle(true)}
                            placeholder="0800-000-456"
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.effectiveFrom")}
                        >
                          <input
                            value={publicInfoForm.effectiveFrom ?? ""}
                            onChange={(event) =>
                              setPublicInfoForm({
                                ...publicInfoForm,
                                effectiveFrom: event.target.value,
                              })
                            }
                            style={inputBaseStyle(true)}
                            placeholder="2026-07-01T00:00:00.000Z"
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.effectiveTo")}
                          hint={t("switchboard.form.effectiveToHint")}
                        >
                          <input
                            value={publicInfoForm.effectiveTo ?? ""}
                            onChange={(event) =>
                              setPublicInfoForm({
                                ...publicInfoForm,
                                effectiveTo: event.target.value,
                              })
                            }
                            style={inputBaseStyle(true)}
                            placeholder={t("switchboard.form.effectiveToHint")}
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.callRateText")}
                        >
                          <input
                            value={publicInfoForm.callRateText ?? ""}
                            onChange={(event) =>
                              setPublicInfoForm({
                                ...publicInfoForm,
                                callRateText: event.target.value,
                              })
                            }
                            style={inputBaseStyle()}
                            placeholder={
                              locale === "en" ? "Metered pricing" : "依表計費"
                            }
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.fareText")}
                        >
                          <input
                            value={publicInfoForm.fareText ?? ""}
                            onChange={(event) =>
                              setPublicInfoForm({
                                ...publicInfoForm,
                                fareText: event.target.value,
                              })
                            }
                            style={inputBaseStyle()}
                            placeholder={
                              locale === "en"
                                ? "Night and remote surcharges per notice"
                                : "夜間與偏遠加成依公告"
                            }
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.paymentMethodText")}
                        >
                          <input
                            value={publicInfoForm.paymentMethodText ?? ""}
                            onChange={(event) =>
                              setPublicInfoForm({
                                ...publicInfoForm,
                                paymentMethodText: event.target.value,
                              })
                            }
                            style={inputBaseStyle()}
                            placeholder={
                              locale === "en"
                                ? "Cash, credit card, corporate charge"
                                : "現金、信用卡、企業簽單"
                            }
                          />
                        </CanvasField>
                      </div>
                      <button
                        type="submit"
                        disabled={creatingPublicInfo}
                        style={submitButtonStyle(creatingPublicInfo)}
                      >
                        {creatingPublicInfo
                          ? t("switchboard.creating")
                          : t("switchboard.createDraftVersion")}
                      </button>
                    </form>
                  </CanvasCard>
                ) : null}

                {placardFormVisible ? (
                  <CanvasCard
                    theme={theme}
                    title={t("switchboard.generatePlacardVersion")}
                    subtitle={copy.placardsSubtitle}
                  >
                    <form onSubmit={handleGeneratePlacard}>
                      <div style={formGridStyle}>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.sourceVersion")}
                          hint={getPlacardSourceSelectionHint(
                            selectedPublicInfoVersion,
                            locale,
                          )}
                        >
                          <select
                            value={placardForm.publicInfoVersionId}
                            onChange={(event) =>
                              setPlacardForm((current) => ({
                                ...current,
                                publicInfoVersionId: event.target.value,
                              }))
                            }
                            style={inputBaseStyle(true)}
                          >
                            <option value="">—</option>
                            {publicInfo.map((version) => (
                              <option
                                key={version.versionId}
                                value={version.versionId}
                                disabled={isPlacardSourceSelectionBlocked(
                                  version,
                                )}
                              >
                                {formatPlacardSourceOptionLabel(
                                  version,
                                  locale,
                                )}
                              </option>
                            ))}
                          </select>
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.versionCode")}
                        >
                          <input
                            value={placardForm.versionCode}
                            onChange={(event) =>
                              setPlacardForm((current) => ({
                                ...current,
                                versionCode: event.target.value,
                              }))
                            }
                            style={inputBaseStyle(true)}
                            placeholder="placard-2026-q3"
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.template")}
                        >
                          <input
                            value={placardForm.templateName}
                            onChange={(event) =>
                              setPlacardForm((current) => ({
                                ...current,
                                templateName: event.target.value,
                              }))
                            }
                            style={inputBaseStyle(true)}
                            placeholder="seatback-default"
                          />
                        </CanvasField>
                        <CanvasField
                          theme={theme}
                          label={t("switchboard.form.artifactFileId")}
                          hint={t("switchboard.form.artifactHint")}
                        >
                          <input
                            value={placardForm.artifactFileId}
                            onChange={(event) =>
                              setPlacardForm((current) => ({
                                ...current,
                                artifactFileId: event.target.value,
                              }))
                            }
                            style={inputBaseStyle(true)}
                            placeholder={t("switchboard.form.artifactHint")}
                          />
                        </CanvasField>
                      </div>

                      {placardSourceBlocked ? (
                        <CanvasBanner
                          theme={theme}
                          tone="warn"
                          title={
                            locale === "en" ? "Source blocked" : "來源已封鎖"
                          }
                          body={getPlacardRetiredSourceAuditNote(locale)}
                        />
                      ) : null}

                      {versionCodePrecheckMessage ? (
                        <CanvasBanner
                          theme={theme}
                          tone="warn"
                          title={
                            locale === "en"
                              ? "Version code check"
                              : "版本代碼檢查"
                          }
                          body={versionCodePrecheckMessage}
                        />
                      ) : null}

                      <button
                        type="submit"
                        disabled={
                          creatingPlacard ||
                          placardForm.publicInfoVersionId.trim() === "" ||
                          placardSourceBlocked ||
                          versionCodePrecheckMessage !== null
                        }
                        style={submitButtonStyle(
                          creatingPlacard ||
                            placardForm.publicInfoVersionId.trim() === "" ||
                            placardSourceBlocked ||
                            versionCodePrecheckMessage !== null,
                        )}
                      >
                        {creatingPlacard
                          ? t("switchboard.generating")
                          : t("switchboard.generatePlacardVersion")}
                      </button>
                    </form>
                  </CanvasCard>
                ) : null}

                {activeTab === "public-info" ? (
                  <CanvasCard
                    theme={theme}
                    padding={0}
                    title={copy.versionsTitle}
                    subtitle={copy.versionsSubtitle}
                  >
                    {publicInfo.length === 0 ? (
                      <div style={{ padding: 16, ...emptyStateStyle }}>
                        {t("switchboard.noPublicInfo")}
                      </div>
                    ) : (
                      <CanvasTable
                        theme={theme}
                        columns={publicInfoColumns}
                        rows={publicInfo as PublicInfoTableRow[]}
                      />
                    )}
                  </CanvasCard>
                ) : (
                  <CanvasCard
                    theme={theme}
                    padding={0}
                    title={copy.placardsTitle}
                    subtitle={copy.placardsSubtitle}
                  >
                    {placards.length === 0 ? (
                      <div style={{ padding: 16, ...emptyStateStyle }}>
                        {t("switchboard.noPlacards")}
                      </div>
                    ) : (
                      <CanvasTable
                        theme={theme}
                        columns={placardColumns}
                        rows={placards as PlacardTableRow[]}
                      />
                    )}
                  </CanvasCard>
                )}

                <CanvasCard
                  theme={theme}
                  title={copy.contactTitle}
                  subtitle={copy.contactSubtitle}
                  actions={
                    currentContactSource ? (
                      <CanvasPill
                        theme={theme}
                        tone={publicInfoPillTone(currentContactSource.status)}
                        dot={currentContactSource.status !== "retired"}
                      >
                        {formatPlatformCodeLabel(
                          locale,
                          currentContactSource.status,
                        )}
                      </CanvasPill>
                    ) : null
                  }
                >
                  {currentContactSource ? (
                    <CanvasDL
                      theme={theme}
                      cols={2}
                      items={[
                        {
                          label: t("switchboard.form.callPhone"),
                          value: currentContactSource.callPhone ?? "—",
                          mono: true,
                        },
                        {
                          label: t("switchboard.form.complaintPhone"),
                          value: currentContactSource.complaintPhone ?? "—",
                          mono: true,
                        },
                        {
                          label: copy.effectiveWindow,
                          value: `${formatShortDate(
                            currentContactSource.effectiveFrom,
                          )} ~ ${
                            currentContactSource.effectiveTo
                              ? formatShortDate(
                                  currentContactSource.effectiveTo,
                                )
                              : copy.openEnded
                          }`,
                          mono: true,
                        },
                        {
                          label: copy.callRate,
                          value:
                            currentContactSource.callRateText ??
                            t("switchboard.noRateText"),
                        },
                        {
                          label: copy.fareCopy,
                          value: currentContactSource.fareText ?? "—",
                        },
                        {
                          label: copy.paymentCopy,
                          value: currentContactSource.paymentMethodText ?? "—",
                        },
                      ]}
                    />
                  ) : (
                    <div style={emptyStateStyle}>{copy.noLiveVersion}</div>
                  )}
                </CanvasCard>
              </>
            )}
          </div>

          <div style={sideColumnStyle}>
            <CanvasCard
              theme={theme}
              title={copy.previewTitle}
              subtitle={copy.previewSubtitle}
              actions={
                <>
                  {livePlacardVersion?.artifactDownloadUrl ? (
                    <CanvasBtn
                      theme={theme}
                      icon="copy"
                      onClick={() =>
                        window.open(
                          livePlacardVersion.artifactDownloadUrl!,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      {copy.previewDownload}
                    </CanvasBtn>
                  ) : null}
                  <CanvasBtn
                    theme={theme}
                    variant="primary"
                    icon="plus"
                    disabled={publicInfo.length === 0}
                    onClick={() => {
                      setActiveTab("placards");
                      setShowPublicInfoForm(false);
                      setShowPlacardForm(true);
                    }}
                  >
                    {t("switchboard.generatePlacardVersion")}
                  </CanvasBtn>
                </>
              }
            >
              {previewSourceVersion ? (
                <div style={placardPreviewStyle}>
                  <strong style={placardPreviewTitleStyle}>
                    {previewSourceVersion.title || copy.previewBrand}
                  </strong>
                  <div style={placardPreviewDividerStyle}>
                    {getPlatformLabel(locale, "call")}:{" "}
                    {previewSourceVersion.callPhone ?? "—"}{" "}
                    {getPlatformLabel(locale, "complaint")}:{" "}
                    {previewSourceVersion.complaintPhone ?? "—"}
                  </div>
                  <div>
                    {previewSourceVersion.callRateText ??
                      t("switchboard.noRateText")}
                  </div>
                  <div>{previewSourceVersion.fareText ?? "—"}</div>
                  <div>{previewSourceVersion.paymentMethodText ?? "—"}</div>
                  <div style={placardPreviewNoteStyle}>
                    {copy.previewWindowLabel}{" "}
                    {livePlacardVersion?.versionCode ??
                      (placardForm.versionCode || "placard-draft")}{" "}
                    / {previewSourceVersion.versionId} (
                    {formatShortDate(previewSourceVersion.effectiveFrom)} ~{" "}
                    {previewSourceVersion.effectiveTo
                      ? formatShortDate(previewSourceVersion.effectiveTo)
                      : copy.openEnded}
                    )
                  </div>
                </div>
              ) : (
                <div style={emptyStateStyle}>{copy.previewEmpty}</div>
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
                    label: copy.liveDisclosure,
                    value:
                      livePublicInfoVersion?.versionId ?? copy.noLiveVersion,
                    mono: true,
                  },
                  {
                    label: copy.currentPlacard,
                    value:
                      livePlacardVersion?.versionCode ?? copy.noLivePlacardPill,
                    mono: true,
                  },
                  {
                    label: copy.draftPosture,
                    value: latestDraftVersion?.versionId ?? copy.noDraft,
                    mono: true,
                  },
                  {
                    label: copy.sourceStatus,
                    value: previewSourceVersion
                      ? formatPlatformCodeLabel(
                          locale,
                          previewSourceVersion.status,
                        )
                      : "—",
                  },
                  {
                    label: copy.template,
                    value: livePlacardVersion?.templateName ?? "—",
                    mono: true,
                  },
                  {
                    label: copy.artifactHash,
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
  );
}
