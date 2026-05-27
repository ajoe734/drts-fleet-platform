/**
 * Switchboard Page
 * Public information versioning and placard governance for platform compliance.
 */

"use client";

import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
import {
  actionButtonStyle,
  emptyStateStyle,
  inputStyle,
  linkStyle,
  mergeStyles,
  monoTextStyle,
  pageHeaderStyle,
  pageHeaderSubtitleStyle,
  pageHeaderTitleStyle,
  statusBadgeStyle,
  surfaceCardStyle,
} from "@/components/platform-ui";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  CrossAppResourceLink,
  EmptyReason,
  EmptyStateEnvelope,
  GeneratePlacardVersionCommand,
  PlacardVersionRecord,
  PublicInfoVersionRecord,
  RefreshTier,
  ResourceActionDescriptor,
} from "@drts/contracts";
import { getPlacardVersionCodePrecheckMessage } from "./placard-version-code";
import {
  formatPlacardSourceOptionLabel,
  getPlacardRetiredSourceAuditNote,
  getPlacardSourceSelectionHint,
  getPreferredPlacardSourceVersion,
  isPlacardSourceSelectionBlocked,
} from "./placard-source";

type PublicInfoWithRuntime = PublicInfoVersionRecord & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
};

type PlacardWithRuntime = PlacardVersionRecord & {
  availableActions?: ResourceActionDescriptor[];
  crossAppLinks?: CrossAppResourceLink[];
  scope?: string | null;
};

type SwitchboardListPayload<T> = {
  items: T[];
  availableActions: ResourceActionDescriptor[];
  emptyState: EmptyStateEnvelope | null;
  refreshTier: RefreshTier | null;
  lastUpdatedAt: string | null;
  crossAppLinks: CrossAppResourceLink[];
};

type SwitchboardTab = "versions" | "placards" | "history";
type PlacardFormState = {
  versionCode: string;
  publicInfoVersionId: string;
  templateName: string;
  artifactFileId: string;
};
type ActionContext = {
  version?: PublicInfoWithRuntime;
  placard?: PlacardWithRuntime;
  link?: CrossAppResourceLink;
};

