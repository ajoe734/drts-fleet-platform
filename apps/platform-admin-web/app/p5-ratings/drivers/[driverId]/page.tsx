import { DriverRatingAuthorityScreen } from "../../components/driver-rating-authority";

export default async function DriverRatingAuthorityPage({
  params,
}: {
  params: Promise<{ driverId: string }>;
}) {
  const { driverId } = await params;
  return <DriverRatingAuthorityScreen driverId={driverId} />;
}
