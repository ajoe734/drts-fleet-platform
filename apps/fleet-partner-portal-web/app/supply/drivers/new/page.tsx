import { getSupplyDraftScope } from "@/lib/fleet-portal-supply.server";
import { NewDriverSubmissionForm } from "@/components/fleet-supply-workspace";

export const dynamic = "force-dynamic";

export default async function FleetSupplyDriverNewPage() {
  return <NewDriverSubmissionForm draftScope={await getSupplyDraftScope()} />;
}
