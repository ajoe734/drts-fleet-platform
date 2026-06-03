import Link from "next/link";
import { notFound } from "next/navigation";
import type { VehicleContractRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import {
  CanvasActivityFeed,
  type CanvasActivityItem,
} from "@/lib/canvas-workflow";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  buildCanvasTheme,
} from "@drts/ui-web";

type ContractDetailPageProps = {
  params: Promise<{ contractId: string }>;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
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
    .format(parsed)
    .replace(",", "");
}

function buildFallbackContract(contractId: string): VehicleContractRecord {
  const now = new Date().toISOString();
  return {
    contractId,
    vehicleId: "VH-OPS-001",
    partnerId: "partner_ctbc",
    serviceScope: "premium",
    operatingAreaId: "taipei",
    effectiveFrom: now,
    effectiveTo: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString(),
    status: "active",
    createdAt: now,
    updatedAt: now,
  } as VehicleContractRecord;
}

function buildActivityItems(
  locale: Locale,
  contract: VehicleContractRecord,
): CanvasActivityItem[] {
  return [
    {
      id: `${contract.contractId}:published`,
      title: copy(locale, "Current version active", "目前版本生效中"),
      detail: copy(
        locale,
        "Operational terms are visible in Ops Console; mutation remains in Platform Admin.",
        "營運條款僅供 Ops Console 檢視；修改仍由 Platform Admin 負責。",
      ),
      timestamp: formatDateTime(locale, contract.updatedAt),
      tone: "info",
      eyebrow: contract.status,
    },
    {
      id: `${contract.contractId}:handoff`,
      title: copy(locale, "Authority handoff", "權限分工"),
      detail: copy(
        locale,
        "Partner edits, rate changes, and termination flow open in a new Platform Admin tab.",
        "夥伴編輯、費率調整、終止流程需在新的 Platform Admin 分頁處理。",
      ),
      timestamp: formatDateTime(locale, contract.updatedAt),
      tone: "warn",
      eyebrow: "platform-admin",
    },
  ];
}

export default async function ContractDetailPage({
  params,
}: ContractDetailPageProps) {
  const { contractId } = await params;
  if (!contractId) {
    notFound();
  }

  const locale = await getServerLocale();
  const client = getServerOpsClient();
  const list = await client.listContracts().catch(() => []);
  const contract =
    list.find((entry) => entry.contractId === contractId) ??
    buildFallbackContract(contractId);

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <PageHeader
        theme={theme}
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span>{contract.contractId}</span>
            <Pill theme={theme} tone={contract.status === "active" ? "success" : "warn"} dot>
              {formatOpsCodeLabel(locale, contract.status)}
            </Pill>
            <Pill theme={theme} tone="info">
              {copy(locale, "ops read-only", "ops 唯讀")}
            </Pill>
          </span>
        }
        subtitle={copy(
          locale,
          "Operational contract view for dispatch, waiting, proof, and settlement awareness.",
          "供營運檢視派遣、等候、證明與結算感知的合約視圖。",
        )}
        actions={
          <>
            <Link href="/contracts" style={{ color: theme.accent }}>
              {copy(locale, "Back to registry", "回到合約列表")}
            </Link>
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.warnBorder}`,
                background: theme.warnBg,
                color: theme.warn,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {copy(locale, "Open in Platform Admin", "前往 Platform Admin")}
            </span>
          </>
        }
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {["overview", "terms", "history"].map((tab) => (
          <Pill key={tab} theme={theme} tone={tab === "overview" ? "accent" : "neutral"}>
            {tab}
          </Pill>
        ))}
      </div>

      <Banner
        theme={theme}
        tone="warn"
        icon="ext"
        title={copy(locale, "High-risk changes happen outside Ops Console", "高風險變更不在 Ops Console 執行")}
        body={copy(
          locale,
          "Version changes, termination, and rate edits must be performed in Platform Admin with a separate approval trail.",
          "版本調整、終止、費率修改必須在 Platform Admin 執行，並走獨立審批軌跡。",
        )}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 1fr)",
          gap: 16,
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <Card theme={theme} title={copy(locale, "Operational terms", "營運條款")}>
            <DL
              theme={theme}
              cols={2}
              items={[
                { k: "contract", v: contract.contractId, mono: true },
                { k: "partner", v: contract.partnerId, mono: true },
                { k: "vehicle", v: contract.vehicleId, mono: true },
                { k: "scope", v: contract.serviceScope, mono: true },
                { k: "effective from", v: formatDateTime(locale, contract.effectiveFrom), mono: true },
                { k: "effective to", v: formatDateTime(locale, contract.effectiveTo), mono: true },
                { k: "proof", v: copy(locale, "pickup photo + dropoff receipt", "取車照片 + 送達簽收") },
                { k: "waiting", v: copy(locale, "5 min free, then surcharge", "免費等候 5 分鐘，之後加價") },
              ]}
            />
          </Card>

          <Card theme={theme} title={copy(locale, "Version history", "版本紀錄")}>
            <CanvasActivityFeed
              theme={theme}
              density="compact"
              items={buildActivityItems(locale, contract)}
            />
          </Card>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <Card theme={theme} title={copy(locale, "Authority redirect", "權限導向")}>
            <DL
              theme={theme}
              cols={1}
              items={[
                { k: "mutations", v: copy(locale, "Platform Admin / partners", "Platform Admin / partners") },
                { k: "ops role", v: copy(locale, "dispatch + revenue awareness only", "僅供派遣與收益感知") },
                { k: "review lane", v: "ops_finance_reviewer / ops_manager", mono: true },
              ]}
            />
          </Card>

          <Card theme={theme} title={copy(locale, "Linked surfaces", "關聯介面")}>
            <DL
              theme={theme}
              cols={1}
              items={[
                { k: "dispatch", v: "/dispatch?board=forwarded", mono: true },
                { k: "revenue", v: "/revenue", mono: true },
                { k: "registry", v: "/vehicles", mono: true },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
