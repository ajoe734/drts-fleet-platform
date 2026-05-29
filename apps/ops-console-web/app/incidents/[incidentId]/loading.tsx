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

function SkeletonBlock({
  height,
  width = "100%",
}: {
  height: number;
  width?: number | string;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius: 10,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.07), rgba(255,255,255,0.14), rgba(255,255,255,0.07))",
      }}
    />
  );
}

export default function Loading() {
  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <PageHeader
        theme={theme}
        title="inc_••••"
        subtitle="Incident detail loading"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 0.95fr)",
          gap: 16,
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <Card theme={theme} title="Incident summary">
            <div style={{ display: "grid", gap: 10 }}>
              <SkeletonBlock height={18} width="38%" />
              <SkeletonBlock height={78} />
              <SkeletonBlock height={120} />
            </div>
          </Card>
          <Card theme={theme} title="Timeline">
            <div style={{ display: "grid", gap: 10 }}>
              <SkeletonBlock height={54} />
              <SkeletonBlock height={54} />
              <SkeletonBlock height={54} />
            </div>
          </Card>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <Card theme={theme} title="Action context">
            <div style={{ display: "grid", gap: 10 }}>
              <SkeletonBlock height={44} />
              <SkeletonBlock height={96} />
            </div>
          </Card>
          <Card theme={theme} title="Linked entities">
            <div style={{ display: "grid", gap: 10 }}>
              <SkeletonBlock height={34} />
              <SkeletonBlock height={34} />
              <SkeletonBlock height={34} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
