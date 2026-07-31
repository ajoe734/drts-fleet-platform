import { RatingReviewDetailScreen } from "../components/rating-review-detail";

export default async function RatingReviewDetailPage({
  params,
}: {
  params: Promise<{ ratingId: string }>;
}) {
  const { ratingId } = await params;
  return <RatingReviewDetailScreen ratingId={ratingId} />;
}
