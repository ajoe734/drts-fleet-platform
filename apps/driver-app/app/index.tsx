import { useEffect, useMemo, useState } from "react";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  PLATFORM_CODE_REGISTRY,
  type EmptyReason,
  type OwnedOrderRecord,
  type PlatformPresenceAdapterStatusRecord,
  type PlatformPresenceRecord,
  type PlatformPresenceSummary,
  type ShiftRecord,
  type UnifiedDriverTaskView,
} from "@drts/contracts";
import type { CanvasTone } from "@drts/ui-web/canvas-tokens";

import {
  Banner,
  Btn,
  Card,
  KPI,
  PageHeader,
  Pill,
  Shell,
  driverCanvasTheme,
} from "@/components/canvas-primitives";
import {
  buildFallbackUnifiedDriverTaskView,
  hasUnifiedTaskSyncIssue,
  isOwnedUnifiedTask,
  summarizeWorkspaceTasks,
} from "@/lib/driver-workspace-cockpit";
import {
  getDriverClient,
  getDriverId,
  initializeDriverIdentity,
  isDriverIdentityProvisioned,
} from "@/lib/api-client";
import {
  formatAmountNumber,
  formatMoney,
  getCurrencyLabel,
  sumMoneyAmounts,
} from "@/lib/money";
import { driverStrings } from "@/lib/strings";

type WorkspaceRoute =
  | "/jobs"
  | "/trip"
  | "/platform-presence"
  | "/earnings"
  | "/shift"
  | "/incident"
  | "/settings";

type WorkspaceLoadResult = {
  taskViews: UnifiedDriverTaskView[];
  orderMap: Record<string, OwnedOrderRecord>;
  taskFallbackMode: boolean;
  taskLoadError: string | null;
  platformSummary: PlatformPresenceSummary | null;
  platformLoadError: string | null;
  activeShift: ShiftRecord | null;
  shiftFeatureEnabled: boolean;
  shiftLoadError: boolean;
  loadedAt: string | null;
};

type HeroState =
  | "reauth"
  | "urgent_task"
  | "trip"
  | "go_online"
  | "off_shift"
  | "awaiting_platform"
  | "standing_by";

type HeroActionModel = {
  state: HeroState;
  tone: Exclude<CanvasTone, "neutral"> | "accent";
  eyebrow: string;
  title: string;
  detail: string;
  meta: string;
  primaryLabel: string;
  primaryRoute: WorkspaceRoute;
  secondaryLabel: string;
  secondaryRoute: WorkspaceRoute;
};

type EmptyStateModel = {
  reason: EmptyReason;
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  actionLabel: string;
  route: WorkspaceRoute;
};

type UrgentItem = {
  key: string;
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  actionLabel: string;
  route: WorkspaceRoute;
  iconName: keyof typeof Ionicons.glyphMap;
};

type PlatformWorkspaceRow = {
  key: string;
  name: string;
  summary: string;
  meta: string;
  tone: CanvasTone;
  forwarded: boolean;
};

type DeepLinkTileModel = {
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  helper: string;
  route: WorkspaceRoute;
  tone?: Exclude<CanvasTone, "neutral"> | "accent";
};

const THEME = driverCanvasTheme;
const REFRESH_INTERVAL_MS = 15_000;

const INITIAL_WORKSPACE: WorkspaceLoadResult = {
  taskViews: [],
  orderMap: {},
  taskFallbackMode: false,
  taskLoadError: null,
  platformSummary: null,
  platformLoadError: null,
  activeShift: null,
  shiftFeatureEnabled: true,
  shiftLoadError: false,
  loadedAt: null,
};

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return fallback;
}

function classifyErrorReason(message: string | null): EmptyReason {
  const normalized = message?.trim().toLowerCase() ?? "";
  if (
    normalized.includes("403") ||
    normalized.includes("401") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthorized") ||
    normalized.includes("permission") ||
    normalized.includes("權限")
  ) {
    return "permission_denied";
  }

  return "fetch_failed";
}

