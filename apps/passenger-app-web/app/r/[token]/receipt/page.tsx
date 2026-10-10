import { PassengerRidePage } from "../../../../components/ride/passenger-ride-page";

export default async function TokenReceiptRoute({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { token } = await params;
  return (
    <PassengerRidePage
      token={token}
      searchParams={await searchParams}
      kind="receipt"
      authMode="token"
    />
  );
}
