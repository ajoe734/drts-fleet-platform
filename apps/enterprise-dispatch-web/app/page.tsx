import {
  CanvasCard,
  CanvasEmptyState,
  CanvasPageHeader,
  CanvasPill,
  CanvasBtn,
  buildCanvasTheme,
} from "@drts/ui-web";
import { REALM_DISPLAY_STRINGS } from "@drts/ui-tokens";

const theme = buildCanvasTheme({
  surface: "ops",
  density: "compact",
});

const pageStyle = {
  display: "grid",
  gap: 16,
  padding: 24,
  width: "100%",
  maxWidth: 1200,
  margin: "0 auto",
} as const;

const cardGridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
} as const;

const listStyle = {
  margin: 0,
  paddingLeft: 18,
  display: "grid",
  gap: 8,
  color: theme.text,
  fontSize: 12.5,
  lineHeight: 1.5,
} as const;

export default function HomePage() {
  return (
    <div style={pageStyle}>
      <CanvasPageHeader
        theme={theme}
        title="Enterprise Dispatch shell"
        subtitle="This route intentionally stops at the shell boundary until a dedicated Enterprise Dispatch design canvas is supplied."
        actions={
          <CanvasPill theme={theme} tone="ops">
            {REALM_DISPLAY_STRINGS.ops.en}
          </CanvasPill>
        }
      />

      <div style={cardGridStyle}>
        <CanvasCard
          theme={theme}
          title="Current scope"
          actions={
            <CanvasBtn theme={theme} variant="secondary" size="xs">
              Scaffold only
            </CanvasBtn>
          }
        >
          <ul style={listStyle}>
            <li>Workspace shell for enterprise dispatch operators.</li>
            <li>Ops realm styling sourced from shared DRTS UI tokens.</li>
            <li>No tenant-console, tenant-portal, or partner-booking reuse.</li>
          </ul>
        </CanvasCard>

        <CanvasCard
          theme={theme}
          title="Blocked from full UI implementation"
          actions={
            <CanvasPill theme={theme} tone="warn">
              Canvas missing
            </CanvasPill>
          }
        >
          <ul style={listStyle}>
            <li>
              No `Enterprise Dispatch.html` canvas exists under
              `docs/05-ui/drts-design-canvas`.
            </li>
            <li>
              Screen-level information architecture and interaction design
              remain undefined.
            </li>
            <li>
              A requirements note is recorded in the task sidecar artifact.
            </li>
          </ul>
        </CanvasCard>
      </div>

      <CanvasEmptyState
        theme={theme}
        title="Dispatch dashboard pending design handoff"
        body="Add the dedicated design canvas before implementing workflow boards, reassignment queues, or operator detail panels."
      />
    </div>
  );
}
