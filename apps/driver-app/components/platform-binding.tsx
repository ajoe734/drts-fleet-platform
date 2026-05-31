import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { EmptyReason, PlatformReauthMechanism } from "@drts/contracts";

import {
  Banner,
  Btn,
  Pill,
  driverCanvasTheme,
  type DriverCanvasTheme,
} from "@/components/canvas-primitives";
import type {
  PlatformBindingAction,
  PlatformBindingView,
} from "@/lib/platform-binding-view";

const THEME = driverCanvasTheme;

type IconName = keyof typeof Ionicons.glyphMap;

/** Q-DRV05 — the four platform-configured re-auth mechanisms. */
const REAUTH_MECHANISMS: Record<
  PlatformReauthMechanism,
  { zh: string; en: string; icon: IconName; cta: string }
> = {
  external_browser_oauth: {
    zh: "OAuth · 外部瀏覽器",
    en: "external_browser_oauth",
    icon: "open-outline",
    cta: "重新驗證",
  },
  native_app_deeplink: {
    zh: "平台 App 跳轉",
    en: "native_app_deeplink",
    icon: "link-outline",
    cta: "開啟平台 App",
  },
  manual_credential: {
    zh: "手動輸入帳密",
    en: "manual_credential",
    icon: "key-outline",
    cta: "輸入帳密",
  },
  ops_managed: {
    zh: "由派車台處理",
    en: "ops_managed",
    icon: "call-outline",
    cta: "聯絡派車台",
  },
};

/** Q-X15 — six distinct empty-state treatments for the binding list. */
const EMPTY_STATES: Record<
  Exclude<EmptyReason, "filtered_empty">,
  { icon: IconName; title: string; description: string; action?: string }
> = {
  no_data: {
    icon: "cube-outline",
    title: "目前沒有平台資料",
    description: "尚無可顯示的平台綁定，稍後再回來查看。",
  },
  not_provisioned: {
    icon: "link-outline",
    title: "尚未綁定平台帳號",
    description: "綁定外部平台帳號後，即可在此管理上線與接單資格。",
    action: "新增平台綁定",
  },
  fetch_failed: {
    icon: "cloud-offline-outline",
    title: "平台綁定載入失敗",
    description: "資料同步發生問題，請重新整理後再試一次。",
    action: "重新整理",
  },
  permission_denied: {
    icon: "lock-closed-outline",
    title: "沒有檢視權限",
    description: "此帳號無權檢視平台綁定，請聯絡派車台確認權限。",
  },
  external_unavailable: {
    icon: "warning-outline",
    title: "平台服務暫時無法使用",
    description: "外部平台連線中斷，狀態恢復後會自動更新。",
    action: "重新整理",
  },
  driver_not_eligible: {
    icon: "person-remove-outline",
    title: "目前不具接單資格",
    description: "所有平台均顯示不符接單資格，請確認證件與班次狀態。",
  },
};

const RELAY_REASON_LABELS: Record<string, string> = {
  reauth_required: "需重新授權",
  gocab_no_reject: "此平台不支援拒單",
  not_supported: "平台不支援轉送",
};

function relayReasonLabel(code: string): string {
  return RELAY_REASON_LABELS[code] ?? code;
}

interface PlatformBindingProps {
  theme?: DriverCanvasTheme;
  views: PlatformBindingView[];
  emptyReason: EmptyReason | null;
  notes?: string[];
  loading?: boolean;
  busyPlatform?: string | null;
  selfServiceAvailable?: boolean;
  onReauth: (view: PlatformBindingView) => void;
  onUnbind: (view: PlatformBindingView) => void;
  onBind: () => void;
  onRefresh: () => void;
}

function findAction(
  actions: PlatformBindingAction[],
  kind: PlatformBindingAction["kind"],
): PlatformBindingAction | undefined {
  return actions.find((action) => action.kind === kind);
}

