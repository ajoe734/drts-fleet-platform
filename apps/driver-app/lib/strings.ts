import type { DriverTaskAction } from "@drts/contracts";
import type { TripPrimaryActionKey } from "@/lib/trip-workflow";

export const driverTabLabels = {
  workspace: "工作台",
  jobs: "任務",
  trip: "行程",
  platform: "平台",
  settings: "設定",
} as const;

export const driverRouteTitles = {
  onboarding: "裝置啟用",
  jobs: "任務收件匣",
  trip: "行程作業台",
  sos: "安全求援",
  earnings: "收益儀表板",
  platformPresence: "平台上線狀態",
  shift: "班次與出勤",
  settings: "設定",
} as const;

export const driverTaskActionLabels: Record<DriverTaskAction, string> = {
  accept: "接受任務",
  reject: "婉拒任務",
  depart: "前往接送點",
  arrived_pickup: "回報已抵達",
  start: "開始行程",
  complete: "完成行程",
};

export const driverTripActionSuccessLabels: Record<
  TripPrimaryActionKey,
  string
> = {
  accept: "接受任務",
  depart: "前往接送點",
  arrived: "抵達上車點",
  start: "開始行程",
  complete: "完成行程",
};

export const driverForwardedTaskStatusLabels = {
  offered: "可接單",
  broadcasted: "廣播中",
  accept_pending: "等待平台確認",
  confirmed: "平台已確認",
  confirmed_by_platform: "平台已確認",
  lost_race: "其他司機已接",
  taken: "其他司機已接",
  cancelled: "平台取消",
  cancelled_by_platform: "平台取消",
  sync_failed: "同步異常",
} as const;

export const driverJobFilterOptions = [
  { label: "全部", value: "all" },
  { label: "待處理", value: "needs_action" },
  { label: "進行中", value: "in_progress" },
  { label: "平台結案", value: "platform_closed" },
  { label: "需同步", value: "sync_issue" },
] as const;

export const driverEarningsPeriodOptions = [
  { label: "今日", value: "today" },
  { label: "本週", value: "week" },
  { label: "本月", value: "month" },
] as const;

export const driverIncidentSituations = [
  {
    id: "passenger_conflict",
    label: "乘客衝突",
    hint: "與乘客發生爭執、辱罵或肢體衝突",
  },
  {
    id: "traffic_collision",
    label: "交通事故",
    hint: "碰撞、擦撞或其他行車事故",
  },
  {
    id: "vehicle_breakdown",
    label: "車輛故障",
    hint: "拋錨、故障或無法繼續行駛",
  },
  {
    id: "medical_emergency",
    label: "醫療緊急",
    hint: "乘客或駕駛身體不適、需要救護",
  },
  {
    id: "route_threat",
    label: "路線威脅",
    hint: "遭到跟車、恐嚇或路線上有危險",
  },
  { id: "other", label: "其他", hint: "上述以外，仍需要車隊立即協助" },
] as const;

export const driverActivationSteps = [
  {
    title: "裝置註冊",
    description: "產生車隊識別碼",
    state: "active",
  },
  {
    title: "駕駛身份驗證",
    description: "綁定駕駛帳號",
    state: "pending",
  },
  {
    title: "平台帳號連線",
    description: "外部平台待綁定",
    state: "pending",
  },
] as const;

export const driverSaveStatusLabels = {
  saving: { label: "儲存中…", variant: "info" },
  dirty: { label: "尚有未儲存變更", variant: "warning" },
  saved: { label: "已儲存", variant: "success" },
  error: { label: "儲存失敗", variant: "danger" },
  idle: { label: "尚未變更", variant: "default" },
} as const;

