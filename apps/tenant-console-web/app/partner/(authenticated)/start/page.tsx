import Link from "next/link";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { requirePartnerSession } from "@/lib/partner-session";

export const dynamic = "force-dynamic";

const ELIGIBILITY_REQUIRED: Record<string, boolean> = {
  none: false,
  bank_card_inline: true,
  reference_required: true,
};

export default async function PartnerStartPage() {
  const session = await requirePartnerSession();
  const eligibilityRequired =
    ELIGIBILITY_REQUIRED[session.partnerEntry.eligibilityMode] ?? true;
  const subtype = session.partnerEntry.businessDispatchSubtype;
  const status = session.partnerEntry.status;
  const isActive = status === "active";

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Partner workspace"
        title={`${session.partnerEntry.displayName} is signed in.`}
        description="Partner mode only exposes eligibility verification and partner-tagged booking creation. Tenant-admin governance is intentionally absent from this surface."
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Entry"
          title="Entry registration snapshot"
          description="Backend-issued entry record. Partner mode reads it; it does not edit it."
        >
          <dl className="definition-grid">
            <div>
              <dt>Display name</dt>
              <dd>{session.partnerEntry.displayName}</dd>
            </div>
            <div>
              <dt>Slug</dt>
              <dd>
                <code>{session.partnerEntry.entrySlug}</code>
              </dd>
            </div>
            <div>
              <dt>Partner code</dt>
              <dd>
                <code>{session.partnerEntry.partnerCode}</code>
              </dd>
            </div>
            <div>
              <dt>Program</dt>
              <dd>
                {session.partnerEntry.programCode ? (
                  <code>{session.partnerEntry.programCode}</code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>Bank</dt>
              <dd>
                {session.partnerEntry.bankCode ? (
                  <code>{session.partnerEntry.bankCode}</code>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt>Service subtype</dt>
              <dd>
                <code>{subtype}</code>
              </dd>
            </div>
            <div>
              <dt>Auth mode</dt>
              <dd>
                <code>{session.partnerEntry.authMode}</code>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <span
                  className={`status-badge${isActive ? "" : " is-warning"}`}
                >
                  {status}
                </span>
              </dd>
            </div>
          </dl>
        </SurfaceCard>

        <SurfaceCard
          kicker="Eligibility"
          title={
            eligibilityRequired
              ? "Eligibility verification required"
              : "Eligibility check not required"
          }
          description={
            eligibilityRequired
              ? "Run the eligibility check first; only an `eligible` decision unlocks partner booking creation."
              : "This entry is configured with `eligibility_mode = none`. Booking creation is allowed without an eligibility verification."
          }
        >
          <p>
            Eligibility mode:{" "}
            <code>{session.partnerEntry.eligibilityMode}</code>
          </p>
          <div className="link-row">
            <Link className="text-link" href="/partner/eligibility">
              Open eligibility verification
            </Link>
            {!eligibilityRequired ? (
              <Link className="text-link" href="/partner/booking/new">
                Skip to booking creation
              </Link>
            ) : null}
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Booking"
          title="Partner-tagged booking creation"
          description="Bookings created from this surface stamp `partnerEntrySlug` and (when verified) `eligibilityVerificationId` so downstream audit and billing keep partner provenance."
        >
          <ul className="panel-list">
            <li>Service subtype is fixed by the entry record.</li>
            <li>
              Quoted fare authority remains backend-owned; partner mode does not
              set fare.
            </li>
            <li>
              Negative paths (denied / ineligible / degraded) stop short of
              create.
            </li>
          </ul>
          <div className="link-row">
            <Link className="text-link" href="/partner/booking/new">
              Open booking create
            </Link>
          </div>
        </SurfaceCard>

        <SurfaceCard
          kicker="Boundary"
          title="What partner mode does not get"
          description="The shell has no nav entry for these surfaces; the routes are not guarded but the navigation makes the boundary explicit."
        >
          <ul className="panel-list">
            <li>No tenant users / role assignment.</li>
            <li>No API keys, webhooks, audit logs, or settings.</li>
            <li>No tenant billing or integration governance.</li>
            <li>No fulfilment overrides or dispatch authority.</li>
          </ul>
        </SurfaceCard>
      </section>

      {!isActive ? (
        <CalloutPanel
          title="Entry status flagged"
          description={`Entry status is "${status}". Booking creation will fail until the entry is reactivated by platform admin.`}
          tone="warning"
        />
      ) : null}
    </div>
  );
}