function BindingRow({
  view,
  busy,
  onReauth,
  onUnbind,
}: {
  view: PlatformBindingView;
  busy: boolean;
  onReauth: () => void;
  onUnbind: () => void;
}) {
  const mechanism = REAUTH_MECHANISMS[view.reauthMechanism];
  const codeColor = view.owned ? THEME.accentHi : THEME.warn;
  const codeBg = view.owned ? THEME.accentBg : THEME.warnBg;
  const reauthAction = findAction(view.actions, "reauth");
  const unbindAction = findAction(view.actions, "unbind");

  return (
    <View style={[styles.row, { borderTopColor: THEME.border }]}>
      <View style={styles.rowHead}>
        <View style={[styles.mark, { backgroundColor: codeBg }]}>
          <Text
            style={[
              styles.markText,
              { color: codeColor, fontFamily: THEME.monoFamily },
            ]}
          >
            {String(view.platformCode).slice(0, 3).toUpperCase()}
          </Text>
        </View>

        <View style={styles.rowMain}>
          <View style={styles.rowNameLine}>
            <Text
              style={[styles.rowName, { color: THEME.text }]}
              numberOfLines={1}
            >
              {view.displayName}
            </Text>
            <Text
              style={[
                styles.rowCode,
                { color: THEME.textDim, fontFamily: THEME.monoFamily },
              ]}
            >
              {view.platformCode}
            </Text>
          </View>
          <Text
            style={[
              styles.rowStatus,
              { color: view.reauthRequired ? THEME.warn : THEME.textMuted },
            ]}
          >
            {view.reauthRequired ? "需重新授權 · reauth_required" : "已綁定 · linked"}
          </Text>
        </View>

        {view.reauthRequired ? (
          <Pill theme={THEME} tone="warn">
            待處理
          </Pill>
        ) : (
          <Pill theme={THEME} tone="success" dot>
            已連線
          </Pill>
        )}
      </View>

      {/* Q-DRV05 mechanism + Q-DRV06 self-service binding */}
      <View style={[styles.metaStrip, { backgroundColor: THEME.surfaceLo }]}>
        <Ionicons name={mechanism.icon} size={12} color={THEME.textMuted} />
        <Text style={[styles.metaText, { color: THEME.textMuted }]}>
          {mechanism.zh}
        </Text>
        <Text
          style={[
            styles.metaCode,
            { color: THEME.textDim, fontFamily: THEME.monoFamily },
          ]}
        >
          · {mechanism.en}
        </Text>
        <View style={styles.metaSpacer} />
        {view.owned ? (
          <Text style={[styles.metaFlag, { color: THEME.textDim }]}>
            n/a · 自營
          </Text>
        ) : view.selfServiceBinding ? (
          <Text style={[styles.metaFlag, { color: THEME.success }]}>
            可自助綁定
          </Text>
        ) : (
          <Text style={[styles.metaFlag, { color: THEME.warn }]}>
            需派車台處理
          </Text>
        )}
      </View>

      {/* Q-DRV01 relay capability */}
      {view.canRelayAccept !== null || view.canRelayReject !== null ? (
        <View style={styles.relayRow}>
          <Pill
            theme={THEME}
            tone={view.canRelayAccept ? "success" : "neutral"}
            dot
          >
            轉送接單
          </Pill>
          <Pill
            theme={THEME}
            tone={view.canRelayReject ? "success" : "neutral"}
            dot
          >
            轉送拒單
          </Pill>
          {view.relayUnavailableReasonCode ? (
            <Pill theme={THEME} tone="warn">
              {relayReasonLabel(view.relayUnavailableReasonCode)}
            </Pill>
          ) : null}
        </View>
      ) : null}

      {/* Q-DRV07 eligibility reasons */}
      {view.eligibility === "ineligible" && view.ineligibleReasons.length > 0 ? (
        <Text style={[styles.ineligible, { color: THEME.warn }]}>
          {`不符資格：${view.ineligibleReasons.join("、")}`}
        </Text>
      ) : null}

      {/* CTAs driven by availableActions (Q-X13) */}
      {reauthAction || unbindAction ? (
        <View style={styles.rowActions}>
          {reauthAction ? (
            <Btn
              theme={THEME}
              variant="primary"
              size="sm"
              disabled={busy || !reauthAction.enabled}
              onPress={onReauth}
              icon={
                <Ionicons name={mechanism.icon} size={13} color="#FFFFFF" />
              }
              style={
                reauthAction.enabled
                  ? { backgroundColor: THEME.warn, borderColor: THEME.warn }
                  : undefined
              }
            >
              {reauthAction.enabled
                ? mechanism.cta
                : reauthAction.disabledReasonCode === "ops_managed"
                  ? "由派車台處理"
                  : "暫無法重新驗證"}
            </Btn>
          ) : null}
          {unbindAction ? (
            <Btn
              theme={THEME}
              variant="secondary"
              size="sm"
              danger
              disabled={busy || !unbindAction.enabled}
              onPress={onUnbind}
              icon={<Ionicons name="unlink-outline" size={13} color="#FFFFFF" />}
            >
              解除綁定
            </Btn>
          ) : null}
          {busy ? (
            <ActivityIndicator size="small" color={THEME.accent} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function PlatformBinding({
  theme = THEME,
  views,
  emptyReason,
  notes = [],
  loading = false,
  busyPlatform = null,
  selfServiceAvailable = true,
  onReauth,
  onUnbind,
  onBind,
  onRefresh,
}: PlatformBindingProps) {
  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={theme.accent} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>
          載入平台綁定中…
        </Text>
      </View>
    );
  }

  if (emptyReason) {
    const reasonKey =
      emptyReason === "filtered_empty" ? "no_data" : emptyReason;
    const descriptor = EMPTY_STATES[reasonKey];
    const handleAction =
      reasonKey === "not_provisioned"
        ? onBind
        : reasonKey === "fetch_failed" || reasonKey === "external_unavailable"
          ? onRefresh
          : undefined;

    return (
      <View style={styles.emptyState}>
        <Ionicons
          name={descriptor.icon}
          size={40}
          color={theme.borderStrong}
        />
        <Text style={[styles.emptyTitle, { color: theme.text }]}>
          {descriptor.title}
        </Text>
        <Text style={[styles.emptyDescription, { color: theme.textMuted }]}>
          {descriptor.description}
        </Text>
        <Text
          style={[
            styles.emptyReasonCode,
            { color: theme.textDim, fontFamily: theme.monoFamily },
          ]}
        >
          {`reason: ${emptyReason}`}
        </Text>
        {descriptor.action && handleAction ? (
          <Btn
            theme={theme}
            variant="secondary"
            size="sm"
            onPress={handleAction}
            style={styles.emptyAction}
          >
            {descriptor.action}
          </Btn>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.card, { borderColor: theme.border }]}>
        {views.map((view) => (
          <BindingRow
            key={view.platformCode}
            view={view}
            busy={busyPlatform === view.platformCode}
            onReauth={() => onReauth(view)}
            onUnbind={() => onUnbind(view)}
          />
        ))}
      </View>

      {notes.length > 0 ? (
        <Banner
          theme={theme}
          tone="info"
          icon={<Ionicons name="sync-outline" size={14} color={theme.info} />}
          body={notes.join("\n")}
        />
      ) : null}

      {selfServiceAvailable ? (
        <Btn
          theme={theme}
          variant="secondary"
          size="md"
          onPress={onBind}
          icon={
            <Ionicons name="add-circle-outline" size={15} color={theme.text} />
          }
          style={styles.bindButton}
        >
          新增平台綁定
        </Btn>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  loadingText: {
    fontSize: 13,
  },
  card: {
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
  },
  row: {
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  markText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowNameLine: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  rowName: {
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: "700",
  },
  rowCode: {
    fontSize: 10.5,
  },
  rowStatus: {
    fontSize: 11,
    lineHeight: 15,
  },
  metaStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  metaText: {
    fontSize: 10.5,
  },
  metaCode: {
    fontSize: 10,
    opacity: 0.7,
  },
  metaSpacer: {
    flex: 1,
  },
  metaFlag: {
    fontSize: 10,
    fontWeight: "600",
  },
  relayRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  ineligible: {
    fontSize: 11,
    lineHeight: 15,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 28,
    paddingHorizontal: 16,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 6,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  emptyReasonCode: {
    fontSize: 10,
    marginTop: 2,
  },
  emptyAction: {
    marginTop: 10,
  },
  bindButton: {
    marginTop: 12,
  },
});
