import { TripClient } from "./trip-client";

type TripPageSearchParams = Record<string, string | string[] | undefined>;

export default async function TripPage({
  searchParams,
}: {
  searchParams?: Promise<TripPageSearchParams>;
}) {
  const resolved = (await searchParams) ?? {};
  const bookingId = Array.isArray(resolved.bookingId)
    ? resolved.bookingId[0]
    : resolved.bookingId;

  return <TripClient bookingId={bookingId} />;
}
