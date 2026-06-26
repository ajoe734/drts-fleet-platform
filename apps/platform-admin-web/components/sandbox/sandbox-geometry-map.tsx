import type { CSSProperties } from "react";
import type {
  ApprovedOperatingAreaRecord,
  ApprovedRouteRecord,
} from "@drts/contracts";
import {
  CanvasIcon,
  type CanvasIconName,
  type CanvasTheme,
} from "@drts/ui-web";
import { projectSandboxGeometry } from "@/lib/sandbox-governance";

/**
 * Operating-area / route editor surface (canvas PSB_AreasEditor). The tool rail
 * mirrors the canvas (draw area / draw route / pickup-dropoff / edit node); the
 * map body draws the *real* approved PostGIS geometry returned by the
 * control-plane so the editor reflects what was actually approved.
 */
export interface SandboxGeometryMapProps {
  theme: CanvasTheme;
  areas: ApprovedOperatingAreaRecord[];
  routes: ApprovedRouteRecord[];
  caption: string;
  emptyLabel: string;
  tools: Array<{ icon: CanvasIconName; label: string }>;
}

export function SandboxGeometryMap({
  theme,
  areas,
  routes,
  caption,
  emptyLabel,
  tools,
}: SandboxGeometryMapProps) {
  const projected = projectSandboxGeometry(areas, routes);

  const toolRailStyle: CSSProperties = {
    display: "flex",
    gap: 6,
    padding: "10px 14px",
    borderBottom: `1px solid ${theme.border}`,
    background: theme.surfaceLo,
    flexWrap: "wrap",
  };

  const mapBodyStyle: CSSProperties = {
    height: 380,
    background: `linear-gradient(135deg, ${theme.accentBg}, ${theme.surfaceLo})`,
    position: "relative",
    overflow: "hidden",
  };

  return (
    <div>
      <div style={toolRailStyle}>
        {tools.map((tool, index) => {
          const active = index === 0;
          return (
            <span
              key={tool.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 11px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                border: `1px solid ${active ? theme.accent : theme.border}`,
                background: active ? theme.accentBg : theme.surface,
                color: active ? theme.accent : theme.textMuted,
              }}
            >
              <CanvasIcon name={tool.icon} size={13} />
              {tool.label}
            </span>
          );
        })}
      </div>
      <div style={mapBodyStyle}>
        {projected ? (
          <svg
            viewBox={`0 0 ${projected.width} ${projected.height}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          >
            {projected.polygons.map((points, index) => (
              <polygon
                key={`poly-${index}`}
                points={points}
                fill={`${theme.accent}22`}
                stroke={theme.accent}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            ))}
            {projected.polylines.map((points, index) => (
              <polyline
                key={`line-${index}`}
                points={points}
                fill="none"
                stroke={theme.accentHi}
                strokeWidth={3}
              />
            ))}
            {projected.endpoints.map((point, index) => (
              <circle
                key={`endpoint-${index}`}
                cx={point.x}
                cy={point.y}
                r={6}
                fill={theme.accent}
                stroke={theme.surface}
                strokeWidth={2}
              />
            ))}
            {projected.vertices.map((point, index) => (
              <rect
                key={`vertex-${index}`}
                x={point.x - 4}
                y={point.y - 4}
                width={8}
                height={8}
                fill={theme.surface}
                stroke={theme.accent}
                strokeWidth={2}
              />
            ))}
          </svg>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.textMuted,
              fontSize: 12.5,
            }}
          >
            {emptyLabel}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            fontSize: 10.5,
            color: theme.textMuted,
            background: theme.surface,
            padding: "4px 9px",
            borderRadius: 6,
          }}
        >
          {caption}
        </div>
      </div>
    </div>
  );
}
