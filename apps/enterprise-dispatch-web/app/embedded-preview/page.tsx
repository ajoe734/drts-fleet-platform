import {
  EnterpriseBtn,
  EnterpriseCard,
  EnterpriseDl,
  EnterpriseField,
  EnterpriseInput,
  EnterprisePageHeader,
  EnterprisePill,
  EnterpriseSelect,
} from "@/components/enterprise-primitives";
import { EnterpriseEmbedShell } from "@/components/enterprise-shell";
import { enterprisePageStyle } from "@/lib/enterprise-theme";

export default function EmbeddedPreviewPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="Embedded Shell Preview"
        subtitle="Compact host chrome for embedded operator dispatch entry points."
        sticky={false}
      />
      <EnterpriseEmbedShell host="tenant portal" state="live">
        <div style={{ padding: 16, display: "grid", gap: 16 }}>
          <EnterpriseCard
            title="Embedded dispatch handoff"
            actions={<EnterprisePill tone="success">session resolved</EnterprisePill>}
          >
            <EnterpriseDl
              cols={2}
              items={[
                { k: "Entry", v: "cross-app dispatch launch" },
                { k: "Source", v: "tenant portal", mono: true },
                { k: "Context", v: "dispatch-only tools inside host frame" },
                { k: "Security", v: "no admin shell bleed-through" },
              ]}
            />
          </EnterpriseCard>

          <EnterpriseCard title="Quick action tray">
            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              }}
            >
              <EnterpriseField
                label="Dispatch ID"
                hint="Embed can arrive with host-selected context."
              >
                <EnterpriseInput mono value="ord_8234" suffix="resolved" />
              </EnterpriseField>
              <EnterpriseField
                label="Action mode"
                hint="Compact controls use the same primitive kit."
              >
                <EnterpriseSelect value="Manual review" />
              </EnterpriseField>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <EnterpriseBtn variant="primary">Resume dispatch</EnterpriseBtn>
              <EnterpriseBtn variant="secondary">Open full shell</EnterpriseBtn>
            </div>
          </EnterpriseCard>
        </div>
      </EnterpriseEmbedShell>
    </div>
  );
}
