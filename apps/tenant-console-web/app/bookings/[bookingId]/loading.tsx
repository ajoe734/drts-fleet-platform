import { PageHero, SurfaceCard } from "@/components/page-primitives";

export default function BookingDetailLoading() {
  return (
    <div className="page-shell">
      <PageHero
        eyebrow="訂單明細"
        title="載入租戶訂單明細"
        description="明細路由正在水合 T5 租戶快照、動作描述子與 audit 內容。"
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Refresh tier"
          title="準備訂單明細"
          description="載入目前訂單快照與更新中繼資料。"
        />
        <SurfaceCard
          kicker="Status"
          title="解析可編輯性"
          description="在畫面可互動前，取得 availableActions、editableUntil 與審批狀態。"
        />
      </section>
    </div>
  );
}
