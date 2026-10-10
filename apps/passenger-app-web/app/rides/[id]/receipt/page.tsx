import { PassengerRidePage } from "../../../../components/ride/passenger-ride-page";

export default async function RideReceiptRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  return (
    <PassengerRidePage
      token={id}
      searchParams={await searchParams}
      kind="receipt"
      authMode="id"
    />
  );
}
