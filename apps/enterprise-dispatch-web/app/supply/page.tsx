import {
  EnterpriseCard,
  EnterpriseDl,
  EnterpriseEmptyState,
  EnterpriseKpi,
  EnterpriseKpiGrid,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import { enterprisePageStyle } from "@/lib/enterprise-theme";

export default function SupplyPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="Supply Coverage"
        subtitle="Shared monitoring surface primitives for later no-supply and degraded-coverage screens."
      />
      <EnterpriseKpiGrid minWidth={200}>
        <EnterpriseKpi
          label="Coverage windows"
          value="4"
          sub="regional watch buckets"
          hint="coverage_shell"
        />
        <EnterpriseKpi
          label="Hotspots"
          value="1"
          delta="attention"
          deltaTone="down"
          sub="artboard still pending"
          hint="no_supply"
        />
      </EnterpriseKpiGrid>
      <EnterpriseSection>
        <EnterpriseCard
          title="Supply shell"
          actions={<EnterprisePill tone="danger">coverage alert</EnterprisePill>}
        >
          <EnterpriseDl
            cols={2}
            items={[
              { k: "Shell intent", v: "dense operator monitoring surface" },
              { k: "Expected modules", v: "watchlist, map, partner detail" },
              { k: "Reuse path", v: "enterprise wrappers from /components" },
              { k: "Blocked input", v: "screen-level supply artboards" },
            ]}
          />
        </EnterpriseCard>
        <EnterpriseEmptyState
          title="Live supply panels remain undefined"
          body="No checked-in design canvas defines the monitoring board, outage surface, or supply detail drawer for this route yet."
        />
      </EnterpriseSection>
    </div>
  );
}
