import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterpriseEmptyState,
  EnterpriseKpi,
  EnterpriseKpiGrid,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
  EnterpriseStaleBanner,
} from "@/components/enterprise-primitives";
import { EnterpriseShellActions } from "@/components/enterprise-shell";
import {
  enterpriseCardGridStyle,
  enterprisePageStyle,
} from "@/lib/enterprise-theme";

export default function HomePage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="Dispatch Overview"
        subtitle="Enterprise dispatch shell primitives aligned to the shared management canvas layer, without inheriting tenant admin or partner booking chrome."
        actions={
          <EnterpriseShellActions />
        }
      />

      <EnterpriseStaleBanner
        freshness="degraded"
        title="Screen scope remains canvas-bounded"
        body="The repo still lacks a dedicated Enterprise Dispatch artboard, so this surface lands the shared shell, embed chrome, and primitives only."
      />

      <EnterpriseKpiGrid>
        <EnterpriseKpi
          label="Queues"
          value="3"
          delta="+1"
          deltaTone="up"
          sub="overview, reassignments, supply coverage"
          hint="shell_scope"
        />
        <EnterpriseKpi
          label="Health"
          value="healthy"
          sub="sidebar footer mirrors shared shell contract"
          hint="ui_health_envelope"
        />
        <EnterpriseKpi
          label="Embed"
          value="ready"
          sub="host chrome and webview status available"
          hint="embedded_shell"
        />
      </EnterpriseKpiGrid>

      <div style={enterpriseCardGridStyle}>
        <EnterpriseCard
          title="Shell contract"
          actions={<EnterprisePill tone="ops">ops realm</EnterprisePill>}
        >
          <EnterpriseDl
            cols={1}
            items={[
              { k: "Source", v: "mgmt-shell.jsx / ui-tokens ops realm" },
              { k: "Navigation", v: "dispatch-only; no admin IA inheritance" },
              { k: "Topbar", v: "refresh tier, alerts, identity chip" },
              { k: "Footer", v: "health envelope with last checked timestamp" },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseCard
          title="Primitives in app"
          actions={<EnterprisePill tone="info">base kit</EnterprisePill>}
        >
          <EnterpriseDl
            cols={1}
            items={[
              { k: "Wrapped", v: "header, card, KPI, DL, field, input, select" },
              { k: "Status", v: "pill, banner, stale banner, buttons" },
              { k: "Layout", v: "page stack and KPI grid helpers" },
              { k: "Usage", v: "future screens import enterprise wrappers only" },
            ]}
          />
        </EnterpriseCard>
      </div>

      <EnterpriseSection>
        <EnterpriseBanner
          tone="info"
          title="Embedded shell preview available"
          body="Use the embedded preview route to validate host chrome, webview state, and compact operator actions."
          actions={
            <Link
              href="/embedded-preview"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 24,
                padding: "4px 8px",
                borderRadius: 7,
                border: "1px solid currentColor",
                textDecoration: "none",
                fontSize: 11.5,
                fontWeight: 500,
              }}
            >
              Open preview
            </Link>
          }
        />
        <EnterpriseEmptyState
          title="Workflow boards intentionally deferred"
          body="Queue composition, reassignment state machine screens, and detail drawers remain blocked on a dedicated Enterprise Dispatch design canvas."
        />
      </EnterpriseSection>
    </div>
  );
}