const EMPTY_PUBLIC_INFO_FORM = {
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

const REFRESH_TIER_FALLBACK: RefreshTier = "medium_slow";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isActionDescriptor(value: unknown): value is ResourceActionDescriptor {
  return (
    isRecord(value) &&
    typeof value.action === "string" &&
    typeof value.enabled === "boolean" &&
    typeof value.riskLevel === "string"
  );
}

function isCrossAppLink(value: unknown): value is CrossAppResourceLink {
  return (
    isRecord(value) &&
    typeof value.targetApp === "string" &&
    typeof value.route === "string" &&
    typeof value.label === "string"
  );
}

function isEmptyReason(value: unknown): value is EmptyReason {
  return (
    value === "no_data" ||
    value === "not_provisioned" ||
    value === "fetch_failed" ||
    value === "permission_denied" ||
    value === "external_unavailable" ||
    value === "driver_not_eligible" ||
    value === "filtered_empty"
  );
}

function normalizeEmptyState(value: unknown): EmptyStateEnvelope | null {
  if (!isRecord(value) || !isEmptyReason(value.reason)) {
    return null;
  }
  const normalized: EmptyStateEnvelope = {
    reason: value.reason,
    messageCode:
      typeof value.messageCode === "string"
        ? value.messageCode
        : `switchboard.empty.${value.reason}`,
  };
  if (isActionDescriptor(value.nextAction)) {
    normalized.nextAction = value.nextAction;
  }
  return normalized;
}

function normalizeListPayload<T extends object>(
  value: unknown,
): SwitchboardListPayload<T> {
  if (Array.isArray(value)) {
    return {
      items: value.filter(isRecord) as T[],
      availableActions: [],
      emptyState:
        value.length === 0
          ? {
              reason: "no_data",
              messageCode: "switchboard.empty.no_data",
            }
          : null,
      refreshTier: null,
      lastUpdatedAt: null,
      crossAppLinks: [],
    };
  }

  if (!isRecord(value)) {
    return {
      items: [],
      availableActions: [],
      emptyState: {
        reason: "fetch_failed",
        messageCode: "switchboard.empty.fetch_failed",
      },
      refreshTier: null,
      lastUpdatedAt: null,
      crossAppLinks: [],
    };
  }

  const items = Array.isArray(value.items)
    ? (value.items.filter(isRecord) as T[])
    : [];
  const availableActions = Array.isArray(value.availableActions)
    ? value.availableActions.filter(isActionDescriptor)
    : [];
  const crossAppLinks = Array.isArray(value.crossAppLinks)
    ? value.crossAppLinks.filter(isCrossAppLink)
    : [];
  const emptyState = normalizeEmptyState(value.emptyState);

  return {
    items,
    availableActions,
    emptyState:
      items.length === 0
        ? (emptyState ?? {
            reason: "no_data",
            messageCode: "switchboard.empty.no_data",
          })
        : emptyState,
    refreshTier:
      typeof value.refreshTier === "string"
        ? (value.refreshTier as RefreshTier)
        : null,
    lastUpdatedAt:
      typeof value.lastUpdatedAt === "string" ? value.lastUpdatedAt : null,
    crossAppLinks,
  };
}

function getRefreshIntervalMs(refreshTier: RefreshTier) {
  switch (refreshTier) {
    case "urgent":
      return 5_000;
    case "fast":
      return 3_000;
    case "dispatch":
      return 5_000;
    case "medium":
      return 15_000;
    case "medium_slow":
    case "slow":
      return 30_000;
    case "manual":
      return null;
    default:
      return 30_000;
  }
}

function getRefreshTierCadenceLabel(refreshTier: RefreshTier) {
  const intervalMs = getRefreshIntervalMs(refreshTier);
  if (intervalMs === null) {
    return "Manual refresh";
  }
  return `${Math.round(intervalMs / 1000)}s auto-refresh`;
}

function dedupeActionDescriptors(
  descriptors: ResourceActionDescriptor[],
): ResourceActionDescriptor[] {
  const seen = new Set<string>();
  return descriptors.filter((descriptor) => {
    const key = [
      descriptor.action,
      descriptor.enabled ? "enabled" : "disabled",
      descriptor.riskLevel,
      descriptor.disabledReasonCode ?? "",
    ].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
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

function placardStatusTone(placard: PlacardVersionRecord) {
  return placard.publishedAt ? ("success" as const) : ("warning" as const);
}

function inferPlacardScope(templateName: string) {
  const normalized = templateName.toLowerCase();
  if (normalized.includes("vehicle")) {
    return "vehicle";
  }
  if (normalized.includes("fleet")) {
    return "fleet";
  }
  return "brand_template";
}

function actionLabel(action: string, locale: string, fallback: string) {
  const labels: Record<string, { zh: string; en: string }> = {
    create: { zh: "建立", en: "Create" },
    create_version: { zh: "建立草稿", en: "Create draft" },
    delete: { zh: "刪除", en: "Delete" },
    delete_draft: { zh: "刪除草稿", en: "Delete draft" },
    download: { zh: "下載成品", en: "Download artifact" },
    generate_placard: { zh: "產生牌貼", en: "Generate placard" },
    generate_placard_version: {
      zh: "產生牌貼版本",
      en: "Generate placard version",
    },
    publish: { zh: "發布", en: "Publish" },
    publish_public_info: { zh: "發布公開資訊", en: "Publish public info" },
    refresh: { zh: "重新整理", en: "Refresh" },
    view_audit: { zh: "查看稽核", en: "View audit" },
  };

  const match = labels[action];
  if (!match) {
    return fallback;
  }
  return locale === "en" ? match.en : match.zh;
}

function disabledActionStyle(disabled: boolean): CSSProperties | undefined {
  if (!disabled) {
    return undefined;
  }
  return {
    opacity: 0.48,
    cursor: "not-allowed",
    boxShadow: "none",
  };
}

function actionTone(descriptor: ResourceActionDescriptor) {
  if (!descriptor.enabled) {
    return "secondary" as const;
  }
  if (descriptor.riskLevel === "high") {
    return "primary" as const;
  }
  return "secondary" as const;
}

function openCrossAppLink(link: CrossAppResourceLink) {
  if (link.openMode === "new_tab") {
    window.open(link.route, "_blank", "noopener,noreferrer");
    return;
  }
  window.location.href = link.route;
}

function SectionEmptyState({
  locale,
  emptyState,
  onAction,
}: {
  locale: string;
  emptyState: EmptyStateEnvelope;
  onAction: (action: ResourceActionDescriptor) => void;
}) {
  const copy: Record<
    EmptyReason,
    { title: string; body: string; tone: string }
  > =
    locale === "en"
      ? {
          no_data: {
            title: "Nothing published yet",
            body: "Create a public-info draft or generate the first placard artifact for this switchboard.",
            tone: "#1d4ed8",
          },
          not_provisioned: {
            title: "Provisioning required",
            body: "A dependency for this surface is not configured yet. Complete setup before operators can continue.",
            tone: "#92400e",
          },
          fetch_failed: {
            title: "Could not load data",
            body: "The last refresh failed. Retry or inspect the upstream service before publishing legal content.",
            tone: "#b91c1c",
          },
          permission_denied: {
            title: "Read-only for this role",
            body: "The current actor can view switchboard chrome but cannot access this dataset.",
            tone: "#475569",
          },
          external_unavailable: {
            title: "Dependent system unavailable",
            body: "A downstream artifact or distribution system is unavailable. Publication should be paused.",
            tone: "#7c3aed",
          },
          driver_not_eligible: {
            title: "Actor not eligible for this queue",
            body: "This empty-state code is reserved for other surfaces. Switchboard stays read-only until a valid dataset is available.",
            tone: "#475569",
          },
          filtered_empty: {
            title: "No rows match the current filter",
            body: "Adjust the active view or widen the timeframe to see matching versions and artifacts.",
            tone: "#0f766e",
          },
        }
      : {
          no_data: {
            title: "目前沒有資料",
            body: "先建立公開資訊草稿，或產生第一個牌貼成品，才能開始治理這個 switchboard。",
            tone: "#1d4ed8",
          },
          not_provisioned: {
            title: "尚未完成佈建",
            body: "此畫面的相依設定還沒完成，需先完成佈建後才能繼續法定資訊發布流程。",
            tone: "#92400e",
          },
          fetch_failed: {
            title: "資料載入失敗",
            body: "上一輪刷新沒有成功。請重試，或先確認上游服務狀態再處理發布作業。",
            tone: "#b91c1c",
          },
          permission_denied: {
            title: "目前角色僅可查看外框",
            body: "當前操作者無法讀取這份資料，CTA 應以唯讀/停用方式呈現。",
            tone: "#475569",
          },
          external_unavailable: {
            title: "外部依賴暫時不可用",
            body: "下游成品或發放系統目前不可用，建議暫停牌貼相關發布動作。",
            tone: "#7c3aed",
          },
          driver_not_eligible: {
            title: "此角色不適用於目前佇列",
            body: "這個 empty-state code 主要提供其他 surface 使用；在 switchboard 只維持唯讀提示，等待可用資料集。",
            tone: "#475569",
          },
          filtered_empty: {
            title: "目前篩選條件沒有結果",
            body: "請調整檢視條件或放寬期間，才能看到符合條件的版本與成品。",
            tone: "#0f766e",
          },
        };

  const config = copy[emptyState.reason];

  return (
    <div
      style={mergeStyles(emptyStateStyle, {
        textAlign: "left",
        borderStyle: "solid",
        borderColor: `${config.tone}22`,
        background: `${config.tone}08`,
        display: "grid",
        gap: 10,
      })}
    >
      <div>
        <div style={{ fontWeight: 700, color: config.tone }}>
          {config.title}
        </div>
        <div style={{ color: "#475569", fontSize: 13, lineHeight: 1.6 }}>
          {config.body}
        </div>
      </div>
      {emptyState.nextAction && (
        <div>
          <button
            type="button"
            style={mergeStyles(
              actionButtonStyle({
                tone:
                  emptyState.nextAction.riskLevel === "high"
                    ? "primary"
                    : "secondary",
              }),
              disabledActionStyle(!emptyState.nextAction.enabled),
            )}
            disabled={!emptyState.nextAction.enabled}
            title={emptyState.nextAction.disabledReasonCode}
            onClick={() => onAction(emptyState.nextAction!)}
          >
            {actionLabel(
              emptyState.nextAction.action,
              locale,
              locale === "en" ? "Continue" : "繼續",
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function SwitchboardPage() {
  const { locale } = useTranslation();
  const client = usePlatformAdminClient();
  const isEnglish = locale === "en";
  const copy = isEnglish
    ? {
        title: "Public Info & Placards",
        subtitle:
          "Route name remains /switchboard. One public-info version can generate many placard artifacts, and publication follows availableActions + refresh-tier governance.",
        refreshLabel: "Refresh Tier",
        refreshedAt: "Last synced",
        workflowTitle: "Versioning governance",
        workflowNote:
          "Published legal copy and placard artifacts stay linked so audits can trace disclosure, artifact lineage, and downstream distribution together.",
        liveVersion: "Live disclosure",
        livePlacard: "Current placard",
        historySignal: "History signal",
        historyNote:
          "Published versions stay immutable. Older published versions should be reviewed for retirement signalling when a newer disclosure is already live.",
        tabs: {
          versions: "Versions",
          placards: "Placards",
          history: "History",
        },
        topActions: {
          createVersion: "Create draft",
          generatePlacard: "Generate placard",
          refresh: "Refresh now",
        },
        sections: {
          sitemap: "Switchboard IA",
          versions: "Public info versions",
          placards: "Placard artifacts",
          livePreview: "Current issued placard",
          links: "Cross-app and audit links",
          timeline: "Publication timeline",
          contacts: "Public contact disclosure",
        },
        forms: {
          createVersion: "Create public-info draft",
          generatePlacard: "Generate placard version",
        },
        labels: {
          effectiveWindow: "Effective window",
          publishState: "Publish state",
          sourceVersion: "Source version",
          template: "Template",
          scope: "Scope",
          artifact: "Artifact",
          actions: "Actions",
          availableActions: "Available actions",
          noReason: "No reason provided",
          requiresReason: "Reason required for this action",
          placardFlight: "Placard generation is in flight",
          publishReason: "Publish confirmation",
          draftCount: "Drafts",
          publishedCount: "Published",
          placardCount: "Placards",
          tiedCount: "Linked to live version",
          sourceHint:
            "Source version and retired-source constraints follow packet §5 + placard source lineage rules.",
          download: "Download PDF",
          audit: "Audit view",
          opsLink: "Ops distribution view",
          retention: "Immutable once published",
          pendingArtifact: "Artifact pending issuance",
          noLiveVersion: "No public-info version published yet.",
          noLivePlacard: "No placard artifact published yet.",
          reasonPrompt:
            "This is a high-risk action and requires a reason before continuing.",
          historyEmpty: "No publication history yet.",
          publishedBy: "Published by",
          updatedAt: "Updated",
          readOnly: "Read-only",
          noActions: "Visible but no row actions are currently available.",
          resourceLinks: "Resource links",
          sitemapEntry: "Entry",
          sitemapExit: "Exit",
          sitemapPath: "Path",
          sitemapTask: "Primary task",
          auditTrail: "View audit trail",
          placardSourceGroup: "Source public info",
          sourceState: "Source state",
          downloadState: "Download validity",
          opensNewTab: "Opens in new tab",
        },
        quickLinks: {
          ops: "Open ops-console distribution board",
          audit: "Open audit trail for switchboard resources",
          notices: "Open notices for rider-facing follow-up",
        },
      }
    : {
        title: "Public Info & Placards",
        subtitle:
          "route 名稱保留為 /switchboard。1 個公開資訊版本可產生多個牌貼成品，整頁依 availableActions 與 refresh tier 管理。",
        refreshLabel: "Refresh Tier",
        refreshedAt: "最後同步",
        workflowTitle: "版本治理",
        workflowNote:
          "已發布法定文案與牌貼成品維持可追溯連結，讓揭露歷史、成品沿革與下游發放可以一起被稽核。",
        liveVersion: "目前生效揭露",
        livePlacard: "現行牌貼",
        historySignal: "歷史提醒",
        historyNote:
          "已發布版本保持不可變；若已有較新的 live 揭露，仍未退場的舊 published 版本應被明確標示並追蹤。",
        tabs: {
          versions: "版本",
          placards: "牌貼",
          history: "歷史",
        },
        topActions: {
          createVersion: "建立草稿",
          generatePlacard: "產生牌貼",
          refresh: "立即刷新",
        },
        sections: {
          sitemap: "Switchboard IA",
          versions: "Public info versions",
          placards: "Placard artifacts",
          livePreview: "目前發行牌貼",
          links: "跨 app / 稽核連結",
          timeline: "發布時間線",
          contacts: "對外揭露聯絡資訊",
        },
        forms: {
          createVersion: "建立公開資訊草稿",
          generatePlacard: "產生牌貼版本",
        },
        labels: {
          effectiveWindow: "生效區間",
          publishState: "發布狀態",
          sourceVersion: "來源版本",
          template: "範本",
          scope: "範圍",
          artifact: "成品",
          actions: "操作",
          availableActions: "可用動作",
          noReason: "未提供原因",
          requiresReason: "此動作必須填寫原因",
          placardFlight: "牌貼產生中",
          publishReason: "發布確認",
          draftCount: "草稿",
          publishedCount: "已發布",
          placardCount: "牌貼",
          tiedCount: "綁定 live 版本",
          sourceHint:
            "來源版本與 retired source 限制遵循 packet §5 與牌貼 lineage 規則。",
          download: "下載 PDF",
          audit: "稽核視圖",
          opsLink: "Ops 發放視圖",
          retention: "發布後不可變更",
          pendingArtifact: "等待成品發放",
          noLiveVersion: "目前尚無已發布公開資訊版本。",
          noLivePlacard: "目前尚無已發布牌貼成品。",
          reasonPrompt: "此為高風險動作，繼續前必須填寫原因。",
          historyEmpty: "目前還沒有可顯示的發布歷史。",
          publishedBy: "發布人",
          updatedAt: "更新時間",
          readOnly: "唯讀",
          noActions: "可見但目前沒有可執行的列級動作。",
          resourceLinks: "資源連結",
          sitemapEntry: "入口",
          sitemapExit: "出口",
          sitemapPath: "路徑",
          sitemapTask: "主要任務",
          auditTrail: "查看稽核軌跡",
          placardSourceGroup: "來源公開資訊",
          sourceState: "來源狀態",
          downloadState: "下載有效期",
          opensNewTab: "新分頁開啟",
        },
        quickLinks: {
          ops: "開啟 ops-console 發放看板",
          audit: "開啟 switchboard 相關稽核紀錄",
          notices: "開啟 rider-facing 後續公告",
        },
      };

  const [publicInfoPayload, setPublicInfoPayload] = useState<
    SwitchboardListPayload<PublicInfoWithRuntime>
  >({
    items: [],
    availableActions: [],
    emptyState: null,
    refreshTier: null,
    lastUpdatedAt: null,
    crossAppLinks: [],
  });
  const [placardPayload, setPlacardPayload] = useState<
    SwitchboardListPayload<PlacardWithRuntime>
  >({
    items: [],
    availableActions: [],
    emptyState: null,
    refreshTier: null,
    lastUpdatedAt: null,
    crossAppLinks: [],
  });
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
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [publicInfoResult, placardResult] = await Promise.allSettled([
      client.get<unknown>("/api/platform-admin/public-info"),
      client.get<unknown>("/api/platform-admin/placards"),
    ]);

    let nextError: string | null = null;

    if (publicInfoResult.status === "fulfilled") {
      setPublicInfoPayload(
        normalizeListPayload<PublicInfoWithRuntime>(publicInfoResult.value),
      );
    } else {
      nextError =
        publicInfoResult.reason instanceof Error
          ? publicInfoResult.reason.message
          : String(publicInfoResult.reason);
      setPublicInfoPayload({
        items: [],
        availableActions: [],
        emptyState: {
          reason: "fetch_failed",
          messageCode: "switchboard.empty.fetch_failed",
        },
        refreshTier: null,
        lastUpdatedAt: null,
        crossAppLinks: [],
      });
    }

    if (placardResult.status === "fulfilled") {
      setPlacardPayload(
        normalizeListPayload<PlacardWithRuntime>(placardResult.value),
      );
    } else {
      const placardError =
        placardResult.reason instanceof Error
          ? placardResult.reason.message
          : String(placardResult.reason);
      nextError = nextError ?? placardError;
      setPlacardPayload({
        items: [],
        availableActions: [],
        emptyState: {
          reason: "fetch_failed",
          messageCode: "switchboard.empty.fetch_failed",
        },
        refreshTier: null,
        lastUpdatedAt: null,
        crossAppLinks: [],
      });
    }

    setError(nextError);
    setLastRefreshedAt(new Date().toISOString());
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const refreshTier =
    publicInfoPayload.refreshTier ??
    placardPayload.refreshTier ??
    REFRESH_TIER_FALLBACK;

  useEffect(() => {
    const intervalMs = getRefreshIntervalMs(refreshTier);
    if (intervalMs === null) {
      return;
    }
    const pollingDelay = intervalMs;

    const intervalId = window.setInterval(() => {
      void loadData();
    }, pollingDelay);

    return () => window.clearInterval(intervalId);
  }, [loadData, refreshTier]);

  const publicInfo = publicInfoPayload.items;
  const placards = placardPayload.items;

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

  const pageActions = useMemo(() => {
    const merged = dedupeActionDescriptors([
      ...publicInfoPayload.availableActions,
      ...placardPayload.availableActions,
    ]);
    if (merged.length > 0) {
      return merged;
    }

    const fallback: ResourceActionDescriptor[] = [];
    if (draftVersions.length > 0) {
      fallback.push({
        action: "publish_public_info",
        enabled: true,
        requiresReason: true,
        riskLevel: "high",
      });
    }
    fallback.push({
      action: "create_version",
      enabled: true,
      riskLevel: "medium",
    });
    fallback.push(
      publicInfo.length > 0
        ? {
            action: "generate_placard_version",
            enabled: true,
            riskLevel: "medium",
          }
        : {
            action: "generate_placard_version",
            enabled: false,
            disabledReasonCode: "switchboard.public_info_required",
            riskLevel: "medium",
          },
    );
    fallback.push({
      action: "refresh",
      enabled: true,
      riskLevel: "low",
    });
    return fallback;
  }, [
    draftVersions.length,
    placardPayload.availableActions,
    publicInfo.length,
    publicInfoPayload.availableActions,
  ]);

  const generatePlacardAction = useMemo(
    () =>
      pageActions.find(
        (descriptor) =>
          descriptor.action === "generate_placard" ||
          descriptor.action === "generate_placard_version",
      ) ?? null,
    [pageActions],
  );

  const deepLinks = useMemo(() => {
    const payloadLinks = [
      ...publicInfoPayload.crossAppLinks,
      ...placardPayload.crossAppLinks,
    ];
    if (payloadLinks.length > 0) {
      return payloadLinks;
    }

    const fallbackLinks: CrossAppResourceLink[] = [
      {
        targetApp: "ops-console",
        route: "/dispatch?switchboard=switchboard",
        resourceType: "placard_distribution",
        resourceId: livePlacardVersion?.placardVersionId ?? "switchboard",
        openMode: "new_tab",
        label: copy.quickLinks.ops,
      },
      {
        targetApp: "platform-admin",
        route: "/audit?resourceType=public_info",
        resourceType: "audit_log",
        resourceId: livePublicInfoVersion?.versionId ?? "switchboard",
        openMode: "same_tab",
        label: copy.quickLinks.audit,
      },
      {
        targetApp: "platform-admin",
        route: "/notices?channel=rider_disclosure",
        resourceType: "notice",
        resourceId: "rider_disclosure",
        openMode: "same_tab",
        label: copy.quickLinks.notices,
      },
    ];
    return fallbackLinks;
  }, [
    copy.quickLinks.audit,
    copy.quickLinks.notices,
    copy.quickLinks.ops,
    livePlacardVersion?.placardVersionId,
    livePublicInfoVersion?.versionId,
    placardPayload.crossAppLinks,
    publicInfoPayload.crossAppLinks,
  ]);

  const historyEvents = useMemo(() => {
    const versionEvents = publicInfo.map((version) => ({
      id: `pi-${version.versionId}`,
      title: version.title,
      type: "public-info",
      status: version.status,
      actor: version.publishedBy ?? "—",
      at: version.publishedAt ?? version.updatedAt ?? version.createdAt,
      note:
        version.effectiveFrom && version.effectiveTo
          ? `${version.effectiveFrom} → ${version.effectiveTo}`
          : (version.effectiveFrom ?? version.effectiveTo ?? "—"),
    }));
    const placardEvents = placards.map((placard) => ({
      id: `placard-${placard.placardVersionId}`,
      title: placard.versionCode,
      type: "placard",
      status: placard.publishedAt ? "published" : "draft",
      actor: "—",
      at: placard.publishedAt ?? placard.updatedAt ?? placard.createdAt,
      note: placard.templateName,
    }));

    return [...versionEvents, ...placardEvents].sort((left, right) =>
      right.at.localeCompare(left.at),
    );
  }, [placards, publicInfo]);

  const placardsByPublicInfo = useMemo(() => {
    const grouped = new Map<string, PlacardWithRuntime[]>();
    for (const placard of placards) {
      const key = placard.publicInfoVersionId;
      const existing = grouped.get(key);
      if (existing) {
        existing.push(placard);
      } else {
        grouped.set(key, [placard]);
      }
    }
    return Array.from(grouped.entries()).map(
      ([publicInfoVersionId, items]) => ({
        publicInfoVersionId,
        sourceVersion: publicInfoById[publicInfoVersionId] ?? null,
        items,
      }),
    );
  }, [placards, publicInfoById]);

  function getVersionLinks(
    version: PublicInfoWithRuntime,
  ): CrossAppResourceLink[] {
    if (version.crossAppLinks && version.crossAppLinks.length > 0) {
      return version.crossAppLinks;
    }

    return [
      {
        targetApp: "platform-admin",
        route: `/audit?resourceType=public_info&resourceId=${encodeURIComponent(version.versionId)}`,
        resourceType: "public_info_version",
        resourceId: version.versionId,
        openMode: "same_tab",
        label: copy.labels.auditTrail,
      },
    ];
  }

  function getPlacardLinks(
    placard: PlacardWithRuntime,
  ): CrossAppResourceLink[] {
    if (placard.crossAppLinks && placard.crossAppLinks.length > 0) {
      return placard.crossAppLinks;
    }

    return [
      {
        targetApp: "ops-console",
        route: `/dispatch?placardVersionId=${encodeURIComponent(placard.placardVersionId)}`,
        resourceType: "placard_distribution",
        resourceId: placard.placardVersionId,
        openMode: "new_tab",
        label: copy.quickLinks.ops,
      },
      {
        targetApp: "platform-admin",
        route: `/audit?resourceType=placard_version&resourceId=${encodeURIComponent(placard.placardVersionId)}`,
        resourceType: "placard_version",
        resourceId: placard.placardVersionId,
        openMode: "same_tab",
        label: copy.labels.auditTrail,
      },
    ];
  }

  async function confirmDescriptorAction(
    descriptor: ResourceActionDescriptor,
    label: string,
  ) {
    if (!descriptor.enabled) {
      return false;
    }

    if (descriptor.riskLevel === "high") {
      const reason = window.prompt(
        `${copy.labels.publishReason}\n${copy.labels.requiresReason}`,
      );
      if (reason === null || reason.trim() === "") {
        return false;
      }
    }

    if (descriptor.riskLevel === "medium" || descriptor.riskLevel === "high") {
      return window.confirm(label);
    }

    return true;
  }

  function getVersionActions(
    version: PublicInfoWithRuntime,
  ): ResourceActionDescriptor[] {
    if (version.availableActions && version.availableActions.length > 0) {
      return version.availableActions;
    }
    if (version.status === "draft") {
      return [
        {
          action: "publish",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        },
        {
          action: "delete_draft",
          enabled: true,
          riskLevel: "medium",
        },
      ];
    }
    return [];
  }

  function getPlacardActions(
    placard: PlacardWithRuntime,
  ): ResourceActionDescriptor[] {
    if (placard.availableActions && placard.availableActions.length > 0) {
      return placard.availableActions;
    }
    if (!placard.publishedAt) {
      return [
        {
          action: "publish",
          enabled: true,
          requiresReason: true,
          riskLevel: "high",
        },
      ];
    }
    return [];
  }

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

  async function handlePublishVersion(
    versionId: string,
    descriptor: ResourceActionDescriptor,
  ) {
    const confirmed = await confirmDescriptorAction(
      descriptor,
      copy.labels.reasonPrompt,
    );
    if (!confirmed) {
      return;
    }

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

  async function handleDeleteDraft(
    versionId: string,
    descriptor: ResourceActionDescriptor,
  ) {
    const confirmed = await confirmDescriptorAction(
      descriptor,
      isEnglish ? "Delete this draft version?" : "要刪除這個公開資訊草稿嗎？",
    );
    if (!confirmed) {
      return;
    }

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

  async function handlePublishPlacard(
    placardVersionId: string,
    descriptor: ResourceActionDescriptor,
  ) {
    const confirmed = await confirmDescriptorAction(
      descriptor,
      copy.labels.reasonPrompt,
    );
    if (!confirmed) {
      return;
    }

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

  async function handleActionDescriptor(
    descriptor: ResourceActionDescriptor,
    context?: ActionContext,
  ) {
    if (
      descriptor.action === "create" ||
      descriptor.action === "create_version"
    ) {
      setShowPublicInfoForm(true);
      setShowPlacardForm(false);
      setActiveTab("versions");
      return;
    }
    if (
      descriptor.action === "publish" ||
      descriptor.action === "publish_public_info"
    ) {
      const draft =
        context?.version && context.version.status === "draft"
          ? context.version
          : draftVersions[0];
      if (draft) {
        await handlePublishVersion(draft.versionId, descriptor);
      } else {
        setActiveTab("versions");
      }
      return;
    }
    if (
      descriptor.action === "generate_placard" ||
      descriptor.action === "generate_placard_version"
    ) {
      setShowPlacardForm(true);
      setShowPublicInfoForm(false);
      setActiveTab("placards");
      return;
    }
    if (descriptor.action === "download") {
      if (context?.placard?.artifactDownloadUrl) {
        window.open(
          context.placard.artifactDownloadUrl,
          "_blank",
          "noopener,noreferrer",
        );
      } else if (livePlacardVersion?.artifactDownloadUrl) {
        window.open(
          livePlacardVersion.artifactDownloadUrl,
          "_blank",
          "noopener,noreferrer",
        );
      }
      return;
    }
    if (descriptor.action === "view_audit") {
      if (context?.link) {
        openCrossAppLink(context.link);
      } else if (context?.placard) {
        window.location.href = `/audit?resourceType=placard_version&resourceId=${encodeURIComponent(context.placard.placardVersionId)}`;
      } else if (context?.version) {
        window.location.href = `/audit?resourceType=public_info&resourceId=${encodeURIComponent(context.version.versionId)}`;
      } else {
        window.location.href = "/audit?resourceType=public_info";
      }
      return;
    }
    if (descriptor.action === "refresh") {
      await loadData();
      return;
    }
    if (descriptor.action === "open_link" && context?.link) {
      openCrossAppLink(context.link);
    }
  }

  if (loading) {
    return (
      <div style={emptyStateStyle}>
        {isEnglish ? "Loading switchboard..." : "載入 switchboard 中..."}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={pageHeaderStyle}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
          }}
        >
          <h1 style={pageHeaderTitleStyle}>{copy.title}</h1>
          <span style={statusBadgeStyle("info")}>
            {copy.refreshLabel} {refreshTier}
          </span>
          <span style={statusBadgeStyle("neutral")}>
            {getRefreshTierCadenceLabel(refreshTier)}
          </span>
        </div>
        <p style={pageHeaderSubtitleStyle}>{copy.subtitle}</p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            color: "#64748b",
            fontSize: 13,
          }}
        >
          <span>
            {copy.refreshedAt}: {formatDateTime(lastRefreshedAt ?? "")}
          </span>
          <span>
            {copy.labels.updatedAt}:{" "}
            {formatDateTime(
              publicInfoPayload.lastUpdatedAt ??
                placardPayload.lastUpdatedAt ??
                "",
            )}
          </span>
        </div>
      </div>

      {error && (
        <div
          style={mergeStyles(surfaceCardStyle, {
            borderColor: "rgba(239,68,68,0.25)",
            background: "rgba(254,242,242,0.95)",
          })}
        >
          <p style={{ color: "#b91c1c", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      <div style={kpiGridStyle}>
        <MetricCard
          label={copy.labels.draftCount}
          value={draftVersions.length}
          note={isEnglish ? "Awaiting compliance publish" : "等待發布"}
        />
        <MetricCard
          label={copy.labels.publishedCount}
          value={publishedVersions.length}
          note={isEnglish ? "Immutable legal disclosures" : "不可變法定揭露"}
        />
        <MetricCard
          label={copy.labels.placardCount}
          value={placards.length}
          note={isEnglish ? "Artifact lineage tracked" : "成品沿革可追溯"}
        />
        <MetricCard
          label={copy.labels.tiedCount}
          value={
            placards.filter((placard) => {
              const source = publicInfoById[placard.publicInfoVersionId];
              return source?.status === "published";
            }).length
          }
          note={isEnglish ? "Ready for distribution" : "可進入發放"}
        />
      </div>

      <div style={mergeStyles(surfaceCardStyle, spotlightGridStyle)}>
        <div style={{ display: "grid", gap: 10 }}>
          <div style={sectionEyebrowStyle}>{copy.workflowTitle}</div>
          <div style={supportCopyStyle}>{copy.workflowNote}</div>
        </div>
        <div style={spotlightStatStyle}>
          <div style={sectionEyebrowStyle}>{copy.liveVersion}</div>
          <strong style={{ fontSize: 18, color: "#0f172a" }}>
            {livePublicInfoVersion?.title ?? copy.labels.noLiveVersion}
          </strong>
          <div style={supportCopyStyle}>
            {livePublicInfoVersion
              ? `${livePublicInfoVersion.versionId} · ${formatDateTime(
                  livePublicInfoVersion.publishedAt ?? "",
                )}`
              : copy.labels.retention}
          </div>
        </div>
        <div style={spotlightStatStyle}>
          <div style={sectionEyebrowStyle}>{copy.livePlacard}</div>
          <strong style={{ fontSize: 18, color: "#0f172a" }}>
            {livePlacardVersion?.versionCode ?? copy.labels.noLivePlacard}
          </strong>
          <div style={supportCopyStyle}>
            {livePlacardVersion
              ? `${livePlacardVersion.templateName} · ${formatDateTime(
                  livePlacardVersion.publishedAt ??
                    livePlacardVersion.createdAt,
                )}`
              : copy.labels.pendingArtifact}
          </div>
        </div>
        <div style={spotlightStatStyle}>
          <div style={sectionEyebrowStyle}>{copy.historySignal}</div>
          <div style={supportCopyStyle}>{copy.historyNote}</div>
        </div>
      </div>

      <div style={mergeStyles(surfaceCardStyle, sitemapGridStyle)}>
        <div style={{ display: "grid", gap: 8 }}>
          <div style={sectionTitleStyle}>{copy.sections.sitemap}</div>
          <div style={supportCopyStyle}>
            {isEnglish
              ? "Platform & Commerce / Public Info & Placards"
              : "平台與商務 / Public Info & Placards"}
          </div>
        </div>
        <DetailItem label={copy.labels.sitemapPath} value="/switchboard" mono />
        <DetailItem
          label={copy.labels.sitemapEntry}
          value={isEnglish ? "Sidebar navigation" : "側邊欄導覽"}
        />
        <DetailItem
          label={copy.labels.sitemapExit}
          value={
            isEnglish ? "Placard PDF artifact download" : "牌貼 PDF 成品下載"
          }
        />
        <DetailItem
          label={copy.labels.sitemapTask}
          value={
            isEnglish
              ? "Maintain disclosure versions and publish placards per scope."
              : "維護法定揭露版本，並依 scope 產生與發布牌貼。"
          }
        />
      </div>

      <div style={toolbarRowStyle}>
        <div style={pillTabsStyle}>
          {(["versions", "placards", "history"] as SwitchboardTab[]).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                style={mergeStyles(
                  actionButtonStyle({
                    tone: activeTab === tab ? "primary" : "secondary",
                  }),
                  { borderRadius: 999 },
                )}
                onClick={() => setActiveTab(tab)}
              >
                {copy.tabs[tab]}
              </button>
            ),
          )}
        </div>

        <div style={toolbarActionsStyle}>
          {pageActions.map((descriptor) => {
            const isPrimary =
              descriptor.action === "publish" ||
              descriptor.action === "generate_placard_version";
            return (
              <button
                key={`${descriptor.action}-${descriptor.riskLevel}`}
                type="button"
                title={descriptor.disabledReasonCode}
                disabled={!descriptor.enabled}
                style={mergeStyles(
                  actionButtonStyle({
                    tone: isPrimary ? "primary" : "secondary",
                  }),
                  disabledActionStyle(!descriptor.enabled),
                )}
                onClick={() => void handleActionDescriptor(descriptor)}
              >
                {actionLabel(
                  descriptor.action,
                  locale,
                  descriptor.action === "generate_placard_version"
                    ? copy.topActions.generatePlacard
                    : descriptor.action === "refresh"
                      ? copy.topActions.refresh
                      : copy.topActions.createVersion,
                )}
              </button>
            );
          })}
        </div>
      </div>

      {showPublicInfoForm && (
        <div style={surfaceCardStyle}>
          <div style={sectionTitleStyle}>{copy.forms.createVersion}</div>
          <form
            onSubmit={handleCreatePublicInfo}
            style={{ display: "grid", gap: 16 }}
          >
            <div style={formGridStyle}>
              <label style={labelStyle}>
                Title
                <input
                  value={publicInfoForm.title}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={
                    isEnglish ? "2026 Q3 public info" : "2026 Q3 公開資訊"
                  }
                />
              </label>
              <label style={labelStyle}>
                {isEnglish ? "Call phone" : "叫車電話"}
                <input
                  value={publicInfoForm.callPhone}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      callPhone: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="02-2543-9988"
                />
              </label>
              <label style={labelStyle}>
                {isEnglish ? "Complaint phone" : "客訴電話"}
                <input
                  value={publicInfoForm.complaintPhone}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      complaintPhone: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="0800-088-122"
                />
              </label>
              <label style={labelStyle}>
                {isEnglish ? "Effective from" : "生效時間"}
                <input
                  value={publicInfoForm.effectiveFrom}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="2026-07-01T00:00:00.000Z"
                />
              </label>
              <label style={labelStyle}>
                {isEnglish ? "Effective to" : "結束時間"}
                <input
                  value={publicInfoForm.effectiveTo}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      effectiveTo: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={
                    isEnglish ? "Optional sunset timestamp" : "選填結束時間"
                  }
                />
              </label>
              <label style={labelStyle}>
                {isEnglish ? "Call rate text" : "計費說明"}
                <input
                  value={publicInfoForm.callRateText}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      callRateText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {isEnglish ? "Fare disclosure" : "票價說明"}
                <input
                  value={publicInfoForm.fareText}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      fareText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {isEnglish ? "Payment methods" : "付款方式"}
                <input
                  value={publicInfoForm.paymentMethodText}
                  onChange={(event) =>
                    setPublicInfoForm((current) => ({
                      ...current,
                      paymentMethodText: event.target.value,
                    }))
                  }
                  style={inputStyle}
                />
              </label>
            </div>
            <div style={actionsRowStyle}>
              <button
                type="submit"
                style={actionButtonStyle({ tone: "primary" })}
                disabled={creatingPublicInfo}
              >
                {creatingPublicInfo
                  ? isEnglish
                    ? "Creating..."
                    : "建立中..."
                  : copy.topActions.createVersion}
              </button>
              <button
                type="button"
                style={actionButtonStyle()}
                onClick={() => setShowPublicInfoForm(false)}
              >
                {isEnglish ? "Cancel" : "取消"}
              </button>
            </div>
          </form>
        </div>
      )}

      {showPlacardForm && (
        <div style={surfaceCardStyle}>
          <div style={sectionTitleStyle}>{copy.forms.generatePlacard}</div>
          <form
            onSubmit={handleGeneratePlacard}
            style={{ display: "grid", gap: 16 }}
          >
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {copy.labels.sourceVersion}
                <select
                  value={placardForm.publicInfoVersionId}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      publicInfoVersionId: event.target.value,
                    }))
                  }
                  style={inputStyle}
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
              </label>
              <label style={labelStyle}>
                Version code
                <input
                  value={placardForm.versionCode}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      versionCode: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="placard-2026-q3"
                />
              </label>
              <label style={labelStyle}>
                {copy.labels.template}
                <input
                  value={placardForm.templateName}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      templateName: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder="seatback-default"
                />
              </label>
              <label style={labelStyle}>
                Artifact file ID
                <input
                  value={placardForm.artifactFileId}
                  onChange={(event) =>
                    setPlacardForm((current) => ({
                      ...current,
                      artifactFileId: event.target.value,
                    }))
                  }
                  style={inputStyle}
                  placeholder={
                    isEnglish
                      ? "Optional external asset reference"
                      : "選填外部成品參照"
                  }
                />
              </label>
            </div>
            <div style={supportCopyStyle}>{copy.labels.sourceHint}</div>
            <div style={supportCopyStyle}>
              {getPlacardSourceSelectionHint(selectedPublicInfoVersion, locale)}
            </div>
            {placardSourceBlocked && (
              <div style={{ color: "#92400e", fontSize: 13 }}>
                {getPlacardRetiredSourceAuditNote(locale)}
              </div>
            )}
            {versionCodePrecheckMessage && (
              <div style={{ color: "#b45309", fontSize: 13 }}>
                {versionCodePrecheckMessage}
              </div>
            )}
            <div style={actionsRowStyle}>
              <button
                type="submit"
                style={actionButtonStyle({ tone: "primary" })}
                disabled={
                  creatingPlacard ||
                  placardForm.publicInfoVersionId.trim() === "" ||
                  placardSourceBlocked ||
                  versionCodePrecheckMessage !== null
                }
              >
                {creatingPlacard
                  ? isEnglish
                    ? "Generating..."
                    : "產生中..."
                  : copy.topActions.generatePlacard}
              </button>
              <button
                type="button"
                style={actionButtonStyle()}
                onClick={() => setShowPlacardForm(false)}
              >
                {isEnglish ? "Cancel" : "取消"}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "versions" && (
        <div style={contentGridStyle}>
          <div style={{ display: "grid", gap: 16 }}>
            <section style={surfaceCardStyle}>
              <div style={sectionTitleStyle}>{copy.sections.versions}</div>
              {publicInfo.length === 0 && publicInfoPayload.emptyState ? (
                <SectionEmptyState
                  locale={locale}
                  emptyState={publicInfoPayload.emptyState}
                  onAction={(action) => void handleActionDescriptor(action)}
                />
              ) : (
                <div style={stackListStyle}>
                  {publicInfo.map((version) => (
                    <div key={version.versionId} style={resourceCardStyle}>
                      <div style={resourceCardHeaderStyle}>
                        <div>
                          <div style={resourceTitleStyle}>{version.title}</div>
                          <div style={resourceMetaStyle}>
                            {version.versionId}
                          </div>
                        </div>
                        <span
                          style={statusBadgeStyle(
                            publicInfoStatusTone(version.status),
                          )}
                        >
                          {formatPlatformCodeLabel(locale, version.status)}
                        </span>
                      </div>

                      <div style={detailGridStyle}>
                        <DetailItem
                          label={copy.labels.effectiveWindow}
                          value={`${version.effectiveFrom ?? "—"} → ${version.effectiveTo ?? "—"}`}
                        />
                        <DetailItem
                          label={copy.labels.publishedBy}
                          value={version.publishedBy ?? "—"}
                        />
                        <DetailItem
                          label={isEnglish ? "Call / complaint" : "叫車 / 客訴"}
                          value={`${version.callPhone ?? "—"} · ${version.complaintPhone ?? "—"}`}
                        />
                        <DetailItem
                          label={isEnglish ? "Fare / payment" : "計價 / 付款"}
                          value={`${version.callRateText ?? "—"} · ${version.paymentMethodText ?? "—"}`}
                        />
                      </div>

                      <div style={supportCopyStyle}>
                        {version.fareText ?? copy.labels.retention}
                      </div>

                      <AvailableActionsList
                        locale={locale}
                        descriptors={getVersionActions(version)}
                        emptyLabel={copy.labels.noActions}
                      />

                      <div style={resourceActionsStyle}>
                        {getVersionActions(version).length === 0 ? (
                          <span style={supportCopyStyle}>
                            {copy.labels.readOnly}
                          </span>
                        ) : (
                          getVersionActions(version).map((descriptor) => {
                            const busy =
                              publishingVersionId === version.versionId ||
                              deletingVersionId === version.versionId;
                            return (
                              <button
                                key={`${version.versionId}-${descriptor.action}`}
                                type="button"
                                title={descriptor.disabledReasonCode}
                                disabled={!descriptor.enabled || busy}
                                style={mergeStyles(
                                  actionButtonStyle({
                                    tone:
                                      descriptor.action === "publish"
                                        ? "primary"
                                        : "secondary",
                                    size: "sm",
                                  }),
                                  disabledActionStyle(
                                    !descriptor.enabled || busy,
                                  ),
                                )}
                                onClick={() => {
                                  if (descriptor.action === "publish") {
                                    void handleActionDescriptor(descriptor, {
                                      version,
                                    });
                                  } else if (
                                    descriptor.action === "delete" ||
                                    descriptor.action === "delete_draft"
                                  ) {
                                    void handleDeleteDraft(
                                      version.versionId,
                                      descriptor,
                                    );
                                  } else {
                                    void handleActionDescriptor(descriptor, {
                                      version,
                                    });
                                  }
                                }}
                              >
                                {actionLabel(
                                  descriptor.action,
                                  locale,
                                  descriptor.action,
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>

                      <ResourceLinkList links={getVersionLinks(version)} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <section style={surfaceCardStyle}>
              <div style={sectionTitleStyle}>{copy.sections.livePreview}</div>
              <div style={placardPreviewStyle}>
                <div style={placardBrandStyle}>
                  {livePublicInfoVersion?.title ??
                    (isEnglish ? "No live disclosure" : "尚無 live 揭露")}
                </div>
                <div style={placardCalloutStyle}>
                  {isEnglish ? "Call" : "叫車"}{" "}
                  {livePublicInfoVersion?.callPhone ?? "—"} ·{" "}
                  {isEnglish ? "Complaint" : "客訴"}{" "}
                  {livePublicInfoVersion?.complaintPhone ?? "—"}
                </div>
                <div style={placardBodyStyle}>
                  <div>{livePlacardVersion?.versionCode ?? "—"}</div>
                  <div>{livePublicInfoVersion?.fareText ?? "—"}</div>
                  <div>{livePublicInfoVersion?.paymentMethodText ?? "—"}</div>
                  <div style={{ color: "#6b7280" }}>
                    {livePublicInfoVersion
                      ? `${livePublicInfoVersion.effectiveFrom ?? "—"} → ${livePublicInfoVersion.effectiveTo ?? "—"}`
                      : copy.labels.noLiveVersion}
                  </div>
                </div>
              </div>
              <div style={resourceActionsStyle}>
                {livePlacardVersion?.artifactDownloadUrl ? (
                  <a
                    href={livePlacardVersion.artifactDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={mergeStyles(actionButtonStyle(), {
                      textDecoration: "none",
                    })}
                  >
                    {copy.labels.download}
                  </a>
                ) : null}
                {generatePlacardAction ? (
                  <button
                    type="button"
                    title={generatePlacardAction.disabledReasonCode}
                    disabled={!generatePlacardAction.enabled}
                    style={mergeStyles(
                      actionButtonStyle({ tone: "primary" }),
                      disabledActionStyle(!generatePlacardAction.enabled),
                    )}
                    onClick={() =>
                      void handleActionDescriptor(generatePlacardAction)
                    }
                  >
                    {copy.topActions.generatePlacard}
                  </button>
                ) : null}
              </div>
            </section>

            <section style={surfaceCardStyle}>
              <div style={sectionTitleStyle}>{copy.sections.contacts}</div>
              <div style={detailGridStyle}>
                <DetailItem
                  label={isEnglish ? "Call phone" : "叫車電話"}
                  value={livePublicInfoVersion?.callPhone ?? "—"}
                />
                <DetailItem
                  label={isEnglish ? "Complaint phone" : "客訴電話"}
                  value={livePublicInfoVersion?.complaintPhone ?? "—"}
                />
                <DetailItem
                  label={isEnglish ? "Rate text" : "計價說明"}
                  value={livePublicInfoVersion?.callRateText ?? "—"}
                />
                <DetailItem
                  label={isEnglish ? "Payment methods" : "付款方式"}
                  value={livePublicInfoVersion?.paymentMethodText ?? "—"}
                />
              </div>
            </section>

            <section style={surfaceCardStyle}>
              <div style={sectionTitleStyle}>{copy.sections.links}</div>
              <ResourceLinkList links={deepLinks} />
            </section>
          </div>
        </div>
      )}

      {activeTab === "placards" && (
        <section style={surfaceCardStyle}>
          <div style={sectionTitleStyle}>{copy.sections.placards}</div>
          {placards.length === 0 && placardPayload.emptyState ? (
            <SectionEmptyState
              locale={locale}
              emptyState={placardPayload.emptyState}
              onAction={(action) => void handleActionDescriptor(action)}
            />
          ) : (
            <div style={stackListStyle}>
              {placardsByPublicInfo.map((group) => {
                const sourceVersion = group.sourceVersion;
                return (
                  <div
                    key={group.publicInfoVersionId}
                    style={resourceCardStyle}
                  >
                    <div style={resourceCardHeaderStyle}>
                      <div>
                        <div style={resourceTitleStyle}>
                          {copy.labels.placardSourceGroup}:{" "}
                          {sourceVersion?.title ?? group.publicInfoVersionId}
                        </div>
                        <div style={resourceMetaStyle}>
                          {group.publicInfoVersionId}
                        </div>
                      </div>
                      <span
                        style={statusBadgeStyle(
                          publicInfoStatusTone(
                            sourceVersion?.status ?? "draft",
                          ),
                        )}
                      >
                        {formatPlatformCodeLabel(
                          locale,
                          sourceVersion?.status ?? "draft",
                        )}
                      </span>
                    </div>

                    <div style={detailGridStyle}>
                      <DetailItem
                        label={copy.labels.sourceState}
                        value={
                          sourceVersion
                            ? formatPlatformCodeLabel(
                                locale,
                                sourceVersion.status,
                              )
                            : "—"
                        }
                      />
                      <DetailItem
                        label={copy.labels.effectiveWindow}
                        value={
                          sourceVersion
                            ? `${sourceVersion.effectiveFrom ?? "—"} → ${sourceVersion.effectiveTo ?? "—"}`
                            : "—"
                        }
                      />
                      <DetailItem
                        label={copy.labels.publishedBy}
                        value={sourceVersion?.publishedBy ?? "—"}
                      />
                      <DetailItem
                        label={copy.labels.placardCount}
                        value={String(group.items.length)}
                      />
                    </div>

                    <div style={stackListStyle}>
                      {group.items.map((placard) => (
                        <div
                          key={placard.placardVersionId}
                          style={mergeStyles(
                            resourceCardStyle,
                            nestedPlacardCardStyle,
                          )}
                        >
                          <div style={resourceCardHeaderStyle}>
                            <div>
                              <div style={resourceTitleStyle}>
                                {placard.versionCode}
                              </div>
                              <div style={resourceMetaStyle}>
                                {placard.placardVersionId}
                              </div>
                            </div>
                            <span
                              style={statusBadgeStyle(
                                placardStatusTone(placard),
                              )}
                            >
                              {formatPlatformCodeLabel(
                                locale,
                                placard.publishedAt ? "published" : "draft",
                              )}
                            </span>
                          </div>

                          <div style={detailGridStyle}>
                            <DetailItem
                              label={copy.labels.scope}
                              value={formatPlatformCodeLabel(
                                locale,
                                placard.scope ??
                                  inferPlacardScope(placard.templateName),
                              )}
                            />
                            <DetailItem
                              label={copy.labels.template}
                              value={placard.templateName}
                            />
                            <DetailItem
                              label={copy.labels.artifact}
                              value={
                                placard.artifactFileId ??
                                copy.labels.pendingArtifact
                              }
                            />
                            <DetailItem
                              label={copy.labels.downloadState}
                              value={formatDateTime(
                                placard.artifactExpiresAt ?? "",
                              )}
                            />
                          </div>

                          <div style={detailGridStyle}>
                            <DetailItem
                              label="Manifest"
                              value={shortHash(placard.artifactManifestHash)}
                              mono
                            />
                            <DetailItem
                              label="Published"
                              value={formatDateTime(placard.publishedAt ?? "")}
                            />
                            <DetailItem
                              label="Created"
                              value={formatDateTime(placard.createdAt)}
                            />
                            <DetailItem
                              label="Updated"
                              value={formatDateTime(placard.updatedAt)}
                            />
                          </div>

                          <AvailableActionsList
                            locale={locale}
                            descriptors={getPlacardActions(placard)}
                            emptyLabel={copy.labels.noActions}
                          />

                          <div style={resourceActionsStyle}>
                            {placard.artifactDownloadUrl ? (
                              <a
                                href={placard.artifactDownloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={mergeStyles(
                                  actionButtonStyle({ size: "sm" }),
                                  {
                                    textDecoration: "none",
                                  },
                                )}
                              >
                                {copy.labels.download}
                              </a>
                            ) : (
                              <span style={supportCopyStyle}>
                                {copy.labels.placardFlight}
                              </span>
                            )}
                            {getPlacardActions(placard).map((descriptor) => (
                              <button
                                key={`${placard.placardVersionId}-${descriptor.action}`}
                                type="button"
                                title={descriptor.disabledReasonCode}
                                disabled={
                                  !descriptor.enabled ||
                                  publishingPlacardId ===
                                    placard.placardVersionId
                                }
                                style={mergeStyles(
                                  actionButtonStyle({
                                    tone: actionTone(descriptor),
                                    size: "sm",
                                  }),
                                  disabledActionStyle(
                                    !descriptor.enabled ||
                                      publishingPlacardId ===
                                        placard.placardVersionId,
                                  ),
                                )}
                                onClick={() => {
                                  if (descriptor.action === "publish") {
                                    void handlePublishPlacard(
                                      placard.placardVersionId,
                                      descriptor,
                                    );
                                  } else {
                                    void handleActionDescriptor(descriptor, {
                                      placard,
                                    });
                                  }
                                }}
                              >
                                {actionLabel(
                                  descriptor.action,
                                  locale,
                                  descriptor.action,
                                )}
                              </button>
                            ))}
                          </div>

                          <ResourceLinkList links={getPlacardLinks(placard)} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === "history" && (
        <section style={surfaceCardStyle}>
          <div style={sectionTitleStyle}>{copy.sections.timeline}</div>
          {historyEvents.length === 0 ? (
            <div style={emptyStateStyle}>{copy.labels.historyEmpty}</div>
          ) : (
            <div style={timelineStyle}>
              {historyEvents.map((event) => (
                <div key={event.id} style={timelineItemStyle}>
                  <div style={timelineDotStyle} />
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={resourceCardHeaderStyle}>
                      <div>
                        <div style={resourceTitleStyle}>{event.title}</div>
                        <div style={resourceMetaStyle}>
                          {event.type} · {formatDateTime(event.at)}
                        </div>
                      </div>
                      <span
                        style={statusBadgeStyle(
                          event.status === "published"
                            ? "success"
                            : event.status === "draft"
                              ? "warning"
                              : "neutral",
                        )}
                      >
                        {formatPlatformCodeLabel(locale, event.status)}
                      </span>
                    </div>
                    <div style={supportCopyStyle}>{event.note}</div>
                    <div style={supportCopyStyle}>
                      {copy.labels.publishedBy}: {event.actor}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {publishedVersions.length > 1 && retiredVersions.length === 0 && (
            <div
              style={mergeStyles(surfaceCardStyle, {
                marginTop: 16,
                background: "rgba(245, 158, 11, 0.08)",
                borderColor: "rgba(245, 158, 11, 0.22)",
                padding: 16,
              })}
            >
              <div
                style={{ fontWeight: 700, color: "#92400e", marginBottom: 6 }}
              >
                {isEnglish
                  ? "Older published versions still active"
                  : "仍有舊 published 版本未退場"}
              </div>
              <div style={supportCopyStyle}>
                {isEnglish
                  ? "Packet §5 requires older unretired published versions to be signalled for review once a newer disclosure is live."
                  : "依 packet §5，當較新的揭露已經 live，舊的 published 版本若尚未退場，畫面需明確提醒後續治理。"}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div style={mergeStyles(surfaceCardStyle, { display: "grid", gap: 6 })}>
      <div style={sectionEyebrowStyle}>{label}</div>
      <strong style={{ fontSize: 28, color: "#0f172a" }}>{value}</strong>
      <div style={supportCopyStyle}>{note}</div>
    </div>
  );
}

function DetailItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={sectionEyebrowStyle}>{label}</div>
      <div
        style={
          mono ? mergeStyles(detailValueStyle, monoTextStyle) : detailValueStyle
        }
      >
        {value}
      </div>
    </div>
  );
}

function AvailableActionsList({
  locale,
  descriptors,
  emptyLabel,
}: {
  locale: string;
  descriptors: ResourceActionDescriptor[];
  emptyLabel: string;
}) {
  if (descriptors.length === 0) {
    return <div style={supportCopyStyle}>{emptyLabel}</div>;
  }

  return (
    <div style={actionChipRowStyle}>
      {descriptors.map((descriptor) => (
        <span
          key={`${descriptor.action}-${descriptor.riskLevel}-${descriptor.enabled}`}
          style={mergeStyles(
            actionChipStyle,
            descriptor.enabled
              ? descriptor.riskLevel === "high"
                ? enabledHighActionChipStyle
                : enabledActionChipStyle
              : disabledActionChipStyle,
          )}
          title={descriptor.disabledReasonCode}
        >
          {actionLabel(descriptor.action, locale, descriptor.action)}
        </span>
      ))}
    </div>
  );
}

function ResourceLinkList({ links }: { links: CrossAppResourceLink[] }) {
  return (
    <div style={stackListStyle}>
      {links.map((link) => (
        <div
          key={`${link.targetApp}-${link.route}`}
          style={resourceLinkRowStyle}
        >
          <a
            href={link.route}
            target={link.openMode === "new_tab" ? "_blank" : undefined}
            rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
            style={linkStyle}
          >
            {link.label}
          </a>
          <span style={resourceLinkMetaStyle}>
            {link.targetApp} · {link.resourceType}
          </span>
        </div>
      ))}
    </div>
  );
}

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const spotlightGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "1.25fr repeat(3, minmax(0, 1fr))",
  alignItems: "stretch",
  background:
    "linear-gradient(135deg, rgba(15,23,42,0.02) 0%, rgba(29,78,216,0.06) 100%)",
};

const spotlightStatStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 16,
  borderRadius: 16,
  background: "#ffffff",
  border: "1px solid rgba(148,163,184,0.16)",
};

const sitemapGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "1.1fr repeat(4, minmax(0, 1fr))",
  alignItems: "start",
};

const toolbarRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
  justifyContent: "space-between",
  alignItems: "center",
};

const pillTabsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const toolbarActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#334155",
  fontSize: 13,
  fontWeight: 600,
};

const actionsRowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const contentGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.6fr) minmax(300px, 0.95fr)",
  gap: 16,
  alignItems: "start",
};

const sectionTitleStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 17,
  fontWeight: 700,
  color: "#0f172a",
};

const sectionEyebrowStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const supportCopyStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 13,
  lineHeight: 1.6,
};

const actionChipRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const actionChipStyle: CSSProperties = {
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.01em",
};

const enabledActionChipStyle: CSSProperties = {
  color: "#1e3a8a",
  background: "rgba(37, 99, 235, 0.1)",
};

const enabledHighActionChipStyle: CSSProperties = {
  color: "#991b1b",
  background: "rgba(248, 113, 113, 0.12)",
};

const disabledActionChipStyle: CSSProperties = {
  color: "#64748b",
  background: "rgba(148, 163, 184, 0.14)",
};

const stackListStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const resourceCardStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 16,
  borderRadius: 16,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "#ffffff",
  boxShadow: "0 16px 32px rgba(15, 23, 42, 0.04)",
};

const nestedPlacardCardStyle: CSSProperties = {
  background: "rgba(248, 250, 252, 0.92)",
  boxShadow: "none",
};

const resourceCardHeaderStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  justifyContent: "space-between",
  alignItems: "flex-start",
};

const resourceTitleStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#0f172a",
};

const resourceMetaStyle: CSSProperties = {
  ...monoTextStyle,
  color: "#64748b",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
};

const detailValueStyle: CSSProperties = {
  color: "#0f172a",
  fontSize: 13,
  lineHeight: 1.55,
};

const resourceActionsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const resourceLinkRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const resourceLinkMetaStyle: CSSProperties = {
  ...monoTextStyle,
  color: "#94a3b8",
  fontSize: 11,
};

const placardPreviewStyle: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(15,23,42,0.16)",
  background: "linear-gradient(180deg, #fcfaf2 0%, #fffef8 100%)",
  padding: 18,
  color: "#111827",
};

const placardBrandStyle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  textAlign: "center",
  marginBottom: 10,
};

const placardCalloutStyle: CSSProperties = {
  borderTop: "1px solid #1f2937",
  borderBottom: "1px solid #1f2937",
  padding: "8px 0",
  marginBottom: 10,
  textAlign: "center",
  fontSize: 12,
  fontWeight: 700,
};

const placardBodyStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 11.5,
  lineHeight: 1.6,
};

const timelineStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const timelineItemStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "16px minmax(0, 1fr)",
  gap: 12,
  alignItems: "start",
};

const timelineDotStyle: CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: "50%",
  background: "#1d4ed8",
  marginTop: 6,
};
