import React from "react";
import { Banner, useTheme } from "@drts/ui-web";

export function PartnerNotificationPanel({ entrySlug }: { entrySlug: string }) {
  const theme = useTheme();

  return (
    <div data-testid="partner-notification-placeholder" style={{ padding: 16 }}>
      <Banner 
        theme={theme} 
        tone="info" 
        title="Pending Design Handoff" 
        body={`The canonical notification canvas for partner ${entrySlug} is currently missing. Screen requirements have been documented.`} 
      />
    </div>
  );
}