function formatClockLabel(value: string | null | undefined) {
  if (!value) {
    return "待同步";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompactDateTime(value: string | null | undefined) {
  if (!value) {
    return driverStrings.common.notUpdatedYet;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameLocalDay(value: string, reference: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return (
    parsed.getFullYear() === reference.getFullYear() &&
    parsed.getMonth() === reference.getMonth() &&
    parsed.getDate() === reference.getDate()
  );
}

function formatShiftDuration(shift: ShiftRecord | null) {
  if (!shift) {
    return "未上班";
  }

  if (
    typeof shift.totalHours === "number" &&
    Number.isFinite(shift.totalHours)
  ) {
    return `${shift.totalHours.toFixed(1)} 小時`;
  }

  const startedAt = new Date(shift.clockedInAt);
  if (Number.isNaN(startedAt.getTime())) {
    return "上班中";
  }

  const minutes = Math.max(
    0,
    Math.floor((Date.now() - startedAt.getTime()) / 60000),
  );
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (hours === 0) {
    return `${remainder} 分鐘`;
  }

  return `${hours} 小時 ${remainder} 分`;
}

function getPlatformTone(
  record: PlatformPresenceRecord,
  adapterStatus?: PlatformPresenceAdapterStatusRecord,
): CanvasTone {
  if (record.reauthRequired) {
    return "warn";
  }

  if (record.eligibility === "ineligible") {
    return "danger";
  }

  if (
    adapterStatus?.status === "degraded" ||
    adapterStatus?.status === "down"
  ) {
    return "warn";
  }

  if (record.status === "online") {
    return "success";
  }

  if (record.eligibility === "pending") {
    return "info";
  }

  return "neutral";
}

function formatTaskHeadline(task: UnifiedDriverTaskView) {
  return task.dropoffSummary ?? task.pickupSummary ?? task.taskId;
}

function formatTaskRouteSummary(task: UnifiedDriverTaskView) {
  if (task.pickupSummary && task.dropoffSummary) {
    return `${task.pickupSummary} → ${task.dropoffSummary}`;
  }

  return task.pickupSummary ?? task.dropoffSummary ?? "開啟任務查看完整路線";
}

function formatTaskActionSummary(task: UnifiedDriverTaskView) {
  if (task.allowedActions.length > 0) {
    return `可執行 ${task.allowedActions.join(" / ")}`;
  }

  if (task.blockingReason?.trim()) {
    return task.blockingReason.trim();
  }

  if (hasUnifiedTaskSyncIssue(task)) {
    return task.syncIssueSummary?.trim() ?? "需由派車台協助確認";
  }

  return "目前無可直接操作的任務動作";
}

function getRefreshSnapshot(
  loadedAt: string | null,
  nowSeed: number,
): { freshness: "fresh" | "stale" | "unknown"; label: string } {
  if (!loadedAt) {
    return { freshness: "unknown", label: "尚未同步" };
  }

  const age = nowSeed - Date.parse(loadedAt);
  if (!Number.isFinite(age) || age < 0) {
    return { freshness: "unknown", label: "等待校時" };
  }

  if (age <= REFRESH_INTERVAL_MS) {
    return { freshness: "fresh", label: "Fresh" };
  }

  return { freshness: "stale", label: "Stale" };
}

async function loadWorkspaceData(): Promise<WorkspaceLoadResult> {
  const client = getDriverClient();
  const driverId = getDriverId();

  const loadTaskViews = async (): Promise<{
    tasks: UnifiedDriverTaskView[];
    fallbackMode: boolean;
  }> => {
    try {
      const tasks = await client.listUnifiedDriverTasks();
      return { tasks, fallbackMode: false };
    } catch (unifiedError) {
      try {
        const legacyTasks = await client.listDriverTasks();
        return {
          tasks: legacyTasks.map(buildFallbackUnifiedDriverTaskView),
          fallbackMode: true,
        };
      } catch {
        throw unifiedError;
      }
    }
  };

  const [tasksResult, platformResult, shiftFlagResult] =
    await Promise.allSettled([
      loadTaskViews(),
      client.getPlatformPresence(),
      client.isFeatureEnabled("driver-app.shift"),
    ]);

  const next: WorkspaceLoadResult = {
    ...INITIAL_WORKSPACE,
    loadedAt: new Date().toISOString(),
  };

  if (tasksResult.status === "fulfilled") {
    next.taskViews = tasksResult.value.tasks;
    next.taskFallbackMode = tasksResult.value.fallbackMode;

    const uniqueOrderIds = [
      ...new Set(
        tasksResult.value.tasks.map((task) => task.orderId).filter(Boolean),
      ),
    ];
    const orderResults = await Promise.all(
      uniqueOrderIds.map(async (orderId) => {
        try {
          const order = (await client.getOrder(orderId)) as OwnedOrderRecord;
          return { orderId, order };
        } catch {
          return { orderId, order: null };
        }
      }),
    );

    next.orderMap = orderResults.reduce<Record<string, OwnedOrderRecord>>(
      (map, entry) => {
        if (entry.order) {
          map[entry.orderId] = entry.order;
        }

        return map;
      },
      {},
    );
  } else {
    next.taskLoadError = toErrorMessage(
      tasksResult.reason,
      "任務狀態暫時無法同步。",
    );
  }

  if (platformResult.status === "fulfilled") {
    next.platformSummary = platformResult.value;
  } else {
    next.platformLoadError = toErrorMessage(
      platformResult.reason,
      "平台就緒狀態暫時無法同步。",
    );
  }

  next.shiftFeatureEnabled =
    shiftFlagResult.status === "fulfilled" ? shiftFlagResult.value : true;

  if (next.shiftFeatureEnabled) {
    try {
      const shifts = await client.listShifts(driverId);
      next.activeShift =
        shifts.find((shift) => shift.status === "active") ?? null;
    } catch {
      next.shiftLoadError = true;
    }
  }

  return next;
}

function LoadingState({ label }: { label: string }) {
  return (
    <Shell theme={THEME} contentContainerStyle={styles.loadingShellContent}>
      <Card theme={THEME}>
        <View style={styles.loadingCard}>
          <ActivityIndicator color={THEME.accent} size="large" />
          <Text style={styles.loadingLabel}>{label}</Text>
        </View>
      </Card>
    </Shell>
  );
}

function HeaderActionButton({
  iconName,
  onPress,
  danger = false,
  withDot = false,
  label,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  danger?: boolean;
  withDot?: boolean;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerActionButton,
        danger ? styles.headerActionButtonDanger : null,
        pressed ? styles.headerActionButtonPressed : null,
      ]}
    >
      <Ionicons
        name={iconName}
        size={18}
        color={danger ? THEME.danger : THEME.text}
      />
      {withDot ? <View style={styles.headerActionDot} /> : null}
    </Pressable>
  );
}

function RefreshTierPill({
  loadedAt,
  nowSeed,
}: {
  loadedAt: string | null;
  nowSeed: number;
}) {
  const snapshot = getRefreshSnapshot(loadedAt, nowSeed);
  const tone = snapshot.freshness === "fresh" ? "success" : "warn";

  return (
    <View style={styles.refreshRow}>
      <Pill theme={THEME} tone={tone} dot>
        T3 · 15s
      </Pill>
      <Text style={styles.refreshLabel}>
        {snapshot.label} · {formatCompactDateTime(loadedAt)}
      </Text>
    </View>
  );
}

function HeroActionCard({
  model,
  onPrimaryPress,
  onSecondaryPress,
}: {
  model: HeroActionModel;
  onPrimaryPress: () => void;
  onSecondaryPress: () => void;
}) {
  const accentPalette =
    model.tone === "warn"
      ? {
          bg: THEME.warnBg,
          border: THEME.warnBorder,
          title: THEME.warn,
          button: THEME.warn,
        }
      : model.tone === "danger"
        ? {
            bg: THEME.dangerBg,
            border: THEME.dangerBorder,
            title: THEME.danger,
            button: THEME.danger,
          }
        : model.tone === "info"
          ? {
              bg: THEME.infoBg,
              border: THEME.infoBorder,
              title: THEME.info,
              button: THEME.info,
            }
          : {
              bg: THEME.accentBg,
              border: THEME.accentBorder,
              title: "#FFFFFF",
              button: THEME.accent,
            };

  return (
    <Card
      theme={THEME}
      padding={0}
      style={[
        styles.heroCard,
        {
          backgroundColor: accentPalette.bg,
          borderColor: accentPalette.border,
        },
      ]}
    >
      <View style={styles.heroSurface}>
        <View style={styles.heroGlowLarge} />
        <View style={styles.heroGlowSmall} />
        <View style={styles.heroEyebrowRow}>
          <View style={styles.heroEyebrowDot} />
          <Text style={styles.heroEyebrow}>{model.eyebrow}</Text>
        </View>
        <Text style={[styles.heroTitle, { color: accentPalette.title }]}>
          {model.title}
        </Text>
        <Text style={styles.heroDetail}>{model.detail}</Text>
        <Text style={styles.heroMeta}>{model.meta}</Text>
        <View style={styles.heroActionRow}>
          <Btn
            theme={THEME}
            variant="primary"
            size="md"
            onPress={onPrimaryPress}
            style={[
              styles.heroPrimaryButton,
              { backgroundColor: accentPalette.button },
            ]}
          >
            {model.primaryLabel}
          </Btn>
          <Btn
            theme={THEME}
            variant="secondary"
            size="md"
            onPress={onSecondaryPress}
            style={styles.heroSecondaryButton}
          >
            {model.secondaryLabel}
          </Btn>
        </View>
      </View>
    </Card>
  );
}

function FocusEmptyStateCard({
  state,
  onPress,
}: {
  state: EmptyStateModel;
  onPress: () => void;
}) {
  return (
    <Banner
      theme={THEME}
      tone={state.tone}
      title={`${state.title} · ${state.reason}`}
      body={state.body}
      actions={
        <Btn theme={THEME} variant="secondary" size="sm" onPress={onPress}>
          {state.actionLabel}
        </Btn>
      }
    />
  );
}

function UrgentSignalCard({
  item,
  onPress,
}: {
  item: UrgentItem;
  onPress: () => void;
}) {
  const palette =
    item.tone === "danger"
      ? {
          icon: THEME.danger,
          bg: THEME.dangerBg,
          border: THEME.dangerBorder,
        }
      : item.tone === "warn"
        ? {
            icon: THEME.warn,
            bg: THEME.warnBg,
            border: THEME.warnBorder,
          }
        : {
            icon: THEME.info,
            bg: THEME.infoBg,
            border: THEME.infoBorder,
          };

  return (
    <Card
      theme={THEME}
      padding={14}
      style={[
        styles.urgentCard,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <View style={styles.urgentRow}>
        <View
          style={[
            styles.urgentIconWrap,
            { backgroundColor: `${palette.icon}22` },
          ]}
        >
          <Ionicons name={item.iconName} size={16} color={palette.icon} />
        </View>
        <View style={styles.urgentCopy}>
          <Text style={[styles.urgentTitle, { color: palette.icon }]}>
            {item.title}
          </Text>
          <Text style={styles.urgentBody}>{item.body}</Text>
        </View>
        <Btn theme={THEME} variant="secondary" size="sm" onPress={onPress}>
          {item.actionLabel}
        </Btn>
      </View>
    </Card>
  );
}

function PlatformHealthCard({
  rows,
  onlineCount,
  totalCount,
  reauthCount,
  degradedCount,
  forwardedPendingCount,
  onPress,
}: {
  rows: PlatformWorkspaceRow[];
  onlineCount: number;
  totalCount: number;
  reauthCount: number;
  degradedCount: number;
  forwardedPendingCount: number;
  onPress: () => void;
}) {
  return (
    <View style={styles.sectionBlock}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>平台健康</Text>
          <Text style={styles.sectionTitle}>
            Online {onlineCount} / {totalCount}
          </Text>
        </View>
        <Btn theme={THEME} variant="ghost" size="sm" onPress={onPress}>
          全部平台
        </Btn>
      </View>
      <Card theme={THEME} padding={14}>
        <View style={styles.platformSummaryRow}>
          <Pill
            theme={THEME}
            tone={onlineCount > 0 ? "success" : "neutral"}
            dot
          >
            上線 {onlineCount}
          </Pill>
          <Pill theme={THEME} tone={reauthCount > 0 ? "warn" : "neutral"} dot>
            重新授權 {reauthCount}
          </Pill>
          <Pill theme={THEME} tone={degradedCount > 0 ? "warn" : "neutral"} dot>
            降級 {degradedCount}
          </Pill>
          <Pill
            theme={THEME}
            tone={forwardedPendingCount > 0 ? "info" : "neutral"}
            dot
          >
            待平台確認 {forwardedPendingCount}
          </Pill>
        </View>
        <View style={styles.platformList}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              accessibilityRole="button"
              accessibilityLabel={`${row.name} 平台摘要`}
              onPress={onPress}
              style={({ pressed }) => [
                styles.platformRow,
                pressed ? styles.tilePressed : null,
              ]}
            >
              <View style={styles.platformRowCopy}>
                <View style={styles.platformRowHeadline}>
                  <Text style={styles.platformRowName}>{row.name}</Text>
                  {row.forwarded ? (
                    <Pill theme={THEME} tone="info">
                      外部
                    </Pill>
                  ) : (
                    <Pill theme={THEME} tone="accent">
                      自營
                    </Pill>
                  )}
                </View>
                <Text style={styles.platformRowSummary}>{row.summary}</Text>
                <Text style={styles.platformRowMeta}>{row.meta}</Text>
              </View>
              <Pill theme={THEME} tone={row.tone} dot>
                {row.tone === "success"
                  ? "在線"
                  : row.tone === "warn"
                    ? "注意"
                    : row.tone === "danger"
                      ? "不可用"
                      : row.tone === "info"
                        ? "待審"
                        : "離線"}
              </Pill>
            </Pressable>
          ))}
        </View>
      </Card>
    </View>
  );
}

function DeepLinkTile({
  model,
  onPress,
}: {
  model: DeepLinkTileModel;
  onPress: () => void;
}) {
  const tone = model.tone ?? "accent";
  const palette =
    tone === "danger"
      ? { fg: THEME.danger, bg: THEME.dangerBg }
      : tone === "info"
        ? { fg: THEME.info, bg: THEME.infoBg }
        : tone === "warn"
          ? { fg: THEME.warn, bg: THEME.warnBg }
          : { fg: THEME.accent, bg: THEME.accentBg };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.deepLinkTileWrap,
        pressed ? styles.tilePressed : null,
      ]}
    >
      <Card theme={THEME} padding={14}>
        <View style={styles.deepLinkTileRow}>
          <View
            style={[styles.deepLinkIconWrap, { backgroundColor: palette.bg }]}
          >
            <Ionicons name={model.iconName} size={17} color={palette.fg} />
          </View>
          <View style={styles.deepLinkCopy}>
            <Text style={styles.deepLinkLabel}>{model.label}</Text>
            <Text style={styles.deepLinkHelper}>{model.helper}</Text>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function WorkspaceIndex() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [identityIssue, setIdentityIssue] = useState<string | null>(null);
  const [provisioned, setProvisioned] = useState(false);
  const [workspace, setWorkspace] =
    useState<WorkspaceLoadResult>(INITIAL_WORKSPACE);
  const [loading, setLoading] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [nowSeed, setNowSeed] = useState(Date.now());

  useEffect(() => {
    let cancelled = false;

    void initializeDriverIdentity()
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setIdentityIssue(
          error instanceof Error
            ? error.message
            : "裝置初始化失敗，請稍後再試。",
        );
      })
      .finally(() => {
        if (cancelled) {
          return;
        }

        setProvisioned(isDriverIdentityProvisioned());
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !provisioned) {
      return;
    }

    const timer = setInterval(() => {
      setRefreshSeed((current) => current + 1);
      setNowSeed(Date.now());
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [provisioned, ready]);

  useEffect(() => {
    if (!ready || !provisioned) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    void loadWorkspaceData()
      .then((result) => {
        if (cancelled) {
          return;
        }

        setWorkspace(result);
        setNowSeed(Date.now());
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setWorkspace({
          ...INITIAL_WORKSPACE,
          taskLoadError: toErrorMessage(error, "工作台資料載入失敗。"),
          platformLoadError: "平台就緒狀態暫時無法同步。",
          loadedAt: new Date().toISOString(),
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provisioned, ready, refreshSeed]);

  const navigate = (route: WorkspaceRoute) => () => router.push(route);

  const isDriverOnShift = workspace.activeShift !== null;
  const taskSummary = useMemo(
    () => summarizeWorkspaceTasks(workspace.taskViews),
    [workspace.taskViews],
  );
  const externalPresences = workspace.platformSummary?.presences ?? [];
  const adapterStatuses = workspace.platformSummary?.adapterStatuses ?? [];
  const adapterStatusByCode = useMemo(
    () =>
      adapterStatuses.reduce<
        Partial<Record<string, PlatformPresenceAdapterStatusRecord>>
      >((map, status) => {
        map[status.platformCode] = status;
        return map;
      }, {}),
    [adapterStatuses],
  );
  const reauthPlatforms = useMemo(
    () => externalPresences.filter((record) => record.reauthRequired),
    [externalPresences],
  );

  const platformRows = useMemo(() => {
    const ownedRow: PlatformWorkspaceRow = {
      key: "owned-drts",
      name: "自營派單",
      summary: isDriverOnShift
        ? `已上線 · ${formatClockLabel(workspace.activeShift?.clockedInAt)} 起`
        : "離線 · 尚未上班",
      meta: workspace.shiftLoadError
        ? "班次同步延遲"
        : workspace.shiftFeatureEnabled
          ? `班次 ${formatShiftDuration(workspace.activeShift)}`
          : "班次功能未啟用",
      tone: isDriverOnShift ? "success" : "neutral",
      forwarded: false,
    };

    const forwardedRows = externalPresences
      .map<PlatformWorkspaceRow>((record) => {
        const adapter = adapterStatusByCode[record.platformCode];
        const latestAt =
          record.status === "online"
            ? record.lastOnlineAt
            : record.lastOfflineAt;
        return {
          key: `platform-${record.platformCode}`,
          name:
            PLATFORM_CODE_REGISTRY[record.platformCode]?.displayName ??
            record.platformCode,
          summary: record.reauthRequired
            ? "需重新授權"
            : record.eligibility === "pending"
              ? "資格待審核"
              : record.eligibility === "ineligible"
                ? "目前不可接該平台任務"
                : `${
                    record.status === "online" ? "已上線" : "離線"
                  } · ${formatClockLabel(latestAt ?? record.updatedAt)}`,
          meta:
            adapter?.status === "degraded" || adapter?.status === "down"
              ? adapter.blockingReason?.trim() || "平台連線降級"
              : `最後同步 ${formatCompactDateTime(record.updatedAt)}`,
          tone: getPlatformTone(record, adapter),
          forwarded: true,
        };
      })
      .sort((left, right) => {
        const weight = (tone: CanvasTone) => {
          switch (tone) {
            case "danger":
              return 4;
            case "warn":
              return 3;
            case "info":
              return 2;
            case "success":
              return 1;
            default:
              return 0;
          }
        };

        return (
          weight(right.tone) - weight(left.tone) ||
          left.name.localeCompare(right.name, "zh-TW")
        );
      });

    return [ownedRow, ...forwardedRows];
  }, [
    adapterStatusByCode,
    externalPresences,
    isDriverOnShift,
    workspace.activeShift,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const onlinePlatformCount = useMemo(
    () =>
      externalPresences.filter(
        (record) => record.status === "online" && !record.reauthRequired,
      ).length + (isDriverOnShift ? 1 : 0),
    [externalPresences, isDriverOnShift],
  );

  const degradedPlatformCount = useMemo(
    () =>
      externalPresences.filter((record) => {
        const adapter = adapterStatusByCode[record.platformCode];
        return adapter?.status === "degraded" || adapter?.status === "down";
      }).length,
    [adapterStatusByCode, externalPresences],
  );

  const notEligibleCount = useMemo(
    () =>
      externalPresences.filter((record) => record.eligibility === "ineligible")
        .length,
    [externalPresences],
  );

  const pendingEligibilityCount = useMemo(
    () =>
      externalPresences.filter((record) => record.eligibility === "pending")
        .length,
    [externalPresences],
  );

  const todayNetSummary = useMemo(() => {
    const now = new Date();
    const completedTodayTasks = taskSummary.orderedTasks.filter(
      (task) =>
        task.driverActionState === "completed" &&
        isSameLocalDay(task.updatedAt, now),
    );
    const amount = sumMoneyAmounts(
      completedTodayTasks.map(
        (task) => workspace.orderMap[task.orderId]?.quotedFare ?? null,
      ),
    );

    return {
      count: completedTodayTasks.length,
      amount,
    };
  }, [taskSummary.orderedTasks, workspace.orderMap]);

  const focusEmptyState = useMemo<EmptyStateModel | null>(() => {
    if (workspace.taskLoadError && workspace.taskViews.length === 0) {
      const reason = classifyErrorReason(workspace.taskLoadError);
      return {
        reason,
        tone: reason === "permission_denied" ? "warn" : "danger",
        title: reason === "permission_denied" ? "權限不足" : "資料讀取失敗",
        body:
          reason === "permission_denied"
            ? "目前無法讀取工作台任務資料，請確認司機帳號權限或聯繫管理員。"
            : workspace.taskLoadError,
        actionLabel: "前往設定",
        route: "/settings",
      };
    }

    if (
      workspace.platformSummary === null &&
      workspace.platformLoadError &&
      !workspace.taskLoadError
    ) {
      return {
        reason: "external_unavailable",
        tone: "warn",
        title: "外部平台暫時不可用",
        body: workspace.platformLoadError,
        actionLabel: "查看平台",
        route: "/platform-presence",
      };
    }

    if (externalPresences.length === 0) {
      return {
        reason: "not_provisioned",
        tone: "info",
        title: "尚未綁定平台帳號",
        body: "目前只有自營派單資訊，若要接收外部平台任務，請先完成平台綁定與授權。",
        actionLabel: "管理平台",
        route: "/platform-presence",
      };
    }

    if (
      externalPresences.length > 0 &&
      externalPresences.every((record) => record.eligibility === "ineligible")
    ) {
      return {
        reason: "driver_not_eligible",
        tone: "danger",
        title: "目前不具備接單資格",
        body: "所有外部平台都回報司機資格不符。請先前往平台頁檢查授權、資格或由派車台協助排除。",
        actionLabel: "檢查資格",
        route: "/platform-presence",
      };
    }

    if (
      taskSummary.pendingCount === 0 &&
      taskSummary.orderedTasks.length === 0 &&
      onlinePlatformCount > 0
    ) {
      return {
        reason: "no_data",
        tone: "info",
        title: "目前沒有新任務",
        body: "工作台已待命。保持平台在線與班次正常，新的派單或平台任務會優先出現在這裡。",
        actionLabel: "查看任務",
        route: "/jobs",
      };
    }

    if (
      taskSummary.pendingCount === 0 &&
      taskSummary.orderedTasks.length > 0 &&
      !taskSummary.activeTripTask &&
      !taskSummary.actionRequiredTask
    ) {
      return {
        reason: "filtered_empty",
        tone: "info",
        title: "目前沒有需立即處理的項目",
        body: "工作台的 urgent lane 已清空，您可以查看今日收入、班次或維持平台在線待命。",
        actionLabel: "查看收入",
        route: "/earnings",
      };
    }

    return null;
  }, [
    externalPresences,
    onlinePlatformCount,
    taskSummary.activeTripTask,
    taskSummary.actionRequiredTask,
    taskSummary.orderedTasks.length,
    taskSummary.pendingCount,
    workspace.platformLoadError,
    workspace.platformSummary,
    workspace.taskLoadError,
    workspace.taskViews.length,
  ]);

  const urgentItems = useMemo(() => {
    const items: UrgentItem[] = [];

    for (const platform of reauthPlatforms) {
      const name =
        PLATFORM_CODE_REGISTRY[platform.platformCode]?.displayName ??
        platform.platformCode;

      items.push({
        key: `reauth-${platform.platformCode}`,
        tone: "warn",
        title: `${name} 需重新授權`,
        body: `Token 已失效 · 最後同步 ${formatCompactDateTime(platform.updatedAt)}`,
        actionLabel: "處理",
        route: "/platform-presence",
        iconName: "lock-closed-outline",
      });
    }

    if (taskSummary.actionRequiredTask) {
      items.push({
        key: `urgent-${taskSummary.actionRequiredTask.taskId}`,
        tone: "info",
        title: `任務待回應 · ${formatTaskHeadline(taskSummary.actionRequiredTask)}`,
        body: formatTaskActionSummary(taskSummary.actionRequiredTask),
        actionLabel: "查看任務",
        route: "/jobs",
        iconName: "timer-outline",
      });
    }

    if (
      taskSummary.syncIssueTask &&
      !isOwnedUnifiedTask(taskSummary.syncIssueTask)
    ) {
      items.push({
        key: `sync-${taskSummary.syncIssueTask.taskId}`,
        tone: "danger",
        title: `${taskSummary.syncIssueTask.platformDisplayName} 同步異常`,
        body:
          taskSummary.syncIssueTask.syncIssueSummary?.trim() ||
          "外部平台回傳狀態異常，需要派車台協助確認。",
        actionLabel: "查看任務",
        route: "/jobs",
        iconName: "warning-outline",
      });
    }

    if (
      workspace.shiftFeatureEnabled &&
      !workspace.shiftLoadError &&
      !isDriverOnShift &&
      taskSummary.pendingCount > 0
    ) {
      items.push({
        key: "off-shift-pending",
        tone: "info",
        title: "尚未上班",
        body: "仍有待處理任務，但自營派單尚未切成可接單狀態。",
        actionLabel: "班次",
        route: "/shift",
        iconName: "time-outline",
      });
    }

    return items.slice(0, 3);
  }, [
    isDriverOnShift,
    reauthPlatforms,
    taskSummary.actionRequiredTask,
    taskSummary.pendingCount,
    taskSummary.syncIssueTask,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const heroAction = useMemo<HeroActionModel>(() => {
    if (reauthPlatforms.length > 0) {
      const platform = reauthPlatforms[0];
      const name =
        PLATFORM_CODE_REGISTRY[platform.platformCode]?.displayName ??
        platform.platformCode;

      return {
        state: "reauth",
        tone: "warn",
        eyebrow: "Next Best Action · Re-auth",
        title: `先恢復 ${name} 授權`,
        detail: "任何需重新授權的平台都應優先處理，否則該平台接單能力暫停。",
        meta: `最後同步 ${formatCompactDateTime(platform.updatedAt)} · cross-app deep link: none`,
        primaryLabel: "處理重新授權",
        primaryRoute: "/platform-presence",
        secondaryLabel: "查看任務",
        secondaryRoute: "/jobs",
      };
    }

    if (taskSummary.actionRequiredTask) {
      const task = taskSummary.actionRequiredTask;
      return {
        state: "urgent_task",
        tone: "info",
        eyebrow: "Next Best Action · Urgent task",
        title: `優先回應 ${formatTaskHeadline(task)}`,
        detail: formatTaskRouteSummary(task),
        meta: `${task.platformDisplayName} · ${formatTaskActionSummary(task)}`,
        primaryLabel: "打開任務",
        primaryRoute: "/jobs",
        secondaryLabel: "查看平台",
        secondaryRoute: "/platform-presence",
      };
    }

    if (taskSummary.activeTripTask) {
      const task = taskSummary.activeTripTask;
      const fareLabel = workspace.orderMap[task.orderId]?.quotedFare
        ? formatMoney(workspace.orderMap[task.orderId]?.quotedFare)
        : "車資待確認";

      return {
        state: "trip",
        tone: "accent",
        eyebrow: "Next Best Action · Active trip",
        title: `返回進行中的行程`,
        detail: formatTaskRouteSummary(task),
        meta: `${task.taskId} · ${fareLabel} · ${formatCompactDateTime(task.updatedAt)}`,
        primaryLabel: "前往行程",
        primaryRoute: "/trip",
        secondaryLabel: "任務詳情",
        secondaryRoute: "/jobs",
      };
    }

    if (
      workspace.shiftFeatureEnabled &&
      !workspace.shiftLoadError &&
      !isDriverOnShift
    ) {
      return {
        state: "off_shift",
        tone: "accent",
        eyebrow: "Next Best Action · Start shift",
        title: "先開始班次",
        detail: "依 spec，off-shift 時工作台主 CTA 必須回到班次啟動。",
        meta: "班次啟動後，自營派單會切換為可接單狀態。",
        primaryLabel: "前往班次",
        primaryRoute: "/shift",
        secondaryLabel: "查看平台",
        secondaryRoute: "/platform-presence",
      };
    }

    if (onlinePlatformCount === 0) {
      return {
        state: "go_online",
        tone: "info",
        eyebrow: "Next Best Action · Go online",
        title: "讓至少一個平台上線",
        detail: "目前沒有任何平台處於可接單狀態，新的派單不會送達。",
        meta: "平台健康與帳號授權狀態都可以在平台頁處理。",
        primaryLabel: "前往平台中心",
        primaryRoute: "/platform-presence",
        secondaryLabel: "查看班次",
        secondaryRoute: "/shift",
      };
    }

    if (taskSummary.awaitingPlatformTask) {
      return {
        state: "awaiting_platform",
        tone: "info",
        eyebrow: "Next Best Action · Awaiting platform",
        title: "等待平台確認",
        detail: formatTaskRouteSummary(taskSummary.awaitingPlatformTask),
        meta: "來源平台尚未回覆前，請不要提前前往接送點。",
        primaryLabel: "查看任務",
        primaryRoute: "/jobs",
        secondaryLabel: "平台狀態",
        secondaryRoute: "/platform-presence",
      };
    }

    return {
      state: "standing_by",
      tone: "accent",
      eyebrow: "Next Best Action · Standing by",
      title: "工作台待命中",
      detail:
        "沒有需要立即處理的任務，保持平台在線並留意新的派單或重新授權提醒。",
      meta: "這是 cockpit，不是純入口頁；最重要的狀態已集中在上方。",
      primaryLabel: "查看任務",
      primaryRoute: "/jobs",
      secondaryLabel: "查看收入",
      secondaryRoute: "/earnings",
    };
  }, [
    isDriverOnShift,
    onlinePlatformCount,
    reauthPlatforms,
    taskSummary.actionRequiredTask,
    taskSummary.activeTripTask,
    taskSummary.awaitingPlatformTask,
    workspace.orderMap,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const deepLinks = useMemo<DeepLinkTileModel[]>(
    () => [
      {
        iconName: "briefcase-outline",
        label: "任務收件匣",
        helper:
          taskSummary.pendingCount > 0
            ? `${taskSummary.pendingCount} 件待處理`
            : "查看全部任務與可用動作",
        route: "/jobs",
      },
      {
        iconName: "car-sport-outline",
        label: "行程工作區",
        helper: taskSummary.activeTripTask
          ? formatTaskHeadline(taskSummary.activeTripTask)
          : "沒有進行中的行程時會顯示空態",
        route: "/trip",
      },
      {
        iconName: "layers-outline",
        label: "平台中心",
        helper:
          reauthPlatforms.length > 0
            ? `${reauthPlatforms.length} 個平台需重新授權`
            : `${onlinePlatformCount} 個平台在線`,
        route: "/platform-presence",
        tone: reauthPlatforms.length > 0 ? "warn" : "accent",
      },
      {
        iconName: "cash-outline",
        label: "今日收入",
        helper: `${getCurrencyLabel(todayNetSummary.amount.currency) || "NT$"} ${formatAmountNumber(
          todayNetSummary.amount,
          { fractionDigits: 0 },
        )}`,
        route: "/earnings",
      },
      {
        iconName: "time-outline",
        label: "班次",
        helper: formatShiftDuration(workspace.activeShift),
        route: "/shift",
      },
      {
        iconName: "settings-outline",
        label: "設定",
        helper: "裝置身份、帳號與通知設定",
        route: "/settings",
      },
    ],
    [
      onlinePlatformCount,
      reauthPlatforms.length,
      taskSummary.activeTripTask,
      taskSummary.pendingCount,
      todayNetSummary.amount,
      workspace.activeShift,
    ],
  );

  const headerStatusLabel = useMemo(() => {
    if (!workspace.shiftFeatureEnabled) {
      return "班次功能未啟用";
    }

    if (workspace.shiftLoadError) {
      return "班次同步延遲";
    }

    if (isDriverOnShift) {
      return `上班中 · ${formatClockLabel(workspace.activeShift?.clockedInAt)} 起`;
    }

    return "尚未上班";
  }, [
    isDriverOnShift,
    workspace.activeShift,
    workspace.shiftFeatureEnabled,
    workspace.shiftLoadError,
  ]);

  const notificationCount =
    urgentItems.length +
    (focusEmptyState?.reason === "driver_not_eligible" ? 1 : 0) +
    (identityIssue ? 1 : 0);

  if (!ready) {
    return <LoadingState label="正在檢查裝置配置…" />;
  }

  if (!provisioned) {
    return <Redirect href="/onboarding" />;
  }

  if (
    loading &&
    workspace.platformSummary === null &&
    !workspace.taskLoadError &&
    workspace.taskViews.length === 0
  ) {
    return <LoadingState label="正在載入工作台…" />;
  }

  return (
    <Shell theme={THEME} contentContainerStyle={styles.shellContent}>
      <PageHeader
        title={
          <View style={styles.headerTitleStack}>
            <Text style={styles.headerTitle}>工作台</Text>
            <Text style={styles.headerSubtitle}>Workspace cockpit</Text>
          </View>
        }
        subtitle={
          <View style={styles.headerMetaWrap}>
            <View style={styles.headerMetaRow}>
              <View
                style={[
                  styles.headerStatusDot,
                  {
                    backgroundColor: isDriverOnShift
                      ? THEME.success
                      : THEME.textDim,
                  },
                ]}
              />
              <Text style={styles.headerStatusText}>{headerStatusLabel}</Text>
              <Text style={styles.headerMetaText}>{getDriverId()}</Text>
            </View>
            <RefreshTierPill loadedAt={workspace.loadedAt} nowSeed={nowSeed} />
          </View>
        }
        actions={
          <View style={styles.headerActions}>
            <HeaderActionButton
              iconName="refresh-outline"
              label="手動刷新工作台"
              onPress={() => {
                setNowSeed(Date.now());
                setRefreshSeed((current) => current + 1);
              }}
            />
            <HeaderActionButton
              iconName="notifications-outline"
              label="查看通知與緊急事件"
              withDot={notificationCount > 0}
              onPress={navigate("/incident")}
            />
            <HeaderActionButton
              iconName="warning-outline"
              label="開啟 SOS"
              danger
              onPress={navigate("/incident")}
            />
          </View>
        }
      />

      {identityIssue ? (
        <Banner
          theme={THEME}
          tone="danger"
          title="裝置身份異常"
          body={identityIssue}
        />
      ) : null}

      {workspace.taskFallbackMode ? (
        <Banner
          theme={THEME}
          tone="info"
          title="任務同步降級模式"
          body="目前改用舊版任務摘要。平台原生狀態與 availableActions 尚未完整帶出時，請以前往任務頁查看為準。"
        />
      ) : null}

      {workspace.platformLoadError && workspace.platformSummary !== null ? (
        <Banner
          theme={THEME}
          tone="warn"
          title="平台健康資訊延遲"
          body={workspace.platformLoadError}
        />
      ) : null}

      <HeroActionCard
        model={heroAction}
        onPrimaryPress={navigate(heroAction.primaryRoute)}
        onSecondaryPress={navigate(heroAction.secondaryRoute)}
      />

      <View style={styles.kpiRow}>
        <View style={styles.kpiCell}>
          <KPI
            theme={THEME}
            label="待處理"
            value={String(taskSummary.pendingCount)}
            sub={`${taskSummary.urgentCount} 件需立即回應`}
          />
        </View>
        <View style={styles.kpiCell}>
          <KPI
            theme={THEME}
            label="平台在線"
            value={String(onlinePlatformCount)}
            sub={`/ ${platformRows.length}`}
          />
        </View>
        <View style={styles.kpiCell}>
          <KPI
            theme={THEME}
            label="今日淨收"
            value={formatAmountNumber(todayNetSummary.amount, {
              fractionDigits: 0,
            })}
            sub={getCurrencyLabel(todayNetSummary.amount.currency) || "NT$"}
          />
        </View>
      </View>

      {focusEmptyState ? (
        <FocusEmptyStateCard
          state={focusEmptyState}
          onPress={navigate(focusEmptyState.route)}
        />
      ) : null}

      {urgentItems.map((item) => (
        <UrgentSignalCard
          key={item.key}
          item={item}
          onPress={navigate(item.route)}
        />
      ))}

      <PlatformHealthCard
        rows={platformRows}
        onlineCount={onlinePlatformCount}
        totalCount={platformRows.length}
        reauthCount={reauthPlatforms.length}
        degradedCount={degradedPlatformCount}
        forwardedPendingCount={taskSummary.pendingPlatformCount}
        onPress={navigate("/platform-presence")}
      />

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Cross-app / deep links</Text>
            <Text style={styles.sectionTitle}>Phase 1 僅支援 app 內深連結</Text>
          </View>
        </View>
        <Text style={styles.sectionBody}>
          依 spec，driver app 目前沒有對 web consoles 的 cross-app deep
          links。下列快捷動作全部導向本 app 內頁面。
        </Text>
        <View style={styles.deepLinkGrid}>
          {deepLinks.map((item) => (
            <DeepLinkTile
              key={`${item.route}-${item.label}`}
              model={item}
              onPress={navigate(item.route)}
            />
          ))}
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>Eligibility / readiness</Text>
            <Text style={styles.sectionTitle}>平台資格與工作台摘要</Text>
          </View>
        </View>
        <Card theme={THEME} padding={14}>
          <View style={styles.readinessRow}>
            <Pill
              theme={THEME}
              tone={notEligibleCount > 0 ? "danger" : "neutral"}
              dot
            >
              不符合資格 {notEligibleCount}
            </Pill>
            <Pill
              theme={THEME}
              tone={pendingEligibilityCount > 0 ? "info" : "neutral"}
              dot
            >
              待審核 {pendingEligibilityCount}
            </Pill>
            <Pill
              theme={THEME}
              tone={taskSummary.syncIssueCount > 0 ? "warn" : "neutral"}
              dot
            >
              同步異常 {taskSummary.syncIssueCount}
            </Pill>
          </View>
          <Text style={styles.readinessBody}>
            必備資料已就位：裝置身份、班次狀態、多平台健康、urgent task count、
            active trip summary 與 next-best-action。當 backend 尚未提供
            ui-runtime envelope 時，工作台以現有 contract 做降級呈現。
          </Text>
        </Card>
      </View>
    </Shell>
  );
}

const styles = StyleSheet.create({
  shellContent: {
    paddingBottom: 28,
    gap: 12,
  },
  loadingShellContent: {
    flexGrow: 1,
    justifyContent: "center",
    gap: 16,
  },
  loadingCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    minHeight: 180,
  },
  loadingLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
  },
  headerTitleStack: {
    gap: 2,
  },
  headerTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
  },
  headerMetaWrap: {
    gap: 6,
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  headerStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  headerStatusText: {
    color: THEME.textDim,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
  },
  headerMetaText: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 11.5,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerActionButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: THEME.border,
    backgroundColor: THEME.surface,
    position: "relative",
  },
  headerActionButtonDanger: {
    backgroundColor: THEME.dangerBg,
    borderColor: THEME.dangerBorder,
  },
  headerActionButtonPressed: {
    opacity: 0.86,
  },
  headerActionDot: {
    position: "absolute",
    top: 9,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: THEME.danger,
  },
  refreshRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  refreshLabel: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 10.5,
  },
  heroCard: {
    overflow: "hidden",
  },
  heroSurface: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    borderRadius: 18,
    overflow: "hidden",
    gap: 6,
  },
  heroGlowLarge: {
    position: "absolute",
    top: -30,
    right: -18,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  heroGlowSmall: {
    position: "absolute",
    bottom: -22,
    left: -10,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  heroEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  heroEyebrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  heroEyebrow: {
    color: "#FFFFFF",
    fontFamily: THEME.monoFamily,
    fontSize: 10.5,
    fontWeight: "700",
  },
  heroTitle: {
    fontFamily: THEME.fontFamily,
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  heroDetail: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 14,
    lineHeight: 20,
  },
  heroMeta: {
    color: THEME.textMuted,
    fontFamily: THEME.monoFamily,
    fontSize: 11,
    lineHeight: 16,
  },
  heroActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  heroPrimaryButton: {
    flex: 1,
  },
  heroSecondaryButton: {
    flex: 1,
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10,
  },
  kpiCell: {
    flex: 1,
  },
  urgentCard: {
    overflow: "hidden",
  },
  urgentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  urgentIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  urgentCopy: {
    flex: 1,
    gap: 2,
  },
  urgentTitle: {
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  urgentBody: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionBlock: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionEyebrow: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 10.5,
  },
  sectionTitle: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  sectionBody: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    lineHeight: 18,
  },
  platformSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  platformList: {
    gap: 10,
  },
  platformRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: THEME.border,
  },
  platformRowCopy: {
    flex: 1,
    gap: 4,
  },
  platformRowHeadline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  platformRowName: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  platformRowSummary: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
  },
  platformRowMeta: {
    color: THEME.textDim,
    fontFamily: THEME.monoFamily,
    fontSize: 10.5,
    lineHeight: 15,
  },
  deepLinkGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  deepLinkTileWrap: {
    width: "48%",
  },
  deepLinkTileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deepLinkIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  deepLinkCopy: {
    flex: 1,
    gap: 2,
  },
  deepLinkLabel: {
    color: THEME.text,
    fontFamily: THEME.fontFamily,
    fontSize: 13,
    fontWeight: "700",
  },
  deepLinkHelper: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 11.5,
    lineHeight: 16,
  },
  readinessRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  readinessBody: {
    color: THEME.textMuted,
    fontFamily: THEME.fontFamily,
    fontSize: 12.5,
    lineHeight: 18,
  },
  tilePressed: {
    opacity: 0.86,
  },
});
