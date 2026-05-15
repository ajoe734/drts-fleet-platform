import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import {
  Banner,
  Btn,
  Card,
  KPI,
  PageHeader,
  Pill,
  Shell,
  Table,
  WindowChrome,
  buildCanvasTheme,
  type CanvasTheme,
} from "./canvas-primitives";

const canvasBaseSrc = "/drts-design-canvas/Tenant%20Console.html#home";

const tenantTheme = buildCanvasTheme({
  surface: "tenant",
  dark: false,
  density: "compact",
});

const tenantNav = [
  { divider: "工作面" },
  { key: "home", href: "/", icon: "home", label: "首頁" },
  {
    key: "bookings",
    href: "/bookings",
    icon: "bookings",
    label: "叫車",
    badge: "5",
    badgeTone: "accent" as const,
  },
  {
    key: "newbooking",
    href: "/bookings/new",
    icon: "plus",
    label: "建立叫車",
  },
  { divider: "通訊錄" },
  { key: "passengers", href: "/passengers", icon: "passengers", label: "乘客" },
  { key: "addresses", href: "/addresses", icon: "addresses", label: "地址簿" },
  {
    key: "costcenter",
    href: "/cost-centers",
    icon: "billing",
    label: "成本中心",
  },
  { key: "rules", href: "/rules", icon: "flags", label: "審批與配額" },
  { divider: "帳務" },
  { key: "invoices", href: "/invoices", icon: "billing", label: "對帳單" },
  { key: "reports", href: "/reports", icon: "reports", label: "報表" },
  { divider: "整合" },
  {
    key: "apikeys",
    href: "/integrations/keys",
    icon: "apiKeys",
    label: "API 金鑰",
  },
  {
    key: "webhooks",
    href: "/webhooks",
    icon: "webhooks",
    label: "Webhook",
  },
  { key: "audit", href: "/audit", icon: "audit", label: "稽核" },
  { divider: "組織" },
  { key: "users", href: "/users", icon: "users", label: "人員與角色" },
  { key: "settings", href: "/settings", icon: "flags", label: "租戶設定" },
];

const homeBookings = [
  {
    id: "bk_5512",
    orderId: "ord_8232",
    passenger: "林士群",
    pickup: "台北市信義區松仁路 100 號",
    win: "2026-05-08 14:30",
    state: "completed",
  },
  {
    id: "bk_5513",
    orderId: "ord_8231",
    passenger: "劉怡君",
    pickup: "新竹科學園區 力行六路 8 號",
    win: "2026-05-08 15:30–15:45",
    state: "broadcasting",
  },
  {
    id: "bk_5514",
    orderId: "ord_8233",
    passenger: "鄭心怡",
    pickup: "台北市大安區仁愛路四段 99 號",
    win: "2026-05-08 16:10–16:30",
    state: "queued",
  },
  {
    id: "bk_5515",
    orderId: "–",
    passenger: "林士群",
    pickup: "台北市中正區忠孝西路一段 49 號",
    win: "2026-05-09 19:00",
    state: "draft",
  },
  {
    id: "bk_5510",
    orderId: "ord_8220",
    passenger: "陳秀英",
    pickup: "台大醫院 西址 醫療大樓",
    win: "2026-05-07 11:20",
    state: "completed",
  },
] as const;

function bookingTone(state: string) {
  switch (state) {
    case "completed":
      return "success" as const;
    case "broadcasting":
      return "info" as const;
    case "assigned":
      return "success" as const;
    default:
      return "warn" as const;
  }
}

function ComparisonFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: "12px", alignContent: "start" }}>
      <div style={{ display: "grid", gap: "4px" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#475569",
          }}
        >
          {title}
        </div>
        <div style={{ fontSize: "13px", color: "#64748b", lineHeight: 1.5 }}>
          {subtitle}
        </div>
      </div>
      {children}
    </section>
  );
}

