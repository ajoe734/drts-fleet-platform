import type {
  TenantAddressRecord,
  TenantCostCenterRecord,
  TenantPassengerRecord,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import { TenantBookingCreateForm } from "./tenant-booking-create-form";

export const dynamic = "force-dynamic";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams?: Promise<{
    pickupAddressId?: string;
    dropoffAddressId?: string;
  }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const client = getTenantClient();
  const [passengers, addresses, costCenters] = await Promise.all([
    client.listPassengers() as Promise<TenantPassengerRecord[]>,
    client.listAddresses() as Promise<TenantAddressRecord[]>,
    client.listCostCenters({ activeOnly: true }) as Promise<
      TenantCostCenterRecord[]
    >,
  ]);

  const activePassengers = passengers.filter((row) => row.activeFlag);
  const activeAddresses = addresses.filter((row) => row.activeFlag);
  const activeCostCenters = costCenters.filter((row) => row.activeFlag);

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="New booking"
        title="Create a tenant booking with passenger, cost-center, quota, and approval context in one route."
        description="This route now stays on the published tenant contracts: directory-backed passenger and address selection, canonical cost-center selection, quota impact preview, approval-rule evaluation, and submit through `/api/tenant/bookings` without inventing a local draft state."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Passengers</span>
          <strong>{activePassengers.length}</strong>
          <p>Active tenant passengers available for booking-on-behalf flows.</p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Addresses</span>
          <strong>{activeAddresses.length}</strong>
          <p>
            Saved pickup and drop-off locations reusable from the directory.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Cost centers</span>
          <strong>{activeCostCenters.length}</strong>
          <p>Active cost centers that can trigger quota and approval rules.</p>
        </article>
      </section>

      <TenantBookingCreateForm
        addresses={activeAddresses}
        costCenters={activeCostCenters}
        passengers={activePassengers}
        {...(resolvedSearchParams.dropoffAddressId
          ? { initialDropoffAddressId: resolvedSearchParams.dropoffAddressId }
          : {})}
        {...(resolvedSearchParams.pickupAddressId
          ? { initialPickupAddressId: resolvedSearchParams.pickupAddressId }
          : {})}
      />

      <section className="surface-grid">
        <SurfaceCard
          kicker="Contract boundary"
          title="No fake draft or tenant-side fare override"
          description="The page evaluates cost-center policy from the published quota preview and approval-evaluation contracts. Estimated spend stays preview-only input because tenant booking create cannot set `quotedFare`, and no estimate endpoint is published here."
        />
        <SurfaceCard
          kicker="Authority safety"
          title="Booking-on-behalf stays explicit"
          description="Passenger selection is directory-scoped, `bookedBy` is optional metadata, and blocked approval outcomes stop the local submit button instead of guessing a hidden override path."
        />
      </section>

      <CalloutPanel
        title="What happens on submit"
        description="A clean evaluation submits directly to the tenant booking command. Approval-required evaluations still allow submit, but the created booking carries backend-owned approval state and request IDs. Blocked evaluations stay client-blocked until the input changes."
      />
    </div>
  );
}
