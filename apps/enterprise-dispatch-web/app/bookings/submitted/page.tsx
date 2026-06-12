import Link from "next/link";
import {
  EnterpriseBanner,
  EnterpriseCard,
  EnterpriseDl,
  EnterprisePageHeader,
  EnterprisePill,
} from "@/components/enterprise-primitives";
import { enterpriseBookingDraft } from "@/lib/enterprise-fixtures";
import { enterprisePageStyle, enterpriseTheme } from "@/lib/enterprise-theme";

export default function SubmittedBookingPage() {
  return (
    <div style={{ ...enterprisePageStyle, maxWidth: 920 }}>
      <EnterprisePageHeader
        title="已受理"
        subtitle="create command 已接受，接下來等待審批與派車結果。"
        actions={<EnterprisePill tone="warn">accepted + pending</EnterprisePill>}
      />

      <EnterpriseBanner
        tone="info"
        title="不要重複送出"
        body="這個畫面代表命令已進入後端流程，後續是否立即確認派車仍取決於審批與供應狀態。"
      />

      <EnterpriseCard title="送出摘要">
        <EnterpriseDl
          cols={2}
          items={[
            { k: "乘客", v: enterpriseBookingDraft.passenger },
            { k: "下單人", v: enterpriseBookingDraft.bookedBy },
            { k: "成本中心", v: enterpriseBookingDraft.costCenter, mono: true },
            { k: "預估結果", v: "等待主管審批後建立 booking detail" },
          ]}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <Link
            href="/approval-pending"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 34,
              padding: "8px 12px",
              borderRadius: 10,
              background: enterpriseTheme.surface,
              border: `1px solid ${enterpriseTheme.border}`,
              color: enterpriseTheme.text,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            查看待審批狀態
          </Link>
          <Link
            href="/bookings"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 34,
              padding: "8px 12px",
              borderRadius: 10,
              background: enterpriseTheme.accent,
              border: `1px solid ${enterpriseTheme.accent}`,
              color: enterpriseTheme.surface,
              fontSize: 12.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            前往我的預約
          </Link>
        </div>
      </EnterpriseCard>
    </div>
  );
}
