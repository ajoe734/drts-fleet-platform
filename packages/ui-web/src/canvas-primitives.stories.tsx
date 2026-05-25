import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import {
  CanvasActionButton,
  CanvasActionReceipt,
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasDL,
  CanvasEmptyState,
  CanvasHealthBanner,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasShell,
  CanvasStaleBanner,
  CanvasTable,
  CanvasWindowChrome,
  buildCanvasTheme,
  type CanvasShellNavItem,
  type CanvasTableColumn,
} from "./index";

const opsTheme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const adminTheme = buildCanvasTheme({
  surface: "admin",
  density: "compact",
});

const tenantTheme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const nav: CanvasShellNavItem[] = [
  { divider: "Workspace" },
  {
    key: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: "dashboard",
  },
  {
    key: "dispatch",
    href: "/dispatch",
    label: "Dispatch",
    icon: "dispatch",
    badge: 8,
    badgeTone: "accent",
  },
  {
    key: "complaints",
    href: "/complaints",
    label: "Complaints",
    icon: "complaints",
    badge: 2,
    badgeTone: "warn",
  },
  { divider: "Registry" },
  { key: "drivers", href: "/drivers", label: "Drivers", icon: "users" },
  { key: "vehicles", href: "/vehicles", label: "Vehicles", icon: "vehicles" },
];

type QueueRow = Record<string, unknown> & {
  item: string;
  state: string;
  eta: string;
  assignee: string;
};

const columns: CanvasTableColumn<QueueRow>[] = [
  { h: "Item", k: "item" },
  { h: "State", k: "state" },
  { h: "ETA", k: "eta", mono: true, w: 80 },
  { h: "Assignee", k: "assignee" },
];

const rows: QueueRow[] = [
  {
    item: "OWN-240525-018",
    state: "override_pending",
    eta: "04m",
    assignee: "OC-12",
  },
  {
    item: "FWD-240525-077",
    state: "sync_delayed",
    eta: "09m",
    assignee: "adapter",
  },
];

