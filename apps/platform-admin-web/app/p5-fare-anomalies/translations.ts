import type { FareQuoteAnomaly } from "@drts/contracts";

export type FareAnomalyLocale = "en" | "zh";

interface FareAnomalyCopy {
  reasons: Record<FareQuoteAnomaly, { title: string; guidance: string }>;
  common: {
    authorityLoading: string;
    readFailed: string;
    reload: string;
    recoveryPending: string;
    retryQuote: string;
    noServerRecoveryAction: string;
    auditReceipt: (auditId: string, status: string) => string;
  };
  queue: {
    title: string;
    subtitle: string;
    pendingCount: (count: number) => string;
    failClosedTitle: string;
    failClosedBody: string;
    permissionDeniedTitle: string;
    permissionDeniedBody: string;
    loadingTitle: string;
    errorTitle: string;
    emptyTitle: string;
    emptyBody: string;
    reasonLabel: string;
    allReasons: string;
    farePolicyVersion: (version: string) => string;
    retryAuthority: string;
  };
  detail: {
    fallbackTitle: string;
    title: (orderId: string, reasonTitle: string) => string;
    subtitle: string;
    backToQueue: string;
    permissionDeniedTitle: string;
    permissionDeniedBody: string;
    loadingTitle: string;
    errorTitle: string;
    snapshotCardTitle: string;
    orderLabel: string;
    quoteSnapshotLabel: string;
    routeLabel: string;
    chargingModeLabel: string;
    estimatedFareLabel: string;
    payableFareLabel: string;
    farePolicyVersionLabel: string;
    passengerConfirmationLabel: string;
    passengerUnconfirmed: string;
    recoveryCardTitle: string;
    recoveryCardSubtitle: string;
    lastRequestedAt: (timestamp: string) => string;
    noManualControls: string;
  };
  confirmation: {
    ariaLabel: string;
    prompt: string;
    cancel: string;
    submitting: string;
    confirm: string;
  };
  fareUnavailable: string;
}

export const FARE_ANOMALY_TRANSLATIONS: Record<
  FareAnomalyLocale,
  FareAnomalyCopy
