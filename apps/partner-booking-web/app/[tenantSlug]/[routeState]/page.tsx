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

type PartnerTripRow = {
  code: ReactNode;
  when: ReactNode;
  route: ReactNode;
  benefit: ReactNode;
  state: ReactNode;
  amount: ReactNode;
  detail: ReactNode;
};

function buildPartnerTripsTheme(brand: PartnerBrand): CanvasTheme {
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

function PartnerTripsWorkspace({
  brand,
  tenantSlug,
  routeState,
}: {
  brand: PartnerBrand;
  tenantSlug: string;
  routeState: string;
}) {
  const theme = buildPartnerTripsTheme(brand);
  const totalBenefits = 12;
  const remainingBenefits = 9;
  const usedBenefits = totalBenefits - remainingBenefits;
  const remainingRatio = `${Math.round((remainingBenefits / totalBenefits) * 100)}%`;

  const tripRows: ReadonlyArray<{
    id: string;
    when: string;
    weekday: string;
    route: string;
    benefit: string;
    benefitTag: string;
    stateLabel: string;
    stateTone: Exclude<CanvasTone, "neutral"> | "neutral";
    amount: string;
    note: string;
  }> = [
    {
      id: "trip_2026_0501",
      when: "2026-05-15 14:30",
      weekday: "今天",
      route: "台北信義 → 桃園 T2",
      benefit: `${brand.programName} 禮遇 #4`,
      benefitTag: "BENEFIT",
      stateLabel: "已派車",
      stateTone: "success",
      amount: "免費",
      note: "扣除禮遇 1 趟",
    },
    {
      id: "trip_2026_0429",
      when: "2026-05-14 09:12",
      weekday: "昨天",
      route: "台北車站 → 內湖科技園區",
      benefit: `${brand.programName} 禮遇 #3`,
      benefitTag: "BENEFIT",
      stateLabel: "已完成",
      stateTone: "neutral",
      amount: "NT$ 0",
      note: "扣除禮遇 1 趟",
    },
    {
      id: "trip_2026_0502",
      when: "2026-05-02 18:45",
      weekday: "5/2",
      route: "台北 101 → 松山機場",
      benefit: `${brand.programName} 禮遇 #2`,
      benefitTag: "BENEFIT",
      stateLabel: "已完成",
      stateTone: "neutral",
      amount: "NT$ 0",
      note: "扣除禮遇 1 趟",
    },
    {
      id: "trip_2026_0428",
      when: "2026-04-28 07:30",
      weekday: "4/28",
      route: "陽明山 → 桃園 T1",
      benefit: "額度後 8 折",
      benefitTag: "OVERAGE",
      stateLabel: "已完成",
      stateTone: "neutral",
      amount: "NT$ 240",
      note: "與本卡帳單合併",
    },
    {
      id: "trip_2026_0414",
      when: "2026-04-14 22:10",
      weekday: "4/14",
      route: "南港展覽館 → 內湖",
      benefit: `${brand.programName} 禮遇 #1`,
      benefitTag: "BENEFIT",
      stateLabel: "已完成",
      stateTone: "neutral",
      amount: "NT$ 0",
      note: "扣除禮遇 1 趟",
    },
  ];

  const overageTotal = tripRows
    .filter((row) => row.benefitTag === "OVERAGE")
    .reduce((sum, row) => sum + Number(row.amount.replace(/[^0-9]/g, "")), 0);
  const overageAmount = overageTotal > 0 ? `NT$ ${overageTotal}` : "NT$ 0";

  const rows: PartnerTripRow[] = tripRows.map((row) => ({
    code: (
      <span
        style={{
          color: theme.accent,
          fontFamily: theme.monoFamily,
          fontWeight: 700,
        }}
      >
        {row.id}
      </span>
    ),
    when: (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{
            fontSize: 11.5,
            color: theme.text,
            fontFamily: theme.monoFamily,
            fontWeight: 600,
          }}
        >
          {row.when}
        </span>
        <span style={{ fontSize: 10.5, color: theme.textMuted }}>
          {row.weekday}
        </span>
      </div>
    ),
    route: (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 12.5, color: theme.text, fontWeight: 600 }}>
          {row.route}
        </span>
        <span style={{ fontSize: 10.5, color: theme.textMuted }}>
          {row.note}
        </span>
      </div>
    ),
    benefit: (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <CanvasPill
          theme={theme}
          tone={row.benefitTag === "OVERAGE" ? "warn" : "accent"}
        >
          {row.benefitTag}
        </CanvasPill>
        <span style={{ fontSize: 11, color: theme.textMuted }}>
          {row.benefit}
        </span>
      </div>
    ),
    state: (
      <CanvasPill theme={theme} tone={row.stateTone} dot>
        {row.stateLabel}
      </CanvasPill>
    ),
    amount: (
      <span
        style={{
          color: theme.text,
          fontFamily: theme.monoFamily,
          fontWeight: 600,
        }}
      >
        {row.amount}
      </span>
    ),
    detail: (
      <CanvasBtn theme={theme} variant="ghost" size="xs" icon="arrow">
        明細
      </CanvasBtn>
    ),
  }));

  const tripColumns: CanvasTableColumn<PartnerTripRow>[] = [
    { h: "趟次代碼", k: "code", w: 168, mono: true },
    { h: "出發時間", k: "when", w: 148 },
    { h: "路線", k: "route" },
    { h: "權益", k: "benefit", w: 140 },
    { h: "狀態", k: "state", w: 100 },
    { h: "您付款", k: "amount", w: 92, mono: true, align: "right" },
    { h: "", k: "detail", w: 72, align: "right" },
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
        active="trips"
        title="Partner trips"
        brandLabel={`${brand.bankName} × DRTS`}
        brandSubLabel={brand.host}
        brandMark={brand.cardArt.badgeText}
        breadcrumb={[brand.displayName, "Partner Booking", "趟次紀錄"]}
        topRight={
          <CanvasPill theme={theme} tone="accent" dot>
            {brand.host}
          </CanvasPill>
        }
        env="partner"
        versionLabel="trips v2"
        searchPlaceholder="搜尋 trip id / route / benefit"
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          sticky={false}
          title="我的行程"
          subtitle={`本年度 · 共 ${usedBenefits} 趟 · 剩餘 ${remainingBenefits}/${totalBenefits} 禮遇`}
          actions={
            <>
              <CanvasBtn theme={theme} variant="secondary" icon="filter">
                篩選年份
              </CanvasBtn>
              <CanvasBtn theme={theme} variant="primary" icon="arrow">
                前往建立行程
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
              label="本年度剩餘"
              value={`${remainingBenefits} / ${totalBenefits}`}
              delta={remainingRatio}
              deltaTone="up"
              sub="2026 年度免費趟次"
              hint={`${brand.programName} benefit`}
            />
            <CanvasKPI
              theme={theme}
              label="已使用"
              value={`${usedBenefits} 趟`}
              sub="本年度禮遇已扣除"
              hint="benefit_used"
            />
            <CanvasKPI
              theme={theme}
              label="額度後付款"
              value={overageAmount}
              delta={overageTotal > 0 ? "8 折" : "—"}
              deltaTone="neutral"
              sub="合併至本卡帳單"
              hint="overage_total"
            />
            <CanvasKPI
              theme={theme}
              label="近 30 天趟次"
              value={`${tripRows.length} 趟`}
              sub="含 1 已派車"
              hint="recent_30d"
            />
          </div>

          <CanvasBanner
            theme={theme}
            tone="info"
            title="禮遇條款摘要"
            body={`${brand.programName} 每年元旦重置 ${totalBenefits} 趟免費；額度用完後續趟享 8 折，費用將合併至本卡帳單，不需現場付款。`}
          />

          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "minmax(0, 2.2fr) minmax(280px, 1fr)",
            }}
          >
            <CanvasCard
              theme={theme}
              title="趟次清單"
              subtitle="密集表格 · mono trip id · status pills"
              actions={
                <CanvasPill theme={theme} tone="info" dot>
                  {tripRows.length} 筆
                </CanvasPill>
              }
              padding={0}
            >
              <CanvasTable
                theme={theme}
                columns={tripColumns}
                rows={rows}
                dense
              />
            </CanvasCard>

            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title="額度進度"
                subtitle="2026 年度 benefit progress"
                actions={
                  <CanvasPill theme={theme} tone="accent" dot>
                    {brand.programName}
                  </CanvasPill>
                }
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: theme.textMuted,
                        fontWeight: 600,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      2026 年度
                    </span>
                    <span
                      style={{
                        fontFamily: theme.monoFamily,
                        color: theme.text,
                        fontSize: 13,
                      }}
                    >
                      <b style={{ fontSize: 22, color: theme.accent }}>
                        {remainingBenefits}
                      </b>{" "}
                      / {totalBenefits} 剩餘
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 999,
                      background: theme.surfaceLo,
                      overflow: "hidden",
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div
                      style={{
                        width: remainingRatio,
                        height: "100%",
                        background: theme.accent,
                      }}
                    />
                  </div>
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        label: "已使用",
                        value: `${usedBenefits} 趟`,
                        mono: true,
                      },
                      {
                        label: "剩餘",
                        value: `${remainingBenefits} 趟`,
                        mono: true,
                      },
                      {
                        label: "重置日",
                        value: "2027-01-01",
                        mono: true,
                      },
                      {
                        label: "額度後折扣",
                        value: "8 折",
                      },
                    ]}
                  />
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="本卡資訊"
                subtitle="card last4 + partner program"
                actions={
                  <CanvasPill theme={theme} tone="info">
                    {routeState}
                  </CanvasPill>
                }
              >
                <CanvasDL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: "持卡身份",
                      value: brand.programName,
                    },
                    {
                      label: "卡號末四碼",
                      value: brand.cardArt.lastFour,
                      mono: true,
                    },
                    {
                      label: "發卡來源",
                      value: brand.cardArt.issuerLabel,
                    },
                    {
                      label: "服務範圍",
                      value: "台北 / 桃園 / 新竹",
                    },
                    {
                      label: "客服專線",
                      value: brand.hotline.phone,
                      mono: true,
                    },
                    {
                      label: "租戶代碼",
                      value: brand.tenantCode,
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

type LandingServiceRow = {
  code: ReactNode;
  name: ReactNode;
  scope: ReactNode;
  promise: ReactNode;
  tag: ReactNode;
};

function buildPartnerLandingTheme(brand: PartnerBrand): CanvasTheme {
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

function PartnerLandingWorkspace({
  brand,
  tenantSlug,
  routeState,
}: {
  brand: PartnerBrand;
  tenantSlug: string;
  routeState: string;
}) {
  const theme = buildPartnerLandingTheme(brand);
  const totalBenefits = 12;
  const remainingBenefits = 9;
  const usedBenefits = totalBenefits - remainingBenefits;
  const remainingRatio = `${Math.round(
    (remainingBenefits / totalBenefits) * 100,
  )}%`;
  const verificationId = `elig_${brand.code.toLowerCase()}_vf_0041`;
  const benefitId = `${brand.code}-2026-0004`;

  const services: ReadonlyArray<{
    code: string;
    name: string;
    scope: string;
    promise: string;
    tag: string;
    tone: CanvasTone;
  }> = [
    {
      code: "svc_airport",
      name: "機場接送",
      scope: "桃園 T1/T2 · 松山機場",
      promise: "商務車型 · 行李 4 件",
      tag: "AIRPORT",
      tone: "accent",
    },
    {
      code: "svc_priority",
      name: "優先派車",
      scope: "都會區 · 台北 / 新北",
      promise: "8 分鐘內到車",
      tag: "PRIORITY",
      tone: "info",
    },
    {
      code: "svc_business",
      name: "商務時段",
      scope: "平日 07:00-22:00",
      promise: "含車型升級 · 多點停靠",
      tag: "BUSINESS",
      tone: "success",
    },
  ];

  const serviceRows: LandingServiceRow[] = services.map((service) => ({
    code: (
      <span
        style={{
          color: theme.accent,
          fontFamily: theme.monoFamily,
          fontWeight: 700,
        }}
      >
        {service.code}
      </span>
    ),
    name: (
      <span style={{ fontSize: 12.5, color: theme.text, fontWeight: 600 }}>
        {service.name}
      </span>
    ),
    scope: (
      <span style={{ fontSize: 11.5, color: theme.textMuted }}>
        {service.scope}
      </span>
    ),
    promise: (
      <span style={{ fontSize: 11.5, color: theme.textMuted }}>
        {service.promise}
      </span>
    ),
    tag: (
      <CanvasPill theme={theme} tone={service.tone} dot>
        {service.tag}
      </CanvasPill>
    ),
  }));

  const serviceColumns: CanvasTableColumn<LandingServiceRow>[] = [
    { h: "服務代碼", k: "code", w: 152, mono: true },
    { h: "服務名稱", k: "name", w: 140 },
    { h: "服務範圍", k: "scope" },
    { h: "派車承諾", k: "promise", w: 200 },
    { h: "標籤", k: "tag", w: 120 },
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
            href: `/${tenantSlug}/landing`,
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
        active="landing"
        title="Partner landing"
        brandLabel={`${brand.bankName} × DRTS`}
        brandSubLabel={brand.host}
        brandMark={brand.cardArt.badgeText}
        breadcrumb={[brand.displayName, "Partner Booking", "入口"]}
        topRight={
          <CanvasPill theme={theme} tone="accent" dot>
            EXCLUSIVE
          </CanvasPill>
        }
        env="partner"
        versionLabel="landing v2"
        searchPlaceholder="搜尋服務 / 上下車地點 / 趟次"
        style={{ height: "100%" }}
      >
        <CanvasPageHeader
          theme={theme}
          sticky={false}
          title="禮賓接送 Concierge"
          subtitle={`${brand.programName} 卡友專屬 · 全年免費 ${totalBenefits} 趟`}
          actions={
            <>
              <CanvasPill theme={theme} tone="info">
                {brand.host}
              </CanvasPill>
              <CanvasBtn theme={theme} variant="secondary" icon="reports">
                查看歷史趟次
              </CanvasBtn>
              <CanvasBtn theme={theme} variant="primary" icon="arrow">
                立即建立行程
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
              label="本年度剩餘趟次"
              value={`${remainingBenefits} / ${totalBenefits}`}
              delta={remainingRatio}
              deltaTone="up"
              sub="2026 年度免費禮遇"
              hint={benefitId}
            />
            <CanvasKPI
              theme={theme}
              label="持卡狀態"
              value="eligible"
              delta="200 OK"
              deltaTone="up"
              sub="booking gate 可建立行程"
              hint={verificationId}
            />
            <CanvasKPI
              theme={theme}
              label="客服專線"
              value={brand.hotline.phone}
              sub={brand.hotline.label}
              hint={brand.tenantCode}
            />
          </div>

          <CanvasBanner
            theme={theme}
            tone="accent"
            icon="warn"
            title="禮遇條款"
            body={`當每年免費 ${totalBenefits} 趟額度用完後，每趟仍享 8 折優惠；費用合併至本卡帳單，不需現場付款。完整條款請參閱本卡權益文件 v23.4。`}
          />

          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "minmax(0, 2.2fr) minmax(300px, 1fr)",
            }}
          >
            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title="可使用的服務"
                subtitle="密集表格 · mono 服務代碼 · status pills"
                actions={
                  <CanvasPill theme={theme} tone="info" dot>
                    {services.length} 項
                  </CanvasPill>
                }
                padding={0}
              >
                <CanvasTable
                  theme={theme}
                  columns={serviceColumns}
                  rows={serviceRows}
                  dense
                />
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="立即建立行程"
                subtitle="上車點 / 下車點 / 出發時間"
                actions={
                  <CanvasPill theme={theme} tone="accent" dot>
                    {routeState}
                  </CanvasPill>
                }
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <CanvasField
                    theme={theme}
                    label="上車點"
                    hint="支援飯店 / 機場 / 商辦地址 · 自動補齊地標。"
                    required
                  >
                    <CanvasInput
                      theme={theme}
                      value="台北市信義區松仁路 100 號"
                      prefix="A"
                      suffix="HQ"
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label="下車點"
                    hint="支援航廈 / 商務地址 / 自訂目的地。"
                    required
                  >
                    <CanvasInput
                      theme={theme}
                      value="桃園機場 第二航廈 出境 7 號門"
                      prefix="B"
                      suffix="T2"
                    />
                  </CanvasField>
                  <CanvasField
                    theme={theme}
                    label="出發時間"
                    hint="可選擇立即派車或預約 60 分鐘後。"
                  >
                    <CanvasInput
                      theme={theme}
                      value="2026-05-15 17:30"
                      mono
                      suffix="ASAP"
                    />
                  </CanvasField>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <CanvasBtn theme={theme} variant="primary" icon="arrow">
                      立即叫車
                    </CanvasBtn>
                    <CanvasBtn theme={theme} variant="secondary" icon="copy">
                      預約時段
                    </CanvasBtn>
                    <CanvasBtn theme={theme} variant="ghost" icon="more">
                      更多服務
                    </CanvasBtn>
                  </div>
                </div>
              </CanvasCard>
            </div>

            <div style={{ display: "grid", gap: 16 }}>
              <CanvasCard
                theme={theme}
                title="本卡資訊"
                subtitle="card last4 + partner program"
                style={{
                  background: `linear-gradient(180deg, rgba(15, 23, 42, 0.65) 0%, ${theme.bg} 100%)`,
                }}
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 36,
                        borderRadius: 8,
                        background: `linear-gradient(135deg, ${brand.cardArt.gradientFrom}, ${brand.cardArt.gradientTo})`,
                        position: "relative",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          right: 6,
                          bottom: 6,
                          width: 12,
                          height: 12,
                          borderRadius: 3,
                          background: brand.accent,
                        }}
                      />
                    </div>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span
                        style={{
                          fontFamily: theme.monoFamily,
                          fontSize: 13,
                          color: theme.text,
                          fontWeight: 700,
                          letterSpacing: 0.4,
                        }}
                      >
                        •••• •••• •••• {brand.cardArt.lastFour}
                      </span>
                      <span style={{ fontSize: 11, color: theme.textMuted }}>
                        {brand.cardArt.issuerLabel} · {brand.programName}
                      </span>
                    </div>
                    <div style={{ marginLeft: "auto" }}>
                      <CanvasPill theme={theme} tone="success" dot>
                        eligible
                      </CanvasPill>
                    </div>
                  </div>
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        label: "持卡身份",
                        value: brand.programName,
                      },
                      {
                        label: "卡號末四碼",
                        value: brand.cardArt.lastFour,
                        mono: true,
                      },
                      {
                        label: "本年度禮遇",
                        value: `${totalBenefits} 趟`,
                        mono: true,
                      },
                      {
                        label: "重置日",
                        value: "2027-01-01",
                        mono: true,
                      },
                      {
                        label: "服務範圍",
                        value: "台北 / 桃園 / 新竹",
                      },
                      {
                        label: "路由政策",
                        value: "partner booking only",
                        mono: true,
                      },
                    ]}
                  />
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="額度進度"
                subtitle="2026 年度 benefit progress"
                actions={
                  <CanvasPill theme={theme} tone="accent" dot>
                    {brand.programName}
                  </CanvasPill>
                }
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: theme.textMuted,
                        fontWeight: 600,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                      }}
                    >
                      本年度剩餘
                    </span>
                    <span
                      style={{
                        fontFamily: theme.monoFamily,
                        color: theme.text,
                        fontSize: 13,
                      }}
                    >
                      <b style={{ fontSize: 22, color: theme.accent }}>
                        {remainingBenefits}
                      </b>{" "}
                      / {totalBenefits} 趟
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      borderRadius: 999,
                      background: theme.surfaceLo,
                      overflow: "hidden",
                      border: `1px solid ${theme.border}`,
                    }}
                  >
                    <div
                      style={{
                        width: remainingRatio,
                        height: "100%",
                        background: brand.accent,
                      }}
                    />
                  </div>
                  <CanvasDL
                    theme={theme}
                    cols={2}
                    items={[
                      {
                        label: "已使用",
                        value: `${usedBenefits} 趟`,
                        mono: true,
                      },
                      {
                        label: "剩餘",
                        value: `${remainingBenefits} 趟`,
                        mono: true,
                      },
                      {
                        label: "額度後折扣",
                        value: "8 折",
                      },
                      {
                        label: "結算方式",
                        value: "本卡帳單合併",
                      },
                    ]}
                  />
                </div>
              </CanvasCard>

              <CanvasCard
                theme={theme}
                title="客服支援"
                subtitle="hotline + helpdesk"
                actions={
                  <CanvasPill theme={theme} tone="info" dot>
                    24h
                  </CanvasPill>
                }
              >
                <div style={{ display: "grid", gap: 12 }}>
                  <CanvasDL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        label: brand.hotline.label,
                        value: brand.hotline.phone,
                        mono: true,
                      },
                      {
                        label: "服務說明",
                        value: brand.hotline.note,
                      },
                      {
                        label: "host",
                        value: brand.host,
                        mono: true,
                      },
                    ]}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <CanvasBtn theme={theme} variant="primary" icon="phone">
                      撥打客服
                    </CanvasBtn>
                    <CanvasBtn theme={theme} variant="secondary" icon="copy">
                      複製專線
                    </CanvasBtn>
                  </div>
                </div>
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

  if (resolvedRouteState.activeScreen === "landing") {
    return (
      <PartnerLandingWorkspace
        brand={brand}
        tenantSlug={tenantSlug}
        routeState={routeState}
      />
    );
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

  if (resolvedRouteState.activeScreen === "trips") {
    return (
      <PartnerTripsWorkspace
        brand={brand}
        tenantSlug={tenantSlug}
        routeState={routeState}
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
