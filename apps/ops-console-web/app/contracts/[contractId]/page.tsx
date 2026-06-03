import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type {
  CrossAppResourceLink,
  PartnerChannelEntryRecord,
  VehicleContractRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  Timeline as CanvasTimeline,
  buildCanvasTheme,
  type CanvasDLItem,
  type CanvasTone,
  type TimelineItem,
} from "@drts/ui-web";

type ContractDetailPageProps = {
  params: Promise<{
    contractId: string;
  }>;
};

type ContractRuntimeRecord = VehicleContractRecord & {
  crossAppLinks?: CrossAppResourceLink[];
  partnerDisplayName?: string | null;
  partnerEntrySlug?: string | null;
};

type LoadResult<T> = {
  data: T;
  error: string | null;
};

const EXPIRING_SOON_DAYS = 45;

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const panelGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.45fr) minmax(280px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const sideStackStyle: CSSProperties = {
  display: "grid",
  gap: 16,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const metaTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: theme.textDim,
};

const monoTextStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function formatDate(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return copy(locale, "open-ended", "未設定");
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(/,/g, "");
}

function formatLongDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return copy(locale, "unknown", "未知");
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function daysBetween(fromIso: string, toIso: string | null) {
  if (!toIso) {
    return null;
  }

  const to = new Date(toIso).getTime();
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(to) || Number.isNaN(from)) {
    return null;
  }

  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

function deriveKind(contract: ContractRuntimeRecord, locale: Locale) {
  const raw = `${contract.contractType} ${contract.partnerType}`.toLowerCase();
  if (raw.includes("partner") || raw.includes("program")) {
    return {
      key: "partner",
      label: copy(locale, "Partner program", "夥伴方案"),
    };
  }
  if (raw.includes("forward")) {
    return {
      key: "forwarder",
      label: copy(locale, "Forwarder", "轉派合作"),
    };
  }
  if (raw.includes("driver")) {
    return {
      key: "driver",
      label: copy(locale, "Driver", "司機合約"),
    };
  }
  return {
    key: "vehicle",
    label: copy(locale, "Vehicle / fleet", "車輛 / 車隊"),
  };
}

function deriveStatus(
  contract: ContractRuntimeRecord,
  locale: Locale,
): { label: string; tone: CanvasTone } {
  const now = new Date().toISOString();
  const daysToExpiry = daysBetween(now, contract.endAt);
  const expired =
    contract.endAt !== null && new Date(contract.endAt).getTime() < Date.now();
  const expiringSoon =
    daysToExpiry !== null &&
    daysToExpiry >= 0 &&
    daysToExpiry <= EXPIRING_SOON_DAYS;

  if (contract.status === "terminated") {
    return {
      label: copy(locale, "Terminated", "已終止"),
      tone: "neutral",
    };
  }
  if (expired || contract.lifecycleStatus === "expired") {
    return {
      label: copy(locale, "Expired", "已到期"),
      tone: "danger",
    };
  }
  if (contract.status === "draft") {
    return {
      label: copy(locale, "Draft", "草稿"),
      tone: "warn",
    };
  }
  if (expiringSoon) {
    return {
      label: copy(locale, "Expiring soon", "即將到期"),
      tone: "warn",
    };
  }
  return {
    label: copy(locale, "Active", "生效中"),
    tone: "success",
  };
}

function resolveAppOrigin(targetApp: CrossAppResourceLink["targetApp"]) {
  const envCandidates =
    targetApp === "platform-admin"
      ? [
          process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN,
          process.env.PLATFORM_ADMIN_ORIGIN,
          process.env.DEV_PLATFORM_ADMIN_ORIGIN,
          process.env.STAGING_PLATFORM_ADMIN_ORIGIN,
          process.env.PROD_PLATFORM_ADMIN_ORIGIN,
        ]
      : targetApp === "tenant-console"
        ? [
            process.env.NEXT_PUBLIC_TENANT_CONSOLE_ORIGIN,
            process.env.TENANT_CONSOLE_ORIGIN,
          ]
        : [
            process.env.NEXT_PUBLIC_OPS_CONSOLE_ORIGIN,
            process.env.OPS_CONSOLE_ORIGIN,
          ];
  const resolved = envCandidates.find(
    (candidate) => typeof candidate === "string" && candidate.trim().length > 0,
  );

  if (resolved) {
    return resolved.replace(/\/$/, "");
  }

  if (targetApp === "platform-admin") return "http://localhost:3002";
  if (targetApp === "tenant-console") return "http://localhost:3004";
  return "http://localhost:3003";
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  if (link.route.startsWith("http://") || link.route.startsWith("https://")) {
    return link.route;
  }

  return `${resolveAppOrigin(link.targetApp)}${link.route.startsWith("/") ? link.route : `/${link.route}`}`;
}

function synthesizeCrossAppLinks(
  contract: ContractRuntimeRecord,
  kindKey: string,
  locale: Locale,
): CrossAppResourceLink[] {
  if (contract.crossAppLinks && contract.crossAppLinks.length > 0) {
    return contract.crossAppLinks;
  }

  if (kindKey === "partner" || kindKey === "forwarder") {
    return [
      {
        targetApp: "platform-admin",
        route: `/partners?partnerId=${encodeURIComponent(contract.partnerId)}`,
        resourceType: "partner_program",
        resourceId: contract.partnerId,
        openMode: "new_tab",
        label: copy(locale, "Partner governance", "夥伴治理"),
      },
    ];
  }

  return [
    {
      targetApp: "platform-admin",
      route: `/fleet?vehicleId=${encodeURIComponent(contract.vehicleId)}`,
      resourceType: "vehicle_contract",
      resourceId: contract.contractId,
      openMode: "new_tab",
      label: copy(locale, "Fleet governance", "車隊治理"),
    },
  ];
}

function buttonStyle(
  variant: "secondary" | "ghost" = "secondary",
): CSSProperties {
  const styles =
    variant === "ghost"
      ? {
          background: "transparent",
          color: theme.textMuted,
          borderColor: "transparent",
        }
      : {
          background: theme.surface,
          color: theme.text,
          borderColor: theme.border,
        };

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 34,
    padding: "0 12px",
    borderRadius: 8,
    border: `1px solid ${styles.borderColor}`,
    background: styles.background,
    color: styles.color,
    fontSize: 12.5,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    fontFamily: theme.fontFamily,
  };
}

