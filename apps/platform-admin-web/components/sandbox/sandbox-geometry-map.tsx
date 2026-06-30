import type { CSSProperties } from "react";
import type {
  ApprovedOperatingAreaRecord,
  ApprovedRouteRecord,
} from "@drts/contracts";
import {
  CanvasIcon,
  GeometryPreviewSurface,
  type CanvasIconName,
  type CanvasTheme,
  type GeometryPreviewItem,
} from "@drts/ui-web";

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
  const previewItems: GeometryPreviewItem[] = [
    ...areas.flatMap((area, areaIndex) =>
      area.geometry.coordinates.map((polygon, polygonIndex) => ({
        id: `area-${areaIndex}-${polygonIndex}`,
        tone: "accent" as const,
        draft: {
          kind: "polygon" as const,
          points: (polygon[0] ?? []).slice(0, -1).map(([lng, lat]) => ({ lat, lng })),
        },
      })),
    ),
    ...routes.flatMap((route, routeIndex) =>
      route.geometry.coordinates.map((line, lineIndex) => ({
        id: `route-${routeIndex}-${lineIndex}`,
        tone: "accent" as const,
        draft: {
          kind: "routeCorridor" as const,
          points: line.map(([lng, lat]) => ({ lat, lng })),
          radiusMeters: 120,
        },
      })),
    ),
  ];

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
        <GeometryPreviewSurface
          theme={theme}
          items={previewItems}
          caption={caption}
          emptyLabel={emptyLabel}
        />
      </div>
    </div>
  );
}
