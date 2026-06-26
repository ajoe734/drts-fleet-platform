import type { CSSProperties } from "react";
import { CanvasEmptyState, buildCanvasTheme } from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "platform",
  density: "compact",
});

const containerStyle: CSSProperties = {
  minHeight: "100%",
  background: theme.bg,
  color: theme.text,
  padding: 24,
  display: "grid",
  gap: 12,
};

const noteStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: 11.5,
  color: theme.textDim,
};

const NOTE_PATH =
  "docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md";

export function SandboxDesignPendingScreen({
  title,
  purpose,
  route,
}: {
  title: string;
  purpose: string;
  route: string;
}) {
  return (
    <div style={containerStyle}>
      <CanvasEmptyState
        theme={theme}
        tone="warn"
        title={`${title} · Design Pending`}
        body={`${purpose} This route intentionally stays as a placeholder until the canonical Platform Admin design canvas adds the required screen.`}
      />
      <div style={noteStyle}>
        This body does not invent a final layout. Functional requirements are
        captured in the screen handoff note below.
      </div>
      <div style={monoStyle}>{route}</div>
      <div style={monoStyle}>{NOTE_PATH}</div>
    </div>
  );
}