function OpsCanvasShowcase() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(252, 165, 165, 0.2), transparent 20%), #070c14",
        padding: 12,
      }}
    >
      <CanvasWindowChrome
        width="100%"
        height="100vh"
        outerPadding={12}
        style={{ minHeight: "100vh" }}
        contentStyle={{ background: opsTheme.bg }}
      >
        <CanvasShell
          theme={opsTheme}
          nav={nav}
          active="dashboard"
          currentPath="/dashboard"
          brandLabel="DRTS Fleet"
          brandSubLabel="Ops Console"
          breadcrumb={["Operations", "Dashboard"]}
          env="production"
          tenant="shared"
          actor={{ name: "OC", display: "Lin YJ" }}
          health={{
            status: "degraded",
            lastCheckedAt: "12s",
            degradedServices: [
              { service: "adapter_registry", impact: "sync lag" },
            ],
          }}
          refreshTier="medium"
          dataFreshness="stale"
          healthBanner={
            <CanvasHealthBanner
              theme={opsTheme}
              status="degraded"
              degradedServices={[
                { service: "adapter_registry", impact: "forwarded ETA stale" },
              ]}
            />
          }
          versionLabel="canvas-v0.6"
          searchPlaceholder="搜尋訂單、司機、案件…"
          avatarLabel="OC"
          style={{ height: "100%" }}
        >
          <CanvasPageHeader
            theme={opsTheme}
            title="Operations dashboard"
            subtitle="Canvas v0.6 shell, health, stale, empty, and receipt states in one smoke surface."
            meta={
              <>
                <CanvasPill theme={opsTheme} tone="accent">
                  T3 medium
                </CanvasPill>
                <CanvasPill theme={opsTheme} tone="warn" dot>
                  stale data
                </CanvasPill>
              </>
            }
            actions={
              <>
                <CanvasBtn theme={opsTheme} variant="secondary" icon="refresh">
                  Refresh
                </CanvasBtn>
                <CanvasBtn theme={opsTheme} variant="primary" icon="plus">
                  New escalation
                </CanvasBtn>
              </>
            }
            tabs={[
              { id: "overview", label: "Overview", badge: 3, tone: "accent" },
              { id: "alerts", label: "Alerts", badge: 2, tone: "warn" },
              { id: "receipts", label: "Receipts" },
            ]}
            activeTab="overview"
          />

          <div
            style={{
              padding: 24,
              display: "grid",
              gap: 16,
            }}
          >
            <CanvasStaleBanner
              theme={opsTheme}
              tier="medium"
              dataFreshness="stale"
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 10,
              }}
            >
              <CanvasKPI
                theme={opsTheme}
                label="Queued work"
                value="124"
                delta="+6"
                deltaTone="up"
              />
              <CanvasKPI
                theme={opsTheme}
                label="Critical alerts"
                value="02"
                delta="-1"
                deltaTone="down"
              />
              <CanvasKPI
                theme={opsTheme}
                label="Dispatch SLA"
                value="96.3%"
                hint="generatedAt=15:25Z"
              />
              <CanvasKPI
                theme={opsTheme}
                label="Forwarded lag"
                value="18s"
                sub="adapter_registry"
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 1fr)",
                gap: 16,
                alignItems: "start",
              }}
            >
              <CanvasCard
                theme={opsTheme}
                title="Dispatch queue"
                subtitle="Action state stays backend-driven."
                actions={
                  <>
                    <CanvasActionButton
                      theme={opsTheme}
                      descriptor={{ enabled: true, riskLevel: "medium" }}
                      icon="dispatch"
                      label="Redispatch"
                    />
                    <CanvasActionButton
                      theme={opsTheme}
                      descriptor={{
                        enabled: false,
                        riskLevel: "high",
                        disabledReasonCode: "permission_denied",
                        requiresReason: true,
                      }}
                      icon="lock"
                      label="Force offline"
                    />
                  </>
                }
              >
                <CanvasTable theme={opsTheme} columns={columns} rows={rows} />
              </CanvasCard>

              <div style={{ display: "grid", gap: 16 }}>
                <CanvasCard theme={opsTheme} title="Empty-state contract">
                  <CanvasEmptyState
                    theme={opsTheme}
                    reason="external_unavailable"
                    nextAction={
                      <CanvasBtn
                        theme={opsTheme}
                        size="sm"
                        icon="ext"
                        variant="primary"
                      >
                        Open adapter registry
                      </CanvasBtn>
                    }
                  />
                </CanvasCard>

                <CanvasActionReceipt
                  theme={opsTheme}
                  status="completed"
                  title="Dispatch override published"
                  message="Manual fare override receipt includes audit linkage and cross-app deep link affordances."
                  auditId="aud_20260525_8821"
                  auditLink={{
                    label: "View audit",
                    href: "/audit?auditId=aud_20260525_8821",
                    openMode: "new_tab",
                    crossApp: true,
                  }}
                  resourceLink={{
                    label: "Open reconciliation",
                    href: "/reconciliation/orders/OWN-240525-018",
                    openMode: "new_tab",
                  }}
                />
              </div>
            </div>
          </div>
        </CanvasShell>
      </CanvasWindowChrome>
    </div>
  );
}

function AccentPalette() {
  const themes = [adminTheme, opsTheme, tenantTheme];

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <CanvasBanner
        theme={adminTheme}
        tone="info"
        icon="info"
        title="v0.6 accent derivation"
        body="admin / ops / tenant accents are derivable directly from buildCanvasTheme() with the updated surface model."
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 16,
        }}
      >
        {themes.map((theme) => (
          <CanvasCard
            key={theme.surfaceKey}
            theme={theme}
            title={theme.surfaceName}
            subtitle={theme.surfaceTagline}
          >
            <CanvasDL
              theme={theme}
              cols={1}
              monoVal
              items={[
                { k: "accent", v: theme.accent },
                { k: "accentHi", v: theme.accentHi },
                { k: "accentBg", v: theme.accentBg },
                { k: "accentBorder", v: theme.accentBorder },
              ]}
            />
          </CanvasCard>
        ))}
      </div>
    </div>
  );
}

const meta = {
  title: "Canvas/V0.6 Primitives",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Smoke surface for the refreshed canvas tokens and primitives. This story exercises the shell, stale/health states, action descriptors, receipts, and accent derivation from the v0.6 design canvas.",
      },
    },
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const OpsDark: Story = {
  render: () => <OpsCanvasShowcase />,
};

export const AccentDerivation: Story = {
  render: () => <AccentPalette />,
};
