import Link from "next/link";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";

export default function NewBookingPage() {
  return (
    <div className="page-shell">
      <PageHero
        eyebrow="New booking"
        title="The route is live in the shell, but the policy-aware intake form still belongs to `TEN-UI-005`."
        description="This keeps the new topology from breaking navigation while making it explicit that create-booking productization still needs passenger selection, address-book integration, cost-center framing, and authority-safe submit flows."
      />

      <section className="surface-grid">
        <SurfaceCard
          kicker="Next slice"
          title="Policy-aware intake"
          description="The final route will need passenger selection, approval-impact framing, notes, service attributes, and real submit semantics backed by `/api/tenant/bookings`."
        />
        <SurfaceCard
          kicker="Boundary"
          title="No fake draft semantics"
          description="This placeholder does not invent client-local drafts or approval gates that the backend has not published yet."
        />
      </section>

      <CalloutPanel
        title="Current path"
        description="Use booking oversight and integration/governance routes while the dedicated new-booking workflow is being filled in."
      >
        <div className="link-row">
          <Link className="text-link" href="/bookings">
            Back to bookings
          </Link>
          <Link className="text-link" href="/">
            Back to home
          </Link>
        </div>
      </CalloutPanel>
    </div>
  );
}
