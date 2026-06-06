import type {
  DriverStatementRecord,
  MoneyAmount,
  OwnedOrderRecord,
  PlatformEarningsByPlatformResponse,
  UnifiedDriverTaskView,
} from "@drts/contracts";

import {
  formatDriverTaskTypeLabel,
  type DriverLocale,
} from "@/lib/operational-labels";

type LocalizedText = {
  zh: string;
  en: string;
};

type ServiceAwareTaskView = UnifiedDriverTaskView & {
  serviceProduct?: string | null;
  sourceType?: "owned" | "forwarded" | "partner" | null;
  tenantName?: string | null;
  tenantServiceProgramName?: string | null;
  reservationTime?: string | null;
  routeAuthority?: "internal" | "external" | "partner" | null;
  fixedPrice?: boolean | null;
  proofRequired?: boolean | null;
  vehicleEligibilitySummary?: string | null;
  fleetPartnerAttribution?: {
    fleetPartnerId?: string | null;
    fleetPartnerName?: string | null;
    attributionLabel?: string | null;
  } | null;
};

export type TaskCardDetailItem = {
  key: string;
  label: string;
  value: string;
};

export type EarningsGroupBy =
  | "platform"
  | "service_product"
  | "tenant"
  | "fleet"
  | "total";

export type EarningsGroupedItem = {
  key: string;
  label: string;
  detail: string;
  grossEarning: MoneyAmount;
  serviceFee: MoneyAmount;
  subsidy: MoneyAmount;
  netAmount: MoneyAmount;
  tripCount: number;
};

type StatementOrderMeta = {
  orderId: string;
  tenantId: string | null;
  partnerId: string | null;
  partnerProgramId: string | null;
  serviceLabel: string;
  tenantLabel: string;
  fleetLabel: string;
};

const EMPTY_EN = "Unspecified";
const EMPTY_ZH = "未指定";

function t(copy: LocalizedText, locale: DriverLocale = "zh"): string {
  return copy[locale];
}

function formatBilingual(copy: LocalizedText) {
  return `${copy.zh} / ${copy.en}`;
}

