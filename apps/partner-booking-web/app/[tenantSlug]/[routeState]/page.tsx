import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  buildCanvasTheme,
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasField,
  CanvasInput,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTheme,
  type CanvasTone,
  type PartnerBookingScenarioId,
  PartnerBookingPhoneScreen,
} from "@drts/ui-web";
import { getBrandForSlug, type PartnerBrand } from "@/lib/brand";
import { resolvePartnerRouteState } from "@/lib/route-state";

type PageProps = {
  params: Promise<{ tenantSlug: string; routeState: string }>;
};

type EligibilityScenario = Extract<
  PartnerBookingScenarioId,
  "eligible" | "ineligible" | "manual_review"
>;

type EligibilityScenarioMeta = {
  label: string;
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  summary: string;
  nextStep: string;
  responseCode: string;
  bookingGate: string;
  queue: string;
};

type EligibilityTraceRow = {
  step: ReactNode;
  call: ReactNode;
  payload: ReactNode;
  state: ReactNode;
  latency: ReactNode;
};

const ELIGIBILITY_SCENARIOS: Record<
  EligibilityScenario,
  EligibilityScenarioMeta
> = {
  eligible: {
    label: "eligible",
    tone: "success",
    title: "資格驗證通過",
    summary:
      "adapter 已回傳有效 verification id，partner booking 建立行程入口可直接放行。",
    nextStep: "booking_create.unlocked",
    responseCode: "200 OK",
    bookingGate: "可直接建立行程",
    queue: "none",
  },
  ineligible: {
    label: "ineligible",
    tone: "danger",
    title: "資格不符",
    summary:
      "issuer adapter 回覆此 reference token 不具備對應權益，booking gate 維持封鎖。",
    nextStep: "partner_helpdesk.contact",
    responseCode: "403 INELIGIBLE",
    bookingGate: "封鎖",
    queue: "none",
  },
  manual_review: {
    label: "manual_review",
    tone: "warn",
    title: "轉人工覆核",
    summary:
      "驗證命中人工覆核規則，ops eligibility queue 需先完成審核後才能開放 booking create。",
    nextStep: "ops_manual_review.pending",
    responseCode: "202 REVIEW",
    bookingGate: "人工覆核中",
    queue: "eligibility_manual_review",
  },
};

function buildPartnerEligibilityTheme(brand: PartnerBrand): CanvasTheme {
  const baseTheme = buildCanvasTheme({
    surface: "partner",
    dark: true,
    density: "compact",
  });

  return {
    ...baseTheme,
    accent: brand.accent,
    accentHi: brand.surface.hi,
    accentBorder: baseTheme.accentBorder,
    surfaceName: brand.displayName,
    surfaceTagline: brand.host,
  };
}

function resolveEligibilityScenario(
  scenario?: PartnerBookingScenarioId,
): EligibilityScenario {
  if (
    scenario === "eligible" ||
    scenario === "ineligible" ||
    scenario === "manual_review"
  ) {
    return scenario;
  }

  return "eligible";
}

