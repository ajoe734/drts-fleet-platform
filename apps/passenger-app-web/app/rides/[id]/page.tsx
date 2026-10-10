import { PassengerRidePage } from "@/components/ride/passenger-ride-page";
import { notFound } from "next/navigation";

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
    <PassengerRidePage
      token={id}
      searchParams={await searchParams}
      kind="ride"
      authMode="id"
    />
  );
}
