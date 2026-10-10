import { PassengerRidePage } from "../../../../components/ride/passenger-ride-page";

export default function TokenReceiptRoute({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { mode?: string; screen?: string };
}) {
  return (
    <PassengerRidePage
      token={params.token}
      searchParams={searchParams}
      kind="receipt"
      authMode="token"
    />
  );
}