function HomeBuiltView({ theme }: { theme: CanvasTheme }) {
  return (
    <WindowChrome width={1440} height={900}>
      <Shell
        theme={theme}
        nav={tenantNav}
        active="home"
        breadcrumb={["YAMATO 大和商務集團", "首頁"]}
        env="production"
      >
        <PageHeader
          theme={theme}
          title="您好，張俐萱"
          subtitle="2026-05-08 (週五) · 本月配額 3,820 / 5,000 趟"
          actions={
            <>
              <Btn theme={theme} icon="ext">
                幫助中心
              </Btn>
              <Btn theme={theme} variant="primary" icon="plus">
                建立叫車
              </Btn>
            </>
          }
        />
        <div
          style={{
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <KPI
              theme={theme}
              label="進行中"
              value="14"
              sub="3 broadcasting · 11 assigned"
            />
            <KPI
              theme={theme}
              label="今日已完成"
              value="38"
              delta="↑ 6"
              deltaTone="up"
            />
            <KPI
              theme={theme}
              label="本月用量"
              value="3,820"
              sub="76% of 5,000"
            />
            <KPI
              theme={theme}
              label="當期帳單"
              value="NT$ 1.22M"
              delta="2026-04 · 待確認"
              deltaTone="neutral"
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.4fr 1fr",
              gap: 16,
            }}
          >
            <Card
              theme={theme}
              title="進行中訂單"
              padding={0}
              actions={
                <Btn theme={theme} variant="ghost">
                  前往叫車
                </Btn>
              }
            >
              <Table
                theme={theme}
                columns={[
                  {
                    h: "BK",
                    w: 100,
                    mono: true,
                    r: (row) => (
                      <span style={{ color: theme.accent, fontWeight: 600 }}>
                        {row.id}
                      </span>
                    ),
                  },
                  { h: "PASS.", k: "passenger", w: 110 },
                  { h: "PICKUP", k: "pickup" },
                  { h: "WIN", k: "win", w: 150, mono: true },
                  {
                    h: "STATE",
                    w: 130,
                    r: (row) => (
                      <Pill theme={theme} tone={bookingTone(row.state)} dot>
                        {row.state}
                      </Pill>
                    ),
                  },
                ]}
                rows={homeBookings}
              />
            </Card>

            <Card theme={theme} title="提醒">
              <Banner
                theme={theme}
                tone="warn"
                icon="warn"
                title="Webhook wh_03 已暫停 2 天"
                body="staging 端點測試中，恢復前不會收到事件。"
                actions={
                  <Btn theme={theme} variant="ghost">
                    查看
                  </Btn>
                }
              />
              <div style={{ height: 8 }} />
              <Banner
                theme={theme}
                tone="info"
                icon="warn"
                title="2026-05-15 02:00–04:00 平台維護"
                body="計畫性維護，派遣將暫停 2 小時。"
              />
              <div style={{ height: 8 }} />
              <Banner
                theme={theme}
                tone="success"
                icon="check"
                title="本月 SLA 達 99.4%"
                body="超過合約 SLA 99.0%。"
              />
            </Card>
          </div>
        </div>
      </Shell>
    </WindowChrome>
  );
}

const meta = {
  title: "Tenant Console/Home",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Canvas parity review for `TN_Home`. The built panel uses the new canvas primitives from `@drts/ui-web/canvas-primitives`, while the reference panel embeds `Tenant Console.html#home`. The current HTML file ships with light tweak defaults; the exported dark navy tokens are available separately via `buildCanvasTheme({ dark: true })`.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Home: Story = {
  render: () => (
    <div style={{ padding: "24px", background: "#e2e8f0" }}>
      <div style={{ display: "grid", gap: "16px" }}>
        <div style={{ display: "grid", gap: "4px" }}>
          <div
            style={{
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#475569",
            }}
          >
            Tenant Home Canvas Review
          </div>
          <div style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>
            Built TN_Home and the shipped `Tenant Console.html#home` artboard
            are rendered together for side-by-side review.
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(760px, 1fr))",
            gap: "16px",
            alignItems: "start",
            overflowX: "auto",
          }}
        >
          <ComparisonFrame
            title="Built"
            subtitle="`@drts/ui-web/canvas-primitives` composed into the TN_Home shell."
          >
            <div
              style={{
                minWidth: "760px",
                overflow: "auto",
                borderRadius: "24px",
                border: "1px solid #cbd5e1",
                background: "#d6d3d1",
              }}
            >
              <HomeBuiltView theme={tenantTheme} />
            </div>
          </ComparisonFrame>
          <ComparisonFrame
            title="Canvas"
            subtitle="`docs/05-ui/drts-design-canvas/Tenant Console.html#home`"
          >
            <iframe
              src={canvasBaseSrc}
              title="TN_Home canvas reference"
              style={{
                width: "100%",
                minWidth: "760px",
                height: "980px",
                border: "1px solid #cbd5e1",
                borderRadius: "24px",
                background: "#ffffff",
              }}
            />
          </ComparisonFrame>
        </div>
      </div>
    </div>
  ),
};
