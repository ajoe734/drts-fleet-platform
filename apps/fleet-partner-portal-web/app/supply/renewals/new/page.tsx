import type { SupplyRenewalSubmissionType } from "@drts/contracts";
import {
  getSupplyDraftScope,
  loadSupplyRenewalTargets,
} from "@/lib/fleet-portal-supply.server";
import { NewSupplyRenewalForm } from "@/components/fleet-supply-workspace";

export const dynamic = "force-dynamic";

export default async function FleetSupplyRenewalNewPage({
  searchParams,
}: {
  searchParams?: Promise<{
    submissionType?: string;
    vehicleId?: string;
    driverId?: string;
    plateNo?: string;
  }>;
}) {
  const [draftScope, { targets, source }, resolvedParams] = await Promise.all([
    getSupplyDraftScope(),
    loadSupplyRenewalTargets(),
    searchParams ? searchParams : Promise.resolve(undefined),
  ]);

  return (
    <NewSupplyRenewalForm
      draftScope={draftScope}
      initialTargets={targets}
      source={source}
      initialSubmissionType={
        resolvedParams?.submissionType as
          | SupplyRenewalSubmissionType
          | undefined
      }
      initialVehicleId={resolvedParams?.vehicleId}
      initialDriverId={resolvedParams?.driverId}
      initialPlateNo={resolvedParams?.plateNo}
    />
  );
}
