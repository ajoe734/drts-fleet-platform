"use client";

import Link from "next/link";
import { useTranslation } from "@/lib/i18n";
import { RatingReviewQueue } from "./components/rating-review-queue";

export default function RatingReviewQueuePage() {
  const { t } = useTranslation();
  return (
    <>
      <nav aria-label={t("referralMonthly.navigationLabel")}>
        <Link href="/p5-ratings/referral-monthly">
          {t("referralMonthly.navigationLink")}
        </Link>
      </nav>
      <RatingReviewQueue />
    </>
  );
}
