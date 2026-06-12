import {
  EnterpriseBanner,
  EnterpriseBtn,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
} from "@/components/enterprise-primitives";
import { EnterpriseEmbedShell } from "@/components/enterprise-shell";
import { enterprisePageStyle } from "@/lib/enterprise-theme";

export default function EmbeddedPreviewPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="Embedded Shell Preview"
        subtitle="企業 App 內嵌版的 compact chrome，不顯示後台導覽。"
        sticky={false}
      />
      <EnterpriseEmbedShell host="hongshuo-workspace" state="live">
        <div style={{ padding: 16, display: "grid", gap: 16 }}>
          <EnterpriseCard
            title="Host hand-off"
            actions={<EnterprisePill tone="success">handoff ok</EnterprisePill>}
          >
            <EnterpriseDl
              cols={2}
              items={[
                { k: "來源", v: "企業 App", mono: true },
                { k: "身分", v: "tenant-scoped session accepted" },
                { k: "模式", v: "compact chrome + self-service flow" },
                { k: "限制", v: "不顯示 admin / ops 導覽" },
              ]}
            />
          </EnterpriseCard>

          <EnterpriseBanner
            tone="info"
            title="內嵌狀態模板"
            body="同一套 booking flow 可依 handoff_ok、reauth_required、unsupported_host、fallback_to_web 切換。"
          />

          <EnterpriseCard title="入口操作">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <EnterpriseBtn variant="primary">繼續建立預約</EnterpriseBtn>
              <EnterpriseBtn variant="secondary">回到企業網站版</EnterpriseBtn>
            </div>
          </EnterpriseCard>
        </div>
      </EnterpriseEmbedShell>
    </div>
  );
}