function fromCode(value: string | null | undefined, fallback: LocalizedText) {
  if (!value?.trim()) {
    return formatBilingual(fallback);
  }

  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function makeMoney(amountMinor: number, currency: string): MoneyAmount {
  return {
    amountMinor,
    currency,
  };
}

function sumAmounts(values: MoneyAmount[], currency: string): MoneyAmount {
  return makeMoney(
    values.reduce((sum, value) => sum + value.amountMinor, 0),
    currency,
  );
}

function resolveTaskServiceLabel(
  task: ServiceAwareTaskView,
  order: OwnedOrderRecord | null,
) {
  if (task.serviceProduct?.trim()) {
    return fromCode(task.serviceProduct, {
      zh: EMPTY_ZH,
      en: EMPTY_EN,
    });
  }

  return formatDriverTaskTypeLabel(
    {
      serviceBucket: order?.serviceBucket ?? null,
      businessDispatchSubtype: order?.businessDispatchSubtype ?? null,
      dispatchSemantics: order?.dispatchSemantics ?? null,
    },
    "zh",
  );
}

function resolveTaskSourceLabel(task: ServiceAwareTaskView) {
  switch (task.sourceType) {
    case "partner":
      return "合作車隊 / Fleet Partner";
    case "forwarded":
      return "來源平台 / Forwarded";
    case "owned":
      return "自營派單 / Owned";
    default:
      return task.sourcePlatform === "drts"
        ? "自營派單 / Owned"
        : "來源平台 / Forwarded";
  }
}

function resolveTaskTenantLabel(
  task: ServiceAwareTaskView,
  order: OwnedOrderRecord | null,
) {
  if (task.tenantName?.trim()) {
    return task.tenantName.trim();
  }

  if (order?.tenantId?.trim()) {
    return `Tenant ${order.tenantId}`;
  }

  return `${EMPTY_ZH} / ${EMPTY_EN}`;
}

function resolveTaskProgramLabel(
  task: ServiceAwareTaskView,
  order: OwnedOrderRecord | null,
) {
  if (task.tenantServiceProgramName?.trim()) {
    return task.tenantServiceProgramName.trim();
  }

  if (order?.partnerProgramId?.trim()) {
    return `Program ${order.partnerProgramId}`;
  }

  return `${EMPTY_ZH} / ${EMPTY_EN}`;
}

function resolveVehicleEligibilityLabel(
  task: ServiceAwareTaskView,
  order: OwnedOrderRecord | null,
) {
  if (task.vehicleEligibilitySummary?.trim()) {
    return task.vehicleEligibilitySummary.trim();
  }

  if (order?.vehiclePreference?.trim()) {
    return `${order.vehiclePreference.trim()} / Vehicle Preference`;
  }

  return "依服務與車格派發 / Matched by service eligibility";
}

function resolveFleetLabel(
  task: ServiceAwareTaskView,
  order: OwnedOrderRecord | null,
) {
  const attribution = task.fleetPartnerAttribution;
  if (attribution?.fleetPartnerName?.trim()) {
    return attribution.fleetPartnerName.trim();
  }
  if (attribution?.attributionLabel?.trim()) {
    return attribution.attributionLabel.trim();
  }
  if (order?.partnerId?.trim()) {
    return `Fleet ${order.partnerId}`;
  }
  return "DRTS 直營 / Direct";
}

function resolveAuthorityLabel(task: ServiceAwareTaskView) {
  const routeAuthority =
    task.routeAuthority ?? (task.routeLocked ? "external" : "internal");
  const fareAuthority =
    task.fareAuthority === "external_platform"
      ? "external"
      : task.fareAuthority === "drts"
        ? "internal"
        : "partner";

  const routeCopy =
    routeAuthority === "external"
      ? "路線外部主控 / External Route"
      : routeAuthority === "partner"
        ? "合作夥伴路線 / Partner Route"
        : "DRTS 路線主控 / Internal Route";

  const fareCopy =
    fareAuthority === "external"
      ? "平台車資 / External Fare"
      : fareAuthority === "partner"
        ? "合作方案車資 / Partner Fare"
        : "DRTS 車資 / Internal Fare";

  return `${routeCopy} · ${fareCopy}`;
}

function resolveProofRequired(
  task: ServiceAwareTaskView,
  order: OwnedOrderRecord | null,
) {
  if (typeof task.proofRequired === "boolean") {
    return task.proofRequired;
  }

  return Boolean(
    order?.proofRequirements.signoffRequired ||
    order?.proofRequirements.expenseProofRequired ||
    (order?.proofRequirements.minPhotoCount ?? 0) > 0,
  );
}

export function buildTaskCardDetailItems(
  task: UnifiedDriverTaskView,
  order: OwnedOrderRecord | null,
): TaskCardDetailItem[] {
  const nextTask = task as ServiceAwareTaskView;
  const reservationTime =
    nextTask.reservationTime ?? order?.reservationWindowStart ?? null;

  const items: TaskCardDetailItem[] = [
    {
      key: "service",
      label: "服務 / Service",
      value: resolveTaskServiceLabel(nextTask, order),
    },
    {
      key: "source",
      label: "來源 / Source",
      value: resolveTaskSourceLabel(nextTask),
    },
    {
      key: "tenant",
      label: "租戶 / Tenant",
      value: resolveTaskTenantLabel(nextTask, order),
    },
    {
      key: "program",
      label: "方案 / Program",
      value: resolveTaskProgramLabel(nextTask, order),
    },
    {
      key: "vehicle",
      label: "車格 / Eligibility",
      value: resolveVehicleEligibilityLabel(nextTask, order),
    },
    {
      key: "authority",
      label: "權限 / Authority",
      value: resolveAuthorityLabel(nextTask),
    },
    {
      key: "fleet",
      label: "車隊 / Fleet",
      value: resolveFleetLabel(nextTask, order),
    },
  ];

  if (reservationTime) {
    items.splice(4, 0, {
      key: "reservation",
      label: "預約 / Reservation",
      value: reservationTime,
    });
  }

  if (resolveProofRequired(nextTask, order)) {
    items.push({
      key: "proof",
      label: "佐證 / Proof",
      value: "需要完單佐證 / Proof required",
    });
  }

  return items;
}

function makeStatementOrderMeta(
  line: DriverStatementRecord["lines"][number],
  order: OwnedOrderRecord | undefined,
): StatementOrderMeta {
  if (!order) {
    switch (line.channelKey) {
      case "forwarded_shadow":
        return {
          orderId: line.orderId,
          tenantId: "external_platform",
          partnerId: "external_platform",
          partnerProgramId: null,
          serviceLabel: formatBilingual({
            zh: "外部平台轉派",
            en: "Forwarded Platform",
          }),
          tenantLabel: formatBilingual({
            zh: "外部平台",
            en: "External Platform",
          }),
          fleetLabel: formatBilingual({
            zh: "外部平台",
            en: "External Platform",
          }),
        };
      case "partner_airport":
        return {
          orderId: line.orderId,
          tenantId: "partner_program",
          partnerId: "partner_channel",
          partnerProgramId: null,
          serviceLabel: formatBilingual({
            zh: "合作車隊服務",
            en: "Partner Fleet Service",
          }),
          tenantLabel: formatBilingual({
            zh: "合作方案",
            en: "Partner Program",
          }),
          fleetLabel: formatBilingual({
            zh: "合作車隊",
            en: "Partner Fleet",
          }),
        };
      case "phone_dispatch":
        return {
          orderId: line.orderId,
          tenantId: "phone_dispatch",
          partnerId: null,
          partnerProgramId: null,
          serviceLabel: formatBilingual({
            zh: "電話派遣",
            en: "Phone Dispatch",
          }),
          tenantLabel: formatBilingual({
            zh: "電話派遣",
            en: "Phone Dispatch",
          }),
          fleetLabel: "DRTS 直營",
        };
      default:
        return {
          orderId: line.orderId,
          tenantId: "tenant_enterprise",
          partnerId: null,
          partnerProgramId: null,
          serviceLabel: formatBilingual({
            zh: "企業派遣",
            en: "Enterprise Dispatch",
          }),
          tenantLabel: formatBilingual({
            zh: "租戶方案",
            en: "Tenant Program",
          }),
          fleetLabel: "DRTS 直營",
        };
    }
  }

  return {
    orderId: line.orderId,
    tenantId: order?.tenantId ?? null,
    partnerId: order?.partnerId ?? null,
    partnerProgramId: order?.partnerProgramId ?? null,
    serviceLabel: order
      ? formatDriverTaskTypeLabel(
          {
            serviceBucket: order.serviceBucket,
            businessDispatchSubtype: order.businessDispatchSubtype,
            dispatchSemantics: order.dispatchSemantics,
          },
          "zh",
        )
      : `${EMPTY_ZH} / ${EMPTY_EN}`,
    tenantLabel: order?.tenantId ? `Tenant ${order.tenantId}` : EMPTY_ZH,
    fleetLabel: order?.partnerId ? `Fleet ${order.partnerId}` : "DRTS 直營",
  };
}

function sortGroupedItems(items: EarningsGroupedItem[]) {
  return [...items].sort((left, right) => {
    if (right.netAmount.amountMinor !== left.netAmount.amountMinor) {
      return right.netAmount.amountMinor - left.netAmount.amountMinor;
    }
    return left.label.localeCompare(right.label, "zh-TW");
  });
}

export function buildGroupedEarningsItems(params: {
  groupBy: EarningsGroupBy;
  locale?: DriverLocale;
  platformItems: PlatformEarningsByPlatformResponse["items"];
  statements: DriverStatementRecord[];
  orderMap: Record<string, OwnedOrderRecord>;
}) {
  const {
    groupBy,
    locale = "zh",
    platformItems,
    statements,
    orderMap,
  } = params;

  if (groupBy === "platform") {
    return platformItems.map((item) => ({
      key: item.platformCode,
      label: item.platformCode.toUpperCase(),
      detail: t(
        {
          zh: "平台收益切片",
          en: "Platform earnings slice",
        },
        locale,
      ),
      grossEarning: item.grossEarning,
      serviceFee: item.serviceFee,
      subsidy: item.subsidy,
      netAmount: item.netAmount,
      tripCount: 0,
    }));
  }

  const lines = statements.flatMap((statement) => statement.lines);
  const currency =
    lines[0]?.netAmount.currency ??
    statements[0]?.netAmount.currency ??
    platformItems[0]?.netAmount.currency ??
    "TWD";

  if (groupBy === "total") {
    return [
      {
        key: "total",
        label: formatBilingual({
          zh: "全部收益",
          en: "Total Earnings",
        }),
        detail: formatBilingual({
          zh: "月結彙總",
          en: "Statement aggregate",
        }),
        grossEarning: sumAmounts(
          lines.map((line) => line.grossEarning),
          currency,
        ),
        serviceFee: sumAmounts(
          lines.map((line) => line.serviceFee),
          currency,
        ),
        subsidy: sumAmounts(
          lines.map((line) => line.subsidy),
          currency,
        ),
        netAmount: sumAmounts(
          lines.map((line) => line.netAmount),
          currency,
        ),
        tripCount: lines.length,
      },
    ];
  }

  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      detail: string;
      lines: DriverStatementRecord["lines"];
    }
  >();

  lines.forEach((line) => {
    const meta = makeStatementOrderMeta(line, orderMap[line.orderId]);
    let key = meta.orderId;
    let label = `${EMPTY_ZH} / ${EMPTY_EN}`;
    let detail = formatBilingual({
      zh: "月結明細",
      en: "Statement line",
    });

    if (groupBy === "service_product") {
      key = meta.serviceLabel;
      label = meta.serviceLabel;
      detail = formatBilingual({
        zh: "依服務產品分組",
        en: "Grouped by service product",
      });
    } else if (groupBy === "tenant") {
      key = meta.tenantId ?? "unassigned";
      label = meta.tenantLabel;
      detail = formatBilingual({
        zh: "依租戶方案分組",
        en: "Grouped by tenant program",
      });
    } else if (groupBy === "fleet") {
      key = meta.partnerId ?? "direct";
      label = meta.fleetLabel;
      detail = meta.partnerProgramId
        ? `Program ${meta.partnerProgramId}`
        : formatBilingual({
            zh: "依車隊歸屬分組",
            en: "Grouped by fleet attribution",
          });
    }

    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
      return;
    }

    groups.set(key, {
      key,
      label,
      detail,
      lines: [line],
    });
  });

  return sortGroupedItems(
    Array.from(groups.values()).map((entry) => ({
      key: entry.key,
      label: entry.label,
      detail: entry.detail,
      grossEarning: sumAmounts(
        entry.lines.map((line) => line.grossEarning),
        currency,
      ),
      serviceFee: sumAmounts(
        entry.lines.map((line) => line.serviceFee),
        currency,
      ),
      subsidy: sumAmounts(
        entry.lines.map((line) => line.subsidy),
        currency,
      ),
      netAmount: sumAmounts(
        entry.lines.map((line) => line.netAmount),
        currency,
      ),
      tripCount: entry.lines.length,
    })),
  );
}
