import type React from "react";

export const formLabelStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "#475569",
  marginBottom: 6,
};

export const formInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  boxSizing: "border-box",
  fontSize: 13.5,
};

export const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

export const formSectionTitleStyle: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 14,
  color: "#0f172a",
};

export const nestedCardStyle: React.CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 16,
  background: "#ffffff",
  boxShadow: "0 12px 24px rgba(15, 23, 42, 0.04)",
};

export const smallMutedStyle: React.CSSProperties = {
  fontSize: 12.5,
  color: "#64748b",
  lineHeight: 1.5,
};
