"use client";

import type { CSSProperties } from "react";

export const CANVAS_ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  tenants: "M3 21V8l9-5 9 5v13M9 21v-8h6v8",
  partners: "M16 8a4 4 0 10-8 0 4 4 0 008 0zM2 21a8 8 0 0116 0M19 11l2 2-2 2",
  users: "M16 14a4 4 0 10-8 0 4 4 0 008 0zM2 21a8 8 0 0116 0",
  fleet: "M3 13l2-7h14l2 7M3 13v5h2M21 13v5h-2M3 13h18M7 17h2m6 0h2",
  switchboard: "M4 6h16M4 12h16M4 18h10",
  pricing: "M3 10l9-7 9 7v11H3zM9 21v-7h6v7M12 7v.01",
  payments: "M3 7h18v10H3zM3 11h18M7 15h2",
  health: "M3 12h4l3-8 4 16 3-8h4",
  notices: "M4 19V5l16 7z",
  audit: "M9 12l2 2 4-4M3 6h18v14H3zM3 6V3h18v3",
  flags: "M5 21V4h12l-2 4 2 4H5",
  adapters: "M9 5v6H5l7 8V13h4z",
  dashboard: "M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z",
  dispatch: "M3 12h6l2-3 4 6 2-3h4M5 7h14M5 17h14",
  callcenter: "M3 5c0 9 7 16 16 16v-4l-4-2-2 2a12 12 0 01-6-6l2-2-2-4z",
  complaints:
    "M21 12c0 4-4 7-9 7-1.5 0-3-.3-4-.8L3 20l1-4c-.6-1-1-2.4-1-4 0-4 4-7 9-7s9 3 9 7z",
  incidents: "M12 3l10 18H2zM12 10v5M12 17v.01",
  reports: "M5 3h11l4 4v14H5zM14 3v5h6M9 13h6M9 17h4",
  revenue: "M3 17l5-5 4 4 7-9M14 7h6v6",
  attendance: "M5 7h14v13H5zM5 7V3h14v4M9 13h2M13 13h2M9 17h2M13 17h2",
  maintenance: "M14.7 6.3a4 4 0 105.4 5.4L21 12V3l-9 .1-.1.1zM4 20l8-8",
  vehicles: "M3 17h18M5 17l2-7h10l2 7M7 17v2H5v-2M19 17v2h-2v-2M9 13h6",
  contracts: "M7 3h10l3 3v15H7zM7 3v18M11 9h6M11 13h6M11 17h4",
  bookings: "M5 5h14v14H5zM5 9h14M9 5v14M9 13h4",
  passengers: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  addresses:
    "M12 21s-7-7-7-12a7 7 0 0114 0c0 5-7 12-7 12zM12 11a2 2 0 100-4 2 2 0 000 4z",
  notifications: "M6 8a6 6 0 1112 0v5l2 3H4l2-3zM10 19a2 2 0 004 0",
  sla: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  webhooks:
    "M9 12a3 3 0 116 0M6 16l3-5M18 16l-3-5M6 19a2 2 0 100-4 2 2 0 000 4zM18 19a2 2 0 100-4 2 2 0 000 4zM12 4a2 2 0 100 4 2 2 0 000-4z",
  apiKeys: "M14 8a4 4 0 11-1.1 7.9L10 19H7v-3l5-5A4 4 0 0114 8zM15 11h.01",
  billing: "M5 5h14v14H5zM5 9h14M9 13h6M9 17h3",
  integrationGov: "M4 7l4-3 4 3 4-3 4 3M4 17l4 3 4-3 4 3 4-3M4 7v10M20 7v10",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  bell: "M6 8a6 6 0 1112 0v5l2 3H4l2-3z",
  cmdk: "M7 3a3 3 0 100 6h10a3 3 0 100-6 3 3 0 00-3 3v12a3 3 0 103-3H7a3 3 0 10-3 3 3 3 0 003-3V6",
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  ext: "M14 4h6v6M10 14L20 4M19 13v6H5V5h6",
  copy: "M9 3h11v14H9zM5 7h11v14H5z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  filter: "M3 5h18l-7 9v6l-4-2v-4z",
  plus: "M12 5v14M5 12h14",
  check: "M5 13l4 4L19 7",
  x: "M6 6l12 12M18 6L6 18",
  warn: "M12 3l10 18H2zM12 10v5M12 17v.01",
  ok: "M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  pin: "M12 21l-5-5 5-9 5 9zM12 12v.01",
  arrow: "M5 12h14M13 6l6 6-6 6",
  car: "M3 17h18M5 17l2-7h10l2 7M7 17v2H5v-2M19 17v2h-2v-2",
  phone: "M3 5c0 9 7 16 16 16v-4l-4-2-2 2a12 12 0 01-6-6l2-2-2-4z",
  clock: "M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
} as const;

export type CanvasIconName = keyof typeof CANVAS_ICONS;

export interface CanvasIconProps {
  name: CanvasIconName;
  size?: number;
  stroke?: number;
  style?: CSSProperties;
}

export function CanvasIcon({
  name,
  size = 16,
  stroke = 1.6,
  style,
}: CanvasIconProps) {
  const path = CANVAS_ICONS[name] ?? CANVAS_ICONS.more;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flex: "0 0 auto", display: "block", ...style }}
    >
      {path
        .split("M")
        .filter(Boolean)
        .map((segment, index) => (
          <path key={`${name}-${index}`} d={`M${segment}`} />
        ))}
    </svg>
  );
}
