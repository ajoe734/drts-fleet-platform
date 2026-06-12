import {
  EnterpriseBanner,
  EnterpriseBtn,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
} from "@/components/enterprise-primitives";
import { EnterpriseEmbedShell } from "@/components/enterprise-shell";
import { embedStateFixtures } from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

export default function EmbeddedPreviewPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="Embedded Identity States"
        subtitle="企業 App 內嵌版 compact chrome 與身分交付狀態總覽；不顯示後台導覽或管理憑證輸入。"
        sticky={false}
      />

      <EnterpriseBanner
        tone="info"
        title="Embed contract"
        body="只接受受信任 host 的 tenant-scoped handoff；若 session 失效、host 不受信任或缺少 consent，僅顯示 support-safe 引導。"
      />

      <div style={{ display: "grid", gap: 24 }}>
        {Object.values(embedStateFixtures).map((state) => (
          <EnterpriseEmbedShell
            key={state.code}
            host={state.host}
            state={state.shellState}
          >
            <div
              style={{
                padding: 16,
                display: "grid",
                gap: 16,
                alignContent: "start",
              }}
            >
              <EnterpriseCard
                title={state.title}
                actions={
                  <EnterprisePill tone={state.tone}>{state.code}</EnterprisePill>
                }
              >
                <div style={{ display: "grid", gap: 14 }}>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700 }}>
                      {state.summary}
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        color: enterpriseTheme.textMuted,
                        lineHeight: 1.6,
                      }}
                    >
                      {state.body}
                    </div>
                  </div>
                  <EnterpriseDl cols={2} items={Array.from(state.facts)} />
                </div>
              </EnterpriseCard>

              <EnterpriseCard title="入口操作">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {state.actions.map((action, index) => (
                    <EnterpriseBtn
                      key={action}
                      variant={index === 0 ? "primary" : "secondary"}
                    >
                      {action}
                    </EnterpriseBtn>
                  ))}
                </div>
              </EnterpriseCard>
            </div>
          </EnterpriseEmbedShell>
        ))}
      </div>
    </div>
  );
}
