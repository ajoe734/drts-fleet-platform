import { PassengerRidePage } from "../../../components/ride/passenger-ride-page";
import { notFound } from "next/navigation";

export default async function RideSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  if (!token) return notFound();

  return (
    <PassengerRidePage
      token={token}
      searchParams={await searchParams}
      kind="ride"
      authMode="token"
    />
  );
}
