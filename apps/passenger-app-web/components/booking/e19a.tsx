import React from "react";
import { P5Phone, P5Header, P5Card, P5Btn, P5Notice, P5 } from "../p5-ui";

const E_FEES = [
  ["車資", "依主管機關核定運價計費（含延滯計時）"],
  ["預約費", "不另收取"],
  ["取消費", "不收取（指派前取消不收費）"],
  ["等待費", "不另收取（車資依核定運價含延滯計時計收）"],
  [
    "遺失物返還補償金",
    "不收取；如要求專程送還，所生車資由乘客負擔並於送還前確認",
  ],
  ["車內汙損清潔費", "由可歸責之乘客負擔實際清潔費用，實支實付、憑單據計收"],
  ["國道通行費", "經乘客同意行駛後實收"],
  ["優惠活動", "目前無；如有，依規定備查後於本頁公告"],
];

interface P5E19aProps {
  onAgree: () => void;
  fareVersion: string;
  effectiveAt: string;
}

export function P5E19a({ onAgree, fareVersion, effectiveAt }: P5E19aProps) {
  return (
    <P5Phone url="ride.smarttransport.tw/fares">
      <P5Header status="費用與優惠說明" order="公開資訊" />
      <div style={{ margin: "12px 14px 10px", fontSize: 12.5, color: P5.mut }}>
        下單前請確認以下收費規則
      </div>
      <P5Card>
        {E_FEES.map(([k, v], i) => (
          <div
            key={k}
            style={{
              padding: "9px 0",
              borderBottom:
                i < E_FEES.length - 1 ? "1px solid " + P5.lineSoft : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: P5.brand }}>
                {k}
              </span>
              {k === "優惠活動" && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: P5.mut,
                    background: P5.bg,
                    border: "1px solid " + P5.line,
                    padding: "1px 8px",
                    borderRadius: 999,
                  }}
                >
                  目前無
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 12.5,
                color: P5.ink,
                marginTop: 3,
                lineHeight: 1.55,
              }}
            >
              {v}
            </div>
          </div>
        ))}
      </P5Card>
      <div style={{ margin: "0 14px 12px", fontSize: 10.5, color: P5.dim }}>
        版本 {fareVersion} · 生效日{" "}
        {effectiveAt.substring(0, 10).replace(/-/g, "/")} ·
        依主管機關核定運價及備查優惠辦理
      </div>
      <div style={{ margin: "0 14px 8px" }}>
        <div onClick={onAgree}>
          <P5Btn kind="primary" icon="check">
            我已閱讀並同意
          </P5Btn>
        </div>
      </div>
      <div
        style={{
          margin: "0 14px 12px",
          fontSize: 10.5,
          color: P5.mut,
          textAlign: "center",
        }}
      >
        下單前將再次顯示費用摘要供您確認
      </div>
      <P5Notice />
    </P5Phone>
  );
}
