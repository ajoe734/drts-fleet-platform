// ent-screen-bits.tsx — shared screen-level pieces from the Enterprise Dispatch
// canvas (ent-screens-1/2.jsx): party relation, route mini, transport rail.
// Pure presentational; copy is passed in (resolved via t() at the page level).

import type { ReactNode } from "react";
import { EAvatar, EIcon, EPill } from "@/components/ent-kit";
import type { EntTheme } from "@/lib/enterprise-theme";

// passenger / bookedBy relationship row (VQ-2)
export function EntParty({
  t,
  passenger,
  passengerLabel,
  subline,
  compact,
}: {
  t: EntTheme;
  passenger: string;
  passengerLabel: string;
  subline: ReactNode;
  compact?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <EAvatar t={t} name={passenger} size={compact ? 34 : 40} />
      <div style={{ flex: 1, lineHeight: 1.25 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: compact ? 14 : 15, fontWeight: 700 }}>
            {passenger}
          </span>
          <EPill t={t} tone="neutral">
            {passengerLabel}
          </EPill>
        </div>
        {subline}
      </div>
    </div>
  );
}

// trip route mini (from → to + window [+ airport pill])
export function EntRoute({
  t,
  from,
  to,
  win,
  airportLabel,
}: {
  t: EntTheme;
  from: string;
  to: string;
  win: string;
  airportLabel?: ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", gap: 11 }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 4,
          }}
        >
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              border: "2px solid " + t.primary,
            }}
          />
          <span
            style={{
              flex: 1,
              width: 2,
              background: t.line,
              margin: "3px 0",
              minHeight: 18,
            }}
          />
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: 2,
              background: t.primary,
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>
            {from}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{to}</div>
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        <EPill t={t} tone="neutral">
          <EIcon name="cal" size={12} />
          {win}
        </EPill>
        {airportLabel && (
          <EPill t={t} tone="info">
            <EIcon name="flag" size={12} />
            {airportLabel}
          </EPill>
        )}
      </div>
    </div>
  );
}

// transport progress rail (VQ-4)
export function EntProgressRail({
  t,
  stages,
  active,
}: {
  t: EntTheme;
  stages: { t: string; icon: string }[];
  active: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {stages.map((s, i) => {
        const done = i < active;
        const on = i === active;
        const c = done || on ? t.primary : t.line;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              position: "relative",
            }}
          >
            {i < stages.length - 1 && (
              <span
                style={{
                  position: "absolute",
                  top: 13,
                  left: "50%",
                  right: "-50%",
                  height: 3,
                  background: done ? t.primary : t.line,
                }}
              />
            )}
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                zIndex: 1,
                background: done ? t.primary : on ? t.surface : t.surfaceLo,
                border: "2.5px solid " + c,
                color: done ? "#fff" : on ? t.primary : t.faint,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: on ? "0 0 0 4px " + t.primaryBg : "none",
              }}
            >
              {done ? (
                <EIcon name="check" size={14} stroke={3} />
              ) : (
                <EIcon name={s.icon} size={14} />
              )}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: on ? 700 : 500,
                color: on ? t.ink : t.muted,
                marginTop: 8,
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              {s.t}
            </span>
          </div>
        );
      })}
    </div>
  );
}