export const driverStrings = {
  common: {
    refresh: "重新整理",
    retry: "重新整理",
    all: "全部",
    notUpdatedYet: "尚無更新",
    requestFailed: "要求失敗",
    loading: "載入中…",
  },
  onboarding: {
    heroEyebrow: "下一步動作",
    title: "裝置啟用",
    description: "連線車隊管理系統，啟用後此裝置可接收派單與平台訂單。",
    registrationCodeLabel: "註冊代碼",
    registrationCodePlaceholder: "請輸入註冊代碼",
    deviceNameLabel: "裝置名稱",
    registerDevice: "註冊此裝置",
    registerDeviceLoading: "配置中…",
    provisioningWarning:
      "未啟用裝置無法接收派單。請使用車隊發放的代碼，避免使用個人帳號註冊。",
    workspaceGreetingEyebrow: "早安，司機",
    workspaceGreetingTitle: "工作台",
    platformSectionEyebrow: "平台連線",
    platformSectionTitle: "平台就緒狀態",
    quickLinksEyebrow: "快速入口",
    quickLinksTitle: "工作捷徑",
    quickLinkLabels: {
      jobs: "任務",
      trip: "行程",
      platform: "平台",
      shift: "班次",
      earnings: "收入",
      settings: "設定",
    },
    quickLinkHelpers: {
      trip: "目前行程",
      platform: "平台健康中心",
      shift: "班次與出勤",
      earnings: "今日收益",
      settings: "帳號與綁定",
    },
    footerActions: {
      sos: "安全求援",
      refresh: "重新整理",
    },
    kpis: {
      pending: "待處理",
      shift: "班次",
      online: "已上線",
    },
    seeAll: "全部",
  },
  jobs: {
    title: "任務",
    subtitle: "同步收件匣",
    heroTitle: "任務",
    routeLocked: "路線鎖定",
    fixedFare: "固定車資",
    nextStep: "下一步",
    openTripWorkspace: "開啟行程作業",
    openCurrentTrip: "開啟目前行程",
    kpis: {
      total: "總計",
      needsAction: "需動作",
      external: "外部平台",
    },
    actionStateLabels: {
      action_required: "待司機處理",
      awaiting_platform: "等待平台回覆",
      in_progress: "進行中",
      blocked: "需派車台處理",
      completed: "已完成",
      read_only: "僅供查閱",
    },
  },
  trip: {
    title: "行程作業台",
    subtitle: "同步目前指派的行程與狀態",
    routeLocked: "路線鎖定",
    sections: {
      availableActions: "目前可執行的操作",
      statusMetrics: "行程狀態與度量",
      compliance: "合規檢查",
      completionProof: "完單佐證",
    },
  },
  platformPresence: {
    title: "平台連線",
    subtitle: "檢查可接單平台狀態",
    managedByDrts: "自營派單",
    external: "外部",
    owned: "自營",
    kpis: {
      available: "可接單",
      online: "上線中",
      attention: "需動作",
    },
    notesTitle: "同步說明",
    sectionTitle: "逐平台狀態",
    bindAction: "管理綁定",
  },
  earnings: {
    title: "收入",
    loadingSubtitle: "載入收益資料中",
    periodEyebrow: "結算期間",
    metrics: {
      gross: "毛收",
      serviceFee: "平台抽成",
      external: "外部平台",
      pendingPayout: "待撥款",
    },
    sections: {
      drtsRecon: "DRTS 對帳與撥款",
      financeAuthority: "外部平台結算方",
      platformBreakdown: "平台分項",
      monthlyStatements: "月結報表",
    },
  },
  shift: {
    title: "班次",
    summaryTitle: "今日總結",
    readinessTitle: "班次準備",
    statusLabel: "班次狀態",
    punchIn: "上線打卡",
    punchOut: "下線打卡",
  },
  settings: {
    title: "設定",
    sections: {
      identity: "司機身份",
      emergency: "緊急聯絡人",
      preferences: "偏好設定",
      bindings: "平台帳號綁定",
      misc: "其他",
    },
    utilityLabels: {
      emergencyContact: "緊急聯絡人",
      aboutDevice: "關於本機",
      viewEarnings: "查看收益",
      logout: "登出",
    },
  },
  components: {
    routeDisplay: {
      eyebrow: "行程路線",
      title: "路線資訊",
      locked: "路線鎖定",
      pickup: "上車點",
      dropoff: "下車點",
      waypoint: "途經點",
      noRouteData: "目前沒有可顯示的路線資料。",
      editRoute: "編輯路線",
    },
    platformTaskBadge: {
      ownedTitle: "自營派單 · DRTS",
      ownedAuthority: "可直接操作",
      forwardedTitlePrefix: "平台主導 · ",
      forwardedAuthority: "來源平台規則生效",
    },
    earningsByPlatform: {
      emptyTitle: "這段期間還沒有平台收益",
      emptyDescription: "切換到其他期間，或稍後再查看最新對帳彙整。",
      gross: "毛收",
      serviceFee: "抽成",
      subsidy: "補助",
    },
  },
} as const;

export const driverAuthStrings = {
  states: {
    not_provisioned: {
      title: "裝置未啟用",
      badge: "尚未啟用",
      description: "連線車隊管理系統，啟用後此裝置可接收派單與平台訂單。",
      action: "註冊此裝置",
    },
    session_expired: {
      title: "裝置憑證已過期",
      badge: "憑證已失效",
      description: "此裝置的司機連線授權已過期，請重新輸入註冊代碼進行重新綁定。",
      action: "重新綁定裝置",
    },
    device_revoked: {
      title: "裝置綁定已撤銷",
      badge: "綁定已撤銷",
      description: "此裝置的司機綁定已遭遠端撤銷或偵測到憑證重複使用。未同步的離線完單佐證已妥善保存，請重新註冊綁定。",
      action: "重新註冊裝置",
    },
    driver_suspended: {
      title: "司機帳號已被停權",
      badge: "帳號已停權",
      description: "此司機帳號目前處於停權或證件審查無效狀態，暫時無法接單與使用工作台。請聯絡平台管理員。",
      action: "聯絡車隊管理員",
    },
  },
} as const;
