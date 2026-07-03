"use client";

import { DesignPendingScreen } from "@/components/design-pending-screen";

const ROUTE = "/service-area-governance";
const NOTE_PATH =
  "docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260703.md";

export default function ServiceAreaGovernancePage() {
  return (
    <DesignPendingScreen
      titleKey="serviceAreaGovernance.title"
      purposeKey="serviceAreaGovernance.pending.purpose"
      route={ROUTE}
      notePath={NOTE_PATH}
    />
  );
}
