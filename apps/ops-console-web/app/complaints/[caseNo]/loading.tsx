import {
  CanvasCard as Card,
  CanvasPageHeader as PageHeader,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

function skeletonBlock(height: string) {
  return (
    <div
      style={{
        height,
        borderRadius: "12px",
        background:
          "linear-gradient(90deg, rgba(15,23,42,0.85), rgba(30,41,59,0.95), rgba(15,23,42,0.85))",
        border: `1px solid ${theme.border}`,
      }}
    />
  );
}

export default function LoadingComplaintDetail() {
  return (
    <>
      <PageHeader
        title="Complaint detail"
        subtitle="Loading complaint case workspace…"
      />
      <div
        style={{
          padding: "0 24px 24px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.45fr) minmax(340px, 1fr)",
          gap: "16px",
        }}
      >
        <div style={{ display: "grid", gap: "16px" }}>
          <Card theme={theme} title="Case summary">
            <div style={{ display: "grid", gap: "10px" }}>
              {skeletonBlock("120px")}
              {skeletonBlock("72px")}
            </div>
          </Card>
          <Card theme={theme} title="Timeline">
            <div style={{ display: "grid", gap: "10px" }}>
              {skeletonBlock("64px")}
              {skeletonBlock("64px")}
              {skeletonBlock("64px")}
            </div>
          </Card>
        </div>
        <div style={{ display: "grid", gap: "16px" }}>
          <Card theme={theme} title="Action workspace">
            <div style={{ display: "grid", gap: "10px" }}>
              {skeletonBlock("54px")}
              {skeletonBlock("160px")}
            </div>
          </Card>
          <Card theme={theme} title="Linked entities">
            <div style={{ display: "grid", gap: "10px" }}>
              {skeletonBlock("52px")}
              {skeletonBlock("52px")}
              {skeletonBlock("52px")}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
