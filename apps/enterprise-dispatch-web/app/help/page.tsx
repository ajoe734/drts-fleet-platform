import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterpriseSection,
} from "@/components/enterprise-primitives";
import {
  enterpriseSupportFaq,
  enterpriseTenant,
  policyNotes,
} from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

export default function HelpPage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title="說明與支援"
        subtitle="企業用車政策、常見問題與客服資訊。"
      />

      <EnterpriseBanner
        tone="info"
        title="accepted + pending 為正常流程"
        body="系統可能先回覆已受理，再於確認或審批完成後更新狀態；不需要重複送出。"
      />

      <EnterpriseSection>
        <EnterpriseCard title="常見政策">
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
            {policyNotes.map((note) => (
              <li
                key={note}
                style={{ fontSize: 12.5, color: enterpriseTheme.text }}
              >
                {note}
              </li>
            ))}
          </ul>
        </EnterpriseCard>

        <EnterpriseCard title="支援聯絡">
          <EnterpriseDl
            cols={1}
            items={[
              {
                k: "企業客服",
                v: `${enterpriseTenant.supportPhone} · 24h`,
                mono: true,
              },
              {
                k: "支援信箱",
                v: enterpriseTenant.supportEmail,
                mono: true,
              },
              { k: "升級處理", v: "成本中心更正、報帳問題、人工支援" },
              {
                k: "通道定位",
                v: "本前台僅供員工 / 行政自助預約，不提供後台治理模組",
              },
            ]}
          />
        </EnterpriseCard>

        <EnterpriseCard title="常見問題">
          <div style={{ display: "grid", gap: 12 }}>
            {enterpriseSupportFaq.map((item) => (
              <div key={item.q}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>{item.q}</div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12.5,
                    color: enterpriseTheme.textMuted,
                    lineHeight: 1.5,
                  }}
                >
                  {item.a}
                </div>
              </div>
            ))}
          </div>
        </EnterpriseCard>
      </EnterpriseSection>
    </div>
  );
}
