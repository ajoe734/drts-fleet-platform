import React from "react";
import { CanvasBanner } from "@drts/ui-web";

export function PartnerNotificationPanel({ entrySlug }: { entrySlug: string }) {
  return (
    <div data-testid="partner-notification-placeholder" style={{ padding: 16 }}>
      <CanvasBanner 
        tone="info" 
        title="Pending Design Handoff" 
        body={`The canonical notification canvas for partner ${entrySlug} is currently missing. Screen requirements have been documented.`} 
      />
    </div>
  );
}
