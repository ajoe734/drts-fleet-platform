import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";
import {
  REALM_DISPLAY_STRINGS,
  RISK_DISPLAY_STRINGS,
  RISK_LEVELS,
  type RiskLevel,
} from "@drts/ui-tokens";
import {
  buildCanvasTheme,
  CANVAS_REALM_NAMES,
  type CanvasPillTone,
  type CanvasTheme,
  Pill,
  Table,
} from "./canvas-primitives";

// Visual verification for DH-DS-TOKEN-SYNC: the Part H badge set, status
// colors, and table capabilities synced from the design canvas mgmt-tokens.jsx.

const BASE_TONES: CanvasPillTone[] = [
  "neutral",
  "info",
  "success",
  "warn",
  "danger",
  "accent",
];

const RISK_TONE_FOR_PILL: Record<RiskLevel, CanvasPillTone> = {
  low: "success",
  medium: "warn",
  high: "danger",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "#64748b",
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {children}
      </div>
    </section>
  );
}

function TokenBoard({ theme }: { theme: CanvasTheme }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 20,
        padding: 20,
        borderRadius: 12,
        background: theme.bg,
        color: theme.text,
        border: `1px solid ${theme.border}`,
        fontFamily: theme.fontFamily,
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 700 }}>
        {theme.surfaceName} · {theme.mode}
      </div>

      <Section title="Status badge set">
        {BASE_TONES.map((tone) => (
          <Pill key={tone} theme={theme} tone={tone} dot>
            {tone}
          </Pill>
        ))}
      </Section>

      <Section title="Actor realm chips (cross-actor audit)">
        {CANVAS_REALM_NAMES.map((realm) => (
          <Pill key={realm} theme={theme} tone={realm} dot>
            {REALM_DISPLAY_STRINGS[realm].zhTW} · {realm}
          </Pill>
        ))}
      </Section>

      <Section title="Risk badges">
        {RISK_LEVELS.map((level) => (
          <Pill key={level} theme={theme} tone={RISK_TONE_FOR_PILL[level]} dot>
            {RISK_DISPLAY_STRINGS[level].zhTW}
          </Pill>
        ))}
      </Section>
    </div>
  );
}

type SelectableRow = {
  id: string;
  actor: string;
  realm: (typeof CANVAS_REALM_NAMES)[number];
  _selected?: boolean;
};

function SelectableTable({ theme }: { theme: CanvasTheme }) {
  const rows: SelectableRow[] = [
    { id: "EVT-1001", actor: "ops@drts", realm: "ops", _selected: true },
    { id: "EVT-1002", actor: "tenant-admin", realm: "tenant" },
    { id: "EVT-1003", actor: "system-job", realm: "system" },
  ];

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 12,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
      }}
    >
      <Table
        theme={theme}
        rows={rows}
        onRowSelect={(row) => {
          window.alert(`Selected ${row.id}`);
        }}
        columns={[
          { h: "Event", k: "id", mono: true },
          { h: "Actor", k: "actor" },
          {
            h: "Realm",
            r: (row) => (
              <Pill theme={theme} tone={row.realm}>
                {row.realm}
              </Pill>
            ),
          },
        ]}
      />
    </div>
  );
}

const meta: Meta = {
  title: "Design System/Canvas Token Sync",
};
export default meta;

type Story = StoryObj;

export const BadgesAndStatusColors: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 20, padding: 16 }}>
      <TokenBoard theme={buildCanvasTheme({ surface: "platform" })} />
      <TokenBoard theme={buildCanvasTheme({ surface: "ops", dark: true })} />
    </div>
  ),
};

export const TableRowSelect: Story = {
  render: () => (
    <div style={{ display: "grid", gap: 20, padding: 16 }}>
      <SelectableTable theme={buildCanvasTheme({ surface: "tenant" })} />
      <SelectableTable
        theme={buildCanvasTheme({ surface: "platform", dark: true })}
      />
    </div>
  ),
};
