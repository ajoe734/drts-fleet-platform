import { PageHero, SurfaceCard } from "@/components/page-primitives";

export default function BookingDetailLoading() {
  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Booking detail"
        title="Loading tenant booking detail"
        description="The detail route is hydrating the T5 tenant snapshot, action descriptors, and audit context."
      />

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Refresh tier"
          title="Preparing booking detail"
          description="Loading the current booking snapshot and refresh metadata."
        />
        <SurfaceCard
          kicker="Status"
          title="Resolving editability"
          description="Fetching availableActions, editableUntil, and approval posture before the screen becomes interactive."
        />
      </section>
    </div>
  );
}