> = {
  zh: {
    reasons: {
      quote_provider_unavailable: {
        title: "暫時無法取得預估車資",
        guidance: "等待報價服務恢復後，依伺服器提供的動作重新取得報價。",
      },
      quote_out_of_range: {
        title: "預估車資超出可接受範圍",
        guidance: "需由費率政策流程確認，不可人工輸入替代金額。",
      },
      route_unresolved: {
        title: "尚無法確認預估路線",
        guidance: "先完成路線解析，再依伺服器提供的動作重新取得報價。",
      },
      fare_policy_missing: {
        title: "目前沒有可用的生效費率",
        guidance: "需先完成費率生效流程，不可套用草稿或人工金額。",
      },
      calculation_mismatch: {
        title: "車資計算結果需要重新確認",
        guidance: "重新計算只能由正式報價服務執行，不可直接修改結果。",
      },
    },
    common: {
      authorityLoading: "正在讀取伺服器權威資料。",
      readFailed: "讀取失敗",
      reload: "重新讀取",
      recoveryPending: "重新報價處理中",
      retryQuote: "重新取得報價",
      noServerRecoveryAction: "無伺服器回復動作",
      auditReceipt: (auditId, status) => `稽核 ${auditId} · ${status}`,
    },
    queue: {
      title: "費率異常 · Fare Anomalies",
      subtitle: "P5-COM-UI-01 · 正式報價完成前不確認訂單 · 不提供人工金額欄位",
      pendingCount: (count) => `${count} 筆待處理`,
      failClosedTitle: "Fail closed",
      failClosedBody:
        "異常報價不可自動確認固定車資；所有回復動作只依後端 availableActions 顯示。",
      permissionDeniedTitle: "無權檢視費率異常",
      permissionDeniedBody:
        "需要 foundation:read。頁面不會在前端推算或顯示替代資料。",
      loadingTitle: "載入費率異常",
      errorTitle: "費率異常資料無法使用",
      emptyTitle: "目前沒有待處理異常",
      emptyBody: "伺服器目前未回傳未解決的報價異常。",
      reasonLabel: "異常原因",
      allReasons: "全部",
      farePolicyVersion: (version) => `費率版本 ${version}`,
      retryAuthority: "可否重試由後端回傳",
    },
    detail: {
      fallbackTitle: "費率異常明細",
      title: (orderId, reasonTitle) => `${orderId} · ${reasonTitle}`,
      subtitle: "P5-COM-UI-01 · Fare Anomaly Detail",
      backToQueue: "返回異常清單",
      permissionDeniedTitle: "無權檢視費率異常",
      permissionDeniedBody: "需要 foundation:read。",
      loadingTitle: "載入異常明細",
      errorTitle: "異常明細無法使用",
      snapshotCardTitle: "路線與報價快照",
      orderLabel: "訂單",
      quoteSnapshotLabel: "Quote Snapshot",
      routeLabel: "路線",
      chargingModeLabel: "計費模式",
      estimatedFareLabel: "預估車資",
      payableFareLabel: "應付車資",
      farePolicyVersionLabel: "費率版本",
      passengerConfirmationLabel: "乘客確認",
      passengerUnconfirmed: "未確認 · anomaly fail-closed",
      recoveryCardTitle: "伺服器回復權威",
      recoveryCardSubtitle: "availableActions",
      lastRequestedAt: (timestamp) => `最近要求：${timestamp}`,
      noManualControls:
        "此畫面沒有人工金額覆寫、套用草稿費率或直接確認訂單的控制。",
    },
    confirmation: {
      ariaLabel: "確認重新取得報價",
      prompt: "確認向正式報價服務重新取得報價？此操作不會接受人工車資。",
      cancel: "取消",
      submitting: "送出中",
      confirm: "確認重新報價",
    },
    fareUnavailable: "未取得",
  },
  en: {
    reasons: {
      quote_provider_unavailable: {
        title: "Estimated fare temporarily unavailable",
        guidance:
          "Wait for the quote service to recover, then use an action provided by the server to request a new quote.",
      },
      quote_out_of_range: {
        title: "Estimated fare is outside the accepted range",
        guidance:
          "Resolve this through the fare-policy workflow. Do not enter a replacement amount manually.",
      },
      route_unresolved: {
        title: "Estimated route is unresolved",
        guidance:
          "Resolve the route first, then use an action provided by the server to request a new quote.",
      },
      fare_policy_missing: {
        title: "No active fare policy is available",
        guidance:
          "Complete the fare activation workflow first. Do not use a draft policy or manual amount.",
      },
      calculation_mismatch: {
        title: "Fare calculation requires confirmation",
        guidance:
          "Only the production quote service may recalculate the fare. Do not edit the result directly.",
      },
    },
    common: {
      authorityLoading: "Loading authoritative server data.",
      readFailed: "Unable to read data",
      reload: "Reload",
      recoveryPending: "Quote retry in progress",
      retryQuote: "Request new quote",
      noServerRecoveryAction: "No server recovery action",
      auditReceipt: (auditId, status) => `Audit ${auditId} · ${status}`,
    },
    queue: {
      title: "Fare Anomalies",
      subtitle:
        "P5-COM-UI-01 · Orders remain unconfirmed until an authoritative quote succeeds · No manual fare input",
      pendingCount: (count) => `${count} pending`,
      failClosedTitle: "Fail closed",
      failClosedBody:
        "An anomalous quote cannot confirm a fixed fare. Recovery controls come only from server availableActions.",
      permissionDeniedTitle: "Fare anomalies unavailable",
      permissionDeniedBody:
        "foundation:read is required. The browser will not calculate or display substitute data.",
      loadingTitle: "Loading fare anomalies",
      errorTitle: "Fare anomaly data unavailable",
      emptyTitle: "No pending anomalies",
      emptyBody: "The server returned no unresolved quote anomalies.",
      reasonLabel: "Anomaly reason",
      allReasons: "All",
      farePolicyVersion: (version) => `Fare policy version ${version}`,
      retryAuthority: "Retry authority is provided by the server",
    },
    detail: {
      fallbackTitle: "Fare anomaly detail",
      title: (orderId, reasonTitle) => `${orderId} · ${reasonTitle}`,
      subtitle: "P5-COM-UI-01 · Fare Anomaly Detail",
      backToQueue: "Back to anomaly queue",
      permissionDeniedTitle: "Fare anomalies unavailable",
      permissionDeniedBody: "foundation:read is required.",
      loadingTitle: "Loading anomaly detail",
      errorTitle: "Anomaly detail unavailable",
      snapshotCardTitle: "Route and quote snapshot",
      orderLabel: "Order",
      quoteSnapshotLabel: "Quote Snapshot",
      routeLabel: "Route",
      chargingModeLabel: "Charging mode",
      estimatedFareLabel: "Estimated fare",
      payableFareLabel: "Payable fare",
      farePolicyVersionLabel: "Fare policy version",
      passengerConfirmationLabel: "Passenger confirmation",
      passengerUnconfirmed: "Unconfirmed · anomaly fail-closed",
      recoveryCardTitle: "Server recovery authority",
      recoveryCardSubtitle: "availableActions",
      lastRequestedAt: (timestamp) => `Last requested: ${timestamp}`,
      noManualControls:
        "This screen has no manual fare override, draft-policy application, or direct order-confirmation control.",
    },
    confirmation: {
      ariaLabel: "Confirm quote retry",
      prompt:
        "Request a new quote from the production quote service? This action does not accept a manual fare.",
      cancel: "Cancel",
      submitting: "Submitting",
      confirm: "Confirm quote retry",
    },
    fareUnavailable: "Unavailable",
  },
};

export function getFareAnomalyCopy(locale: FareAnomalyLocale) {
  return FARE_ANOMALY_TRANSLATIONS[locale];
}

export function formatFareMinor(
  value: number | null,
  locale: FareAnomalyLocale,
) {
  if (value === null) return getFareAnomalyCopy(locale).fareUnavailable;
  return `NT$ ${new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en").format(
    value / 100,
  )}`;
}
