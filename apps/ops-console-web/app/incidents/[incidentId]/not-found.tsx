import Link from "next/link";
import {
  CanvasBanner as Banner,
  CanvasPageHeader as PageHeader,
  CanvasIcon,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function linkStyle() {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    minHeight: "28px",
    padding: "5px 10px",
    borderRadius: "7px",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    background: theme.surface,
    color: theme.text,
    border: `1px solid ${theme.border}`,
  } as const;
}

export default function IncidentDetailNotFound() {
  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <PageHeader
        theme={theme}
        title="Incident not found"
        subtitle="找不到對應的 incident route"
        actions={
          <Link href="/incidents" style={linkStyle()}>
            <CanvasIcon name="arrow" size={12} />
            <span>Back to Incident Center</span>
          </Link>
        }
      />
      <Banner
        theme={theme}
        tone="danger"
        icon="warn"
        title="No incident matched this route"
        body="The incident could be deleted, unavailable in this environment, or the deep link is stale."
      />
    </div>
  );
}
