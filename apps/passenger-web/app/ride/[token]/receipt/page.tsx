import { PassengerRidePage } from "@/components/passenger-ride-page";

export default async function PassengerReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query] = await Promise.all([params, searchParams]);

  return (
    <PassengerRidePage token={token} searchParams={query} kind="receipt" />
  );
}
