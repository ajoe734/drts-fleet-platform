import {
  CanvasEmptyState,
  CanvasPageHeader,
  buildCanvasTheme,
} from "@drts/ui-web";

const theme = buildCanvasTheme({
  surface: "ops",
  density: "compact",
});

export default function ReassignmentsPage() {
  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <CanvasPageHeader
        theme={theme}
        title="Availability Reassignments"
        subtitle="Placeholder route preserved so the scaffold shell can navigate without borrowing another app's workflow."
      />
      <CanvasEmptyState
        theme={theme}
        tone="warn"
        title="Workflow not implemented"
        body="Awaiting Enterprise Dispatch design canvas and workflow detail before queue screens are built."
      />
    </div>
  );
}
