import React from "react";
import { CanvasBanner, buildCanvasTheme } from "@drts/ui-web";

export function PartnerNotificationPanel({ entrySlug }: { entrySlug: string }) {
  const theme = buildCanvasTheme({ surface: "platform" });

  return (
    <div data-testid="partner-notification-placeholder" style={{ padding: 16 }}>
      <CanvasBanner 
        theme={theme} 
        tone="info" 
        title="Pending Design Handoff" 
        body={`The canonical notification canvas for partner ${entrySlug} is currently missing. Screen requirements have been documented.`} 
      />
    </div>
  );
}

