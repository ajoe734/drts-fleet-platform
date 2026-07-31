import { PassengerRidePage } from "@/components/passenger-ride-page";

export default async function RideTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const query = await searchParams;

  return <PassengerRidePage token={token} searchParams={query} kind="ride" />;
}
