"use client";

import type { CSSProperties } from "react";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const cardBodyStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  color: theme.text,
  fontSize: 13,
  lineHeight: 1.6,
};

export function SandboxComplianceDashboardPage() {
  return (
    <main style={pageBodyStyle}>
      <CanvasPageHeader
        theme={theme}
        title="Sandbox compliance"
        subtitle="Backend contracts for compliance, investigations, evidence, and regulatory reporting are landed. Canonical Platform Admin canvas screens are not."
      />

      <CanvasBanner
        theme={theme}
        tone="warn"
        title="Visual implementation is intentionally blocked"
        body="The current Platform Admin design canvas does not define this route group. Per the UI design contract, engineering must stop at the requirements note instead of inventing a new console."
      />

      <CanvasCard theme={theme} title="Canonical source of truth">
        <div style={cardBodyStyle}>
          <div>
            Visual work for this surface is pending the first-class canvas
            screens requested in the sandbox compliance hand-off packet.
          </div>
          <div>
            `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
          </div>
        </div>
      </CanvasCard>
    </main>
  );
}
