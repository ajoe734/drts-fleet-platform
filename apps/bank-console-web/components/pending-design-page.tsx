import type { CSSProperties } from "react";
import {
  CanvasBanner,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const bodyTextStyle: CSSProperties = {
  margin: 0,
  color: theme.textMuted,
  fontSize: 12.5,
  lineHeight: 1.65,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: theme.text,
  fontSize: 12.5,
  lineHeight: 1.7,
};

const linkStyle: CSSProperties = {
  color: theme.accent,
  fontWeight: 700,
  fontFamily: theme.monoFamily,
};

export function PendingDesignPage({
  route,
  titleZh,
  titleEn,
  summary,
  bullets,
}: {
  route: string;
  titleZh: string;
  titleEn: string;
  summary: string;
  bullets: string[];
}) {
  return (
    <>
      <CanvasPageHeader
        theme={theme}
        title={titleZh}
        subtitle={`${titleEn} · pending-design placeholder`}
      />
      <div style={pageStyle}>
        <CanvasBanner
          theme={theme}
          tone="warn"
          icon="warn"
          title="Pending design canvas"
          body="This scaffold intentionally stops at shell chrome and route presence. Final screen composition waits for the dedicated bank-console design canvas."
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <CanvasPill theme={theme} tone="accent">
            {route}
          </CanvasPill>
          <CanvasPill theme={theme} tone="neutral">
            tenant realm chrome
          </CanvasPill>
          <CanvasPill theme={theme} tone="warn">
            no invented final screen
          </CanvasPill>
        </div>

        <div style={gridStyle}>
          <CanvasCard
            theme={theme}
            title="Why this page is a placeholder"
            subtitle="Design authority stays in the UI hand-off packet"
          >
            <p style={bodyTextStyle}>{summary}</p>
            <ul style={listStyle}>
              {bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </CanvasCard>

          <CanvasCard
            theme={theme}
            title="Design references"
            subtitle="Read before replacing the placeholder"
          >
            <p style={bodyTextStyle}>
              Functional scope comes from the credit-card airport transfer SD
              and screen requirements documents.
            </p>
            <ul style={listStyle}>
              <li>
                <span style={linkStyle}>
                  docs/05-ui/credit-card-airport-transfer-screen-requirements-20260610.md
                </span>
              </li>
              <li>
                <span style={linkStyle}>
                  docs/02-architecture/credit-card-airport-transfer-sd-20260610.md
                </span>
              </li>
            </ul>
          </CanvasCard>
        </div>
      </div>
    </>
  );
}