async function loadWithError<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: fallback,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildTimelineItems(
  contract: ContractRuntimeRecord,
  locale: Locale,
): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      id: "created",
      eyebrow: copy(locale, "Created", "建立"),
      title: copy(locale, "Contract record created", "合約記錄已建立"),
      detail: `${copy(locale, "Lifecycle", "生命週期")} · ${formatOpsCodeLabel(
        locale,
        contract.lifecycleStatus,
      )}`,
      timestamp: formatLongDateTime(locale, contract.createdAt),
      tone: "info",
    },
  ];

  if (contract.approvedAt) {
    items.push({
      id: "approved",
      eyebrow: copy(locale, "Approved", "核准"),
      title: copy(
        locale,
        "Contract entered ops-visible approval",
        "合約進入 ops 可見核准狀態",
      ),
      detail:
        contract.approvedBy ??
        copy(
          locale,
          "Approver not captured in read model",
          "read model 未帶出核准人",
        ),
      timestamp: formatLongDateTime(locale, contract.approvedAt),
      tone: "success",
    });
  }

  if (contract.updatedAt !== contract.createdAt) {
    items.push({
      id: "updated",
      eyebrow: copy(locale, "Updated", "更新"),
      title: copy(locale, "Latest mirrored snapshot", "最新鏡像快照"),
      detail: copy(
        locale,
        "Read-only in ops; mutation remains in owner apps.",
        "ops 僅鏡像顯示；修改仍在 owner app。",
      ),
      timestamp: formatLongDateTime(locale, contract.updatedAt),
      tone: "accent",
    });
  }

  if (contract.endAt) {
    items.push({
      id: "term-end",
      eyebrow: copy(locale, "Term end", "期間結束"),
      title: copy(
        locale,
        "Contract effective window closes",
        "合約有效期間結束",
      ),
      detail: copy(
        locale,
        `Window start ${formatDate(locale, contract.startAt)}`,
        `期間起點 ${formatDate(locale, contract.startAt)}`,
      ),
      timestamp: formatDate(locale, contract.endAt),
      tone:
        contract.status === "terminated" ||
        contract.lifecycleStatus === "expired"
          ? "danger"
          : "warning",
    });
  }

  return items;
}

