import { PassengerRidePage } from "../../../components/ride/passenger-ride-page";
import { notFound } from "next/navigation";
import { ReviewRideControls } from "../../../components/review-demo/ride-controls";
import { TrialRideControls } from "../../../components/trial/trial-ride-controls";

export default async function RideDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!id) return notFound();

  return (
    <>
      <ReviewRideControls orderId={id} />
      <TrialRideControls orderId={id} />
      <PassengerRidePage
        token={id}
        searchParams={await searchParams}
        kind="ride"
        authMode="id"
      />
    </>
  );
}
