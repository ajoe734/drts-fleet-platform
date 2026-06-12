import Link from "next/link";
import {
  EnterpriseCard,
  EnterpriseDl,
  EnterpriseKpi,
  EnterpriseKpiGrid,
  EnterprisePageHeader,
  EnterprisePill,
} from "@/components/enterprise-primitives";
import {
  activeTrip,
  bookingStateMeta,
  enterpriseBookings,
  enterpriseTenant,
  enterpriseUser,
} from "@/lib/enterprise-fixtures";
import {
  enterpriseCardGridStyle,
  enterprisePageStyle,
  enterpriseTheme,
} from "@/lib/enterprise-theme";

const linkStyle = {
  textDecoration: "none",
} as const;

export default function HomePage() {
  return (
    <div style={enterprisePageStyle}>
      <EnterprisePageHeader
        title={`嗨，${enterpriseUser.name}，要去哪裡？`}
        subtitle={`${enterpriseTenant.name} · 為自己或同事建立企業派車，費用走成本中心與審批。`}
      />

      <EnterpriseKpiGrid>
        <EnterpriseKpi
          label="本月額度"
          value="NT$ 31,000"
          sub="可用 / NT$ 60,000"
          hint="quota"
        />
        <EnterpriseKpi
          label="待處理"
          value="1 件待審"
          sub="EB-6ND812 · 等待主管核准"
          hint="approval"
        />
        <EnterpriseKpi
          label="歷史預約"
          value={`${enterpriseBookings.length} 筆`}
          sub="含已完成與進行中"
          hint="history"
        />
      </EnterpriseKpiGrid>

      <div style={enterpriseCardGridStyle}>
        <EnterpriseCard
          title="進行中的行程"
          actions={<EnterprisePill tone="success">已派車</EnterprisePill>}
        >
          <EnterpriseDl
            cols={1}
            items={[
              { k: "乘客", v: activeTrip.passenger },
              { k: "行程", v: `${activeTrip.from} → ${activeTrip.to}` },
              { k: "ETA", v: `${activeTrip.etaMinutes} 分鐘`, mono: true },
            ]}
          />
          <div style={{ marginTop: 12 }}>
            <Link href="/trip" style={linkStyle}>
              <EnterprisePill tone={bookingStateMeta.assigned.tone}>
                查看目前行程
              </EnterprisePill>
            </Link>
          </div>
        </EnterpriseCard>

        <EnterpriseCard
          title="快速入口"
          actions={<EnterprisePill tone="info">self-service</EnterprisePill>}
        >
          <div style={{ display: "grid", gap: 10 }}>
            <Link href="/history" style={linkStyle}>
              <EnterprisePill tone="info">我的預約</EnterprisePill>
            </Link>
            <Link href="/detail" style={linkStyle}>
              <EnterprisePill tone="warn">待審批詳情</EnterprisePill>
            </Link>
            <Link href="/receipt" style={linkStyle}>
              <EnterprisePill tone="neutral">最近收據</EnterprisePill>
            </Link>
          </div>
        </EnterpriseCard>
      </div>
    </div>
  );
}
