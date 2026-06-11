import { PendingDesignPage } from "@/components/pending-design-page";

export default function ProgramsPage() {
  return (
    <PendingDesignPage
      route="/programs"
      titleZh="方案與配額"
      titleEn="Programs and quota"
      summary="Placeholder for program usage and quota consumption views."
      bullets={[
        "The design packet calls for consumed-vs-quota reporting by program and period.",
        "No charts or counters are invented in this scaffold.",
      ]}
    />
  );
}