export default async function ContractDetailPage({
  params,
}: ContractDetailPageProps) {
  const { contractId } = await params;
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  const [contractsResult, partnerEntriesResult] = await Promise.all([
    loadWithError<ContractRuntimeRecord[]>(() => client.listContracts(), []),
    loadWithError<PartnerChannelEntryRecord[]>(
      () => client.listPartnerEntries(),
      [],
    ),
  ]);

  if (contractsResult.error) {
    return (
      <>
        <PageHeader
          theme={theme}
          title={copy(locale, "Contract detail", "合約詳情")}
          subtitle={`${contractId} · ${copy(
            locale,
            "registry fetch failed",
            "合約名冊讀取失敗",
          )}`}
          actions={
            <Link href="/contracts" style={buttonStyle()}>
              <CanvasIcon name="arrow" size={12} />
              {copy(locale, "Back to contracts", "回到合約列表")}
            </Link>
          }
        />
        <div style={pageBodyStyle}>
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(locale, "Contract snapshot failed", "合約快照讀取失敗")}
            body={contractsResult.error}
            actions={
              <Link href="/contracts" style={buttonStyle()}>
                {copy(locale, "Retry from registry", "回到列表重試")}
              </Link>
            }
          />
        </div>
      </>
    );
  }

  const contract = contractsResult.data.find(
    (candidate) => candidate.contractId === contractId,
  );
  if (!contract) {
    notFound();
  }

  const partnerEntry =
    partnerEntriesResult.data.find(
      (entry) => entry.partnerId === contract.partnerId,
    ) ??
    (contract.partnerEntrySlug
      ? partnerEntriesResult.data.find(
          (entry) => entry.entrySlug === contract.partnerEntrySlug,
        )
      : undefined);

  const kind = deriveKind(contract, locale);
  const status = deriveStatus(contract, locale);
  const crossAppLinks = synthesizeCrossAppLinks(contract, kind.key, locale);
  const governanceLink = crossAppLinks[0]
    ? buildCrossAppHref(crossAppLinks[0])
    : null;
  const readModelMissing = copy(
    locale,
    "No dedicated field in current read model",
    "目前 read model 沒有獨立欄位",
  );
  const termLabel = `${formatDate(locale, contract.startAt)} → ${formatDate(
    locale,
    contract.endAt,
  )}`;

  const operationalTerms: CanvasDLItem[] = [
    {
      k: copy(locale, "MODIFIABLE WINDOW", "可修改時窗"),
      v: readModelMissing,
      mono: true,
    },
    {
      k: copy(locale, "PROOF REQUIREMENTS", "憑證要求"),
      v: readModelMissing,
    },
    {
      k: copy(locale, "WAITING RULE", "等候規則"),
      v: readModelMissing,
    },
    {
      k: copy(locale, "NO-SHOW RULE", "No-show 規則"),
      v: readModelMissing,
      mono: true,
    },
    {
      k: copy(locale, "SLA PROFILE", "SLA 設定檔"),
      v: partnerEntry
        ? `${partnerEntry.tenantId} · ${formatOpsCodeLabel(
            locale,
            partnerEntry.businessDispatchSubtype,
          )}`
        : readModelMissing,
      mono: true,
    },
    {
      k: copy(locale, "CURRENT EFFECTIVE VERSION", "目前生效版本"),
      v: readModelMissing,
      mono: true,
    },
    {
      k: copy(locale, "PARTNER PROGRAM", "合作方案"),
      v: partnerEntry
        ? `${partnerEntry.displayName} · ${partnerEntry.programId}`
        : (contract.partnerDisplayName ?? contract.partnerId),
    },
    {
      k: copy(locale, "AUTH MODE", "授權模式"),
      v: partnerEntry
        ? `${formatOpsCodeLabel(locale, partnerEntry.authMode)} · ${formatOpsCodeLabel(
            locale,
            partnerEntry.eligibilityMode,
          )}`
        : readModelMissing,
      mono: true,
    },
  ];

  const linkedPartyItems: CanvasDLItem[] = [
    {
      k: copy(locale, "TENANT", "租戶"),
      v: partnerEntry?.tenantId ?? readModelMissing,
      mono: true,
    },
    {
      k: copy(locale, "PARTNER ENTRY", "夥伴渠道"),
      v:
        partnerEntry?.entrySlug ??
        contract.partnerEntrySlug ??
        contract.partnerDisplayName ??
        contract.partnerId,
      mono: true,
    },
    {
      k: copy(locale, "PROGRAM ID", "方案編號"),
      v: partnerEntry?.programId ?? readModelMissing,
      mono: true,
    },
    {
      k: copy(locale, "VEHICLE", "車輛"),
      v: contract.vehicleId,
      mono: true,
    },
  ];

  const timelineItems = buildTimelineItems(contract, locale);

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span>{contract.contractId}</span>
            <Pill theme={theme} tone={status.tone} dot>
              {status.label}
            </Pill>
            <Pill theme={theme} tone="info">
              {copy(locale, "read-only · ops scope", "唯讀 · ops 範圍")}
            </Pill>
          </span>
        }
        subtitle={`${partnerEntry?.displayName ?? contract.partnerDisplayName ?? contract.partnerId} · ${kind.label} · ${termLabel}`}
        actions={
          <div style={actionRowStyle}>
            <Link href="/contracts" style={buttonStyle("ghost")}>
              <CanvasIcon name="arrow" size={12} />
              {copy(locale, "Back", "返回")}
            </Link>
            {governanceLink ? (
              <Link
                href={governanceLink}
                target="_blank"
                rel="noreferrer"
                style={buttonStyle()}
              >
                <CanvasIcon name="ext" size={12} />
                {crossAppLinks[0]?.label ??
                  copy(locale, "Open owner app", "開啟 owner app")}
              </Link>
            ) : null}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        {partnerEntriesResult.error ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={copy(
              locale,
              "Partner directory degraded",
              "夥伴目錄服務降級",
            )}
            body={copy(
              locale,
              "Contract detail remains available, but partner-program context is partially unavailable in this snapshot.",
              "合約詳情仍可瀏覽，但本次快照中的夥伴方案上下文只有部分可用。",
            )}
          />
        ) : null}

        <div style={panelGridStyle}>
          <Card
            theme={theme}
            title={copy(
              locale,
              "Operational terms · ops scope",
              "營運條款 · ops 範圍",
            )}
            subtitle={copy(
              locale,
              "Fields exposed to ops today. Missing items are explicitly absent from the current read model.",
              "列出目前 ops 可見欄位；缺的項目會明確標示為現行 read model 未提供。",
            )}
          >
            <DL theme={theme} cols={2} items={operationalTerms} />
          </Card>

          <div style={sideStackStyle}>
            <Card
              theme={theme}
              title={copy(locale, "Authority redirect", "治理轉向")}
            >
              <Banner
                theme={theme}
                tone="info"
                icon="info"
                title={copy(
                  locale,
                  "Mutation stays in Platform Admin",
                  "Mutation 留在 Platform Admin",
                )}
                body={copy(
                  locale,
                  "Contract edits, version changes, and termination workflows stay in the owner app. Ops keeps a read-only mirror here.",
                  "合約編輯、版本調整與終止流程都留在 owner app；ops 這邊維持唯讀鏡像。",
                )}
                actions={
                  governanceLink ? (
                    <Link
                      href={governanceLink}
                      target="_blank"
                      rel="noreferrer"
                      style={buttonStyle()}
                    >
                      {copy(locale, "Open in new tab", "新分頁開啟")}
                    </Link>
                  ) : undefined
                }
              />
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Linked tenant / partner", "關聯租戶 / 夥伴")}
            >
              <DL theme={theme} cols={1} items={linkedPartyItems} />
              <div style={{ ...metaTextStyle, marginTop: 12 }}>
                <span style={monoTextStyle}>
                  {copy(locale, "counterparty", "交易對手")} ·{" "}
                  {contract.partnerId}
                </span>
              </div>
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Version history", "版本歷程")}
              subtitle={copy(
                locale,
                "Lifecycle milestones from the current mirrored contract record.",
                "以目前鏡像合約記錄組出的生命週期節點。",
              )}
            >
              <CanvasTimeline items={timelineItems} density="compact" />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
