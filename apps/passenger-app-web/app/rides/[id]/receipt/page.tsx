import { PassengerRidePage } from "@/components/ride/passenger-ride-page";

export default function RideReceiptRoute({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { mode?: string; screen?: string };
}) {
  return (
    <PassengerRidePage
      token={params.id}
      searchParams={searchParams}
      kind="receipt"
      authMode="id"
    />
  );
}
