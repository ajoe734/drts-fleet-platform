import { PageHero, SurfaceCard } from "@/components/page-primitives";

export default function BookingDetailLoading() {
  return (
    <div className="page-shell">
      <PageHero
        eyebrow="訂單明細"
        title="載入租戶訂單明細中"
        description="正在準備 T5 租戶快照、可執行操作描述與稽核背景資料。"
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="刷新層級"
          title="準備訂單明細"
          description="正在載入目前訂單快照與刷新中繼資料。"
        />
        <SurfaceCard
          kicker="狀態"
          title="確認可編輯條件"
          description="正在取得可執行操作、可編輯期限與審批狀態，完成後頁面才會開放互動。"
        />
      </section>
    </div>
  );
}
