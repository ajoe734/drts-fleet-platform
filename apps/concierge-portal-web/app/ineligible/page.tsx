import Link from "next/link";
import { getDeskById } from "@/lib/desk-catalog";

const REASON_COPY: Record<string, string> = {
  product_not_authorized:
    "The requested service product is not authorized for this desk.",
  service_area_mismatch:
    "Pickup and drop-off fall outside the desk's authorized service area.",
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
        <span className="section-kicker">Ineligible</span>
        <h1>The request is outside the desk's authorized product or zone.</h1>
        <p>
          PRD truth requires call points to stay within authorized service area
          and product scope. The portal makes that boundary visible before the
          order touches the existing callcenter seam.
        </p>
      </section>

      <section className="panel-card tone-warning">
        <span className="section-kicker">Eligibility result</span>
        <h2>{desk ? desk.deskName : "Desk eligibility guardrail"}</h2>
        <p>{REASON_COPY[reason] ?? REASON_COPY.product_not_authorized}</p>
        {desk ? <p>Authorized zone: {desk.zoneLabel}</p> : null}
        <div className="inline-actions">
          <Link className="primary-link" href="/bookings/new">
            Return to booking form
          </Link>
          <Link className="secondary-link" href="/callbacks">
            Offer callback instead
          </Link>
        </div>
      </section>
    </div>
  );
}