function buildEligibilityTraceRows({
  theme,
  tone,
  brand,
  scenario,
}: {
  theme: CanvasTheme;
  tone: CanvasTone;
  brand: PartnerBrand;
  scenario: EligibilityScenario;
}): EligibilityTraceRow[] {
  return [
    {
      step: (
        <span
          style={{
            color: theme.accent,
            fontFamily: theme.monoFamily,
            fontWeight: 700,
          }}
        >
          01 ingress
        </span>
      ),
      call: (
        <span style={{ fontFamily: theme.monoFamily }}>
          partner.eligibility.verify
        </span>
      ),
      payload: (
        <span style={{ fontFamily: theme.monoFamily }}>
          tenant={brand.tenantCode}
        </span>
      ),
      state: (
        <CanvasPill theme={theme} tone="info" dot>
          accepted
        </CanvasPill>
      ),
      latency: (
        <span style={{ fontFamily: theme.monoFamily, color: theme.textMuted }}>
          012ms
        </span>
      ),
    },
    {
      step: (
        <span
          style={{
            color: theme.accent,
            fontFamily: theme.monoFamily,
            fontWeight: 700,
          }}
        >
          02 issuer
        </span>
      ),
      call: (
        <span style={{ fontFamily: theme.monoFamily }}>
          issuer.{brand.code.toLowerCase()}.lookup_member
        </span>
      ),
      payload: (
        <span style={{ fontFamily: theme.monoFamily }}>
          card_last4={brand.cardArt.lastFour}
        </span>
      ),
      state: (
        <CanvasPill
          theme={theme}
          tone={scenario === "ineligible" ? "danger" : "success"}
          dot
        >
          {scenario === "ineligible" ? "not_matched" : "matched"}
        </CanvasPill>
      ),
      latency: (
        <span style={{ fontFamily: theme.monoFamily, color: theme.textMuted }}>
          084ms
        </span>
      ),
    },
    {
      step: (
        <span
          style={{
            color: theme.accent,
            fontFamily: theme.monoFamily,
            fontWeight: 700,
          }}
        >
          03 benefits
        </span>
      ),
      call: (
        <span style={{ fontFamily: theme.monoFamily }}>
          partner.benefit.snapshot
        </span>
      ),
      payload: (
        <span style={{ fontFamily: theme.monoFamily }}>
          remaining=09 total=12
        </span>
      ),
      state: (
        <CanvasPill
          theme={theme}
          tone={scenario === "manual_review" ? "warn" : "success"}
          dot
        >
          {scenario === "manual_review" ? "review_queue" : "ready"}
        </CanvasPill>
      ),
      latency: (
        <span style={{ fontFamily: theme.monoFamily, color: theme.textMuted }}>
          121ms
        </span>
      ),
    },
    {
      step: (
        <span
          style={{
            color: theme.accent,
            fontFamily: theme.monoFamily,
            fontWeight: 700,
          }}
        >
          04 decision
        </span>
      ),
      call: (
        <span style={{ fontFamily: theme.monoFamily }}>
          eligibility.rule_engine
        </span>
      ),
      payload: (
        <span style={{ fontFamily: theme.monoFamily }}>state={scenario}</span>
      ),
      state: (
        <CanvasPill theme={theme} tone={tone} dot>
          {scenario}
        </CanvasPill>
      ),
      latency: (
        <span style={{ fontFamily: theme.monoFamily, color: theme.textMuted }}>
          318ms
        </span>
      ),
    },
  ];
}

