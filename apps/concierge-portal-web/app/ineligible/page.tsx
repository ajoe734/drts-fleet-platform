import Link from "next/link";
import { getDeskById } from "@/lib/desk-catalog";

const REASON_COPY: Record<string, string> = {
  product_not_authorized: "此櫃台未授權所選服務類型。",
  service_area_mismatch: "上車或下車地點超出此櫃台授權服務範圍。",
};

function getQueryValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function IneligiblePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const deskId = getQueryValue(query.desk);
  const reason = getQueryValue(query.reason) ?? "product_not_authorized";
  const desk = getDeskById(deskId);

  return (
    <div className="page-shell">
      <section className="hero-card tone-warning">
        <span className="section-kicker">資格不符</span>
        <h1>此需求超出櫃台授權的服務類型或區域。</h1>
        <p>
          電話站點與客服櫃台必須遵守授權服務範圍。系統會在送出訂單前顯示限制，避免建立不合規的代訂。
        </p>
      </section>

      <section className="panel-card tone-warning">
        <span className="section-kicker">資格檢查結果</span>
        <h2>{desk ? desk.deskName : "櫃台資格限制"}</h2>
        <p>{REASON_COPY[reason] ?? REASON_COPY.product_not_authorized}</p>
        {desk ? <p>授權服務範圍：{desk.zoneLabel}</p> : null}
        <div className="inline-actions">
          <Link className="primary-link" href="/bookings/new">
            回到代訂表單
          </Link>
          <Link className="secondary-link" href="/callbacks">
            改安排回覆
          </Link>
        </div>
      </section>
    </div>
  );
}