function PartnerEligibilityWorkspace({
  brand,
  tenantSlug,
  routeState,
  scenario,
}: {
  brand: PartnerBrand;
  tenantSlug: string;
  routeState: string;
  scenario: EligibilityScenario;
}) {
  const theme = buildPartnerEligibilityTheme(brand);
  const scenarioMeta = ELIGIBILITY_SCENARIOS[scenario];
  const referenceToken = `${brand.code.toLowerCase()}_${brand.cardArt.lastFour}_ref_20260515`;
  const requestId = `elig_req_${brand.slug}_0515_0041`;
  const verificationId = `elig_${brand.code.toLowerCase()}_vf_0041`;
  const traceRows = buildEligibilityTraceRows({
    theme,
    tone: scenarioMeta.tone,
    brand,
    scenario,
  });
  const traceColumns: CanvasTableColumn<EligibilityTraceRow>[] = [
    { h: "步驟", k: "step", w: 92, mono: true },
    { h: "adapter call", k: "call", mono: true },
    { h: "payload", k: "payload", mono: true },
    { h: "狀態", k: "state", w: 150 },
    { h: "延遲", k: "latency", w: 92, mono: true, align: "right" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        width: "100vw",
        height: "100vh",
        maxWidth: "none",
        background: theme.bg,
      }}
    >
      <CanvasShell
        theme={theme}
        nav={[
          {
            key: "landing",
            href: `/${tenantSlug}`,
            label: "首頁",
            icon: "home",
          },
          {
            key: "eligibility",
            href: `/${tenantSlug}/eligibility`,
            label: "資格驗證",
            icon: "partners",
          },
          {
            key: "book",
            href: `/${tenantSlug}/book`,
            label: "建立行程",
            icon: "bookings",
          },
          {
            key: "trips",
            href: `/${tenantSlug}/trips`,
            label: "趟次紀錄",
            icon: "reports",
          },
          {
            key: "help",
            href: `/${tenantSlug}/help`,
            label: "客服支援",
            icon: "phone",
          },
        ]}
        active="eligibility"
        title="Partner eligibility"
        brandLabel={`${brand.bankName} × DRTS`}
        brandSubLabel={brand.host}
        brandMark={brand.cardArt.badgeText}
        breadcrumb={[brand.displayName, "Partner Booking", "資格驗證"]}
        topRight={
          <CanvasPill theme={theme} tone="accent" dot>
            {brand.host}
          </CanvasPill>
        }
        env="partner"
        versionLabel="eligibility v2"
        searchPlaceholder="搜尋 token / request id / verification id"
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          sticky={false}
          title="資格驗證工作台"
          subtitle="卡號末四碼 / reference token / adapter call / result state"
          actions={
            <>
              <CanvasBtn theme={theme} variant="secondary" icon="copy">
                複製 request id
              </CanvasBtn>
              <CanvasBtn theme={theme} variant="primary" icon="arrow">
                {scenario === "eligible" ? "前往建立行程" : "重新送驗"}
              </CanvasBtn>
            </>
          }
        />

        <div
          style={{
            padding: 24,
            display: "grid",
            gap: 16,
            background: theme.bg,
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <CanvasKPI
              theme={theme}
              label="卡號末四碼"
              value={`••${brand.cardArt.lastFour}`}
              sub={brand.cardArt.issuerLabel}
              hint={brand.cardArt.networkLabel}
            />
            <CanvasKPI
              theme={theme}
              label="reference token"
              value={referenceToken.slice(-12)}
              sub="partner adapter token"
              hint={requestId}
            />
            <CanvasKPI
              theme={theme}
              label="結果狀態"
              value={scenarioMeta.label}
              delta={scenarioMeta.responseCode}
              deltaTone={
                scenarioMeta.tone === "success"
                  ? "up"
                  : scenarioMeta.tone === "danger"
                    ? "down"
                    : "neutral"
              }
              sub={scenarioMeta.bookingGate}
              hint={verificationId}
            />
            <CanvasKPI
              theme={theme}
              label="剩餘額度"
              value="09 / 12"
              sub="2026 年度剩餘趟次"
              hint={`${brand.programName} benefit`}
            />
          </div>

          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            }}
          >
            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title="驗證表單"
                subtitle="card last4 / reference token / adapter call"
                actions={
                  <CanvasPill theme={theme} tone="accent" dot>
                    {routeState}
                  </CanvasPill>
                }
              >
                <CanvasField
                  theme={theme}
                  label="卡號末四碼"
                  hint="僅保留 last4，不傳送完整卡號或安全碼。"
                  required
                >
                  <CanvasInput
                    theme={theme}
                    value={brand.cardArt.lastFour}
                    mono
                    prefix={brand.cardArt.networkLabel}
                    suffix="card_last4"
                  />
                </CanvasField>
                <CanvasField
                  theme={theme}
                  label="reference token"
                  hint="由 partner webview 進入時綁定的參照碼。"
                  required
                >
                  <CanvasInput
                    theme={theme}
                    value={referenceToken}
                    mono
                    suffix={brand.displayName}
                  />
                </CanvasField>
                <CanvasField
                  theme={theme}
                  label="adapter call"
                  hint="Eligibility adapter contract snapshot."
                  required
                >
                  <CanvasInput
                    theme={theme}
                    value="partner.eligibility.verify_v2"
                    mono
                    prefix="POST"
                    suffix="/adapter/eligibility"
                  />
                </CanvasField>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <CanvasBtn theme={theme} variant="primary" icon="check">
                    送出驗證
                  </CanvasBtn>
                  <CanvasBtn theme={theme} variant="secondary" icon="copy">
                    複製 token
                  </CanvasBtn>
                  <CanvasBtn theme={theme} variant="ghost" icon="more">
                    更多操作
                  </CanvasBtn>
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="adapter call trace"
                subtitle="密集表格 · mono codes · state pills"
                actions={
                  <CanvasPill theme={theme} tone="info" dot>
                    4 hops
                  </CanvasPill>
                }
                padding={0}
              >
                <CanvasTable
                  theme={theme}
                  columns={traceColumns}
                  rows={traceRows}
                  dense
                />
              </CanvasCard>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title="結果狀態"
                subtitle="adapter result state"
                style={{
                  background:
                    scenario === "eligible"
                      ? "linear-gradient(180deg, rgba(15,42,31,0.72) 0%, rgba(20,27,43,1) 100%)"
                      : scenario === "manual_review"
                        ? "linear-gradient(180deg, rgba(45,31,8,0.76) 0%, rgba(20,27,43,1) 100%)"
                        : "linear-gradient(180deg, rgba(44,16,14,0.76) 0%, rgba(20,27,43,1) 100%)",
                }}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <CanvasPill theme={theme} tone={scenarioMeta.tone} dot>
                      {scenarioMeta.label}
                    </CanvasPill>
                    <CanvasPill theme={theme} tone="neutral">
                      建立行程 gate: {scenarioMeta.bookingGate}
                    </CanvasPill>
                  </div>
                  <CanvasBanner
                    theme={theme}
                    tone={
                      scenarioMeta.tone === "danger"
                        ? "danger"
                        : scenarioMeta.tone
                    }
                    title={scenarioMeta.title}
                    body={scenarioMeta.summary}
                  />
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      { label: "驗證編號", value: verificationId, mono: true },
                      { label: "請求編號", value: requestId, mono: true },
                      {
                        label: "租戶代碼",
                        value: brand.tenantCode,
                        mono: true,
                      },
                      {
                        label: "response code",
                        value: scenarioMeta.responseCode,
                        mono: true,
                      },
                      {
                        label: "人工佇列",
                        value: scenarioMeta.queue,
                        mono: true,
                      },
                      {
                        label: "next step",
                        value: scenarioMeta.nextStep,
                        mono: true,
                      },
                    ]}
                  />
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="權益快照"
                subtitle="card last4 + partner policy"
                actions={
                  <CanvasPill theme={theme} tone="accent" dot>
                    {brand.programName}
                  </CanvasPill>
                }
              >
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: "發卡來源",
                      value: brand.cardArt.issuerLabel,
                    },
                    {
                      label: "服務範圍",
                      value: "台北 / 桃園 / 新竹",
                    },
                    {
                      label: "優惠規則",
                      value: "額度後 8 折",
                    },
                    {
                      label: "客服專線",
                      value: brand.hotline.phone,
                      mono: true,
                    },
                    {
                      label: "卡號末四碼",
                      value: brand.cardArt.lastFour,
                      mono: true,
                    },
                    {
                      label: "路由政策",
                      value: "partner booking only",
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

export default async function PartnerRouteStatePage({ params }: PageProps) {
  const { tenantSlug, routeState } = await params;
  const brand = getBrandForSlug(tenantSlug);
  if (!brand) {
    notFound();
  }

  const resolvedRouteState = resolvePartnerRouteState(routeState);
  if (!resolvedRouteState) {
    notFound();
  }

  if (resolvedRouteState.activeScreen === "eligibility") {
    return (
      <PartnerEligibilityWorkspace
        brand={brand}
        tenantSlug={tenantSlug}
        routeState={routeState}
        scenario={resolveEligibilityScenario(resolvedRouteState.activeScenario)}
      />
    );
  }

  return (
    <PartnerBookingPhoneScreen
      brand={brand}
      screen={resolvedRouteState.activeScreen}
      {...(resolvedRouteState.activeScenario
        ? { scenario: resolvedRouteState.activeScenario }
        : {})}
    />
  );
}
