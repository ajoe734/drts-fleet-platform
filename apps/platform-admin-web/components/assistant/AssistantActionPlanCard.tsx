"use client";

import type { CSSProperties } from "react";
import { CheckCircle2, Circle, Clock3, ShieldAlert } from "lucide-react";
import { CanvasPill as Pill } from "@drts/ui-web";
import {
  assistantCardStyle,
  assistantInsetStyle,
  assistantMutedTextStyle,
  assistantRiskTone,
  assistantStepTone,
  assistantTheme,
  type AssistantActionPlan,
  type AssistantActionPlanStep,
} from "./assistant-types";

const bodyStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 18,
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "start",
  flexWrap: "wrap",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: assistantTheme.text,
  fontSize: 17,
  fontWeight: 700,
  lineHeight: 1.3,
};

const summaryStyle: CSSProperties = {
  margin: "6px 0 0",
  ...assistantMutedTextStyle,
};

const metaGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
};

const metaItemStyle: CSSProperties = {
  ...assistantInsetStyle,
  padding: "10px 12px",
  display: "grid",
  gap: 4,
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: assistantTheme.textDim,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontWeight: 700,
};

const valueStyle: CSSProperties = {
  color: assistantTheme.text,
  fontSize: 13,
  lineHeight: 1.45,
};

const stepListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const stepStyle: CSSProperties = {
  ...assistantInsetStyle,
  padding: "12px 14px",
  display: "grid",
  gap: 6,
};

function stepIcon(step: AssistantActionPlanStep) {
  switch (step.status) {
    case "completed":
      return <CheckCircle2 size={15} color={assistantTheme.success} />;
    case "in_progress":
      return <Clock3 size={15} color={assistantTheme.info} />;
    case "blocked":
      return <ShieldAlert size={15} color={assistantTheme.danger} />;
    case "pending":
    default:
      return <Circle size={15} color={assistantTheme.textDim} />;
  }
}

export function AssistantActionPlanCard({
  plan,
}: {
  plan: AssistantActionPlan;
}) {
  return (
    <section style={assistantCardStyle} aria-label="Assistant action plan">
      <div style={bodyStyle}>
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <h3 style={titleStyle}>{plan.title}</h3>
            {plan.summary ? <p style={summaryStyle}>{plan.summary}</p> : null}
          </div>
          {plan.riskLevel ? (
            <Pill
              theme={assistantTheme}
              tone={assistantRiskTone(plan.riskLevel)}
            >
              {plan.riskLevel.toUpperCase()} RISK
            </Pill>
          ) : null}
        </div>

        {(plan.resourceLabel || plan.rationale) && (
          <div style={metaGridStyle}>
            {plan.resourceLabel ? (
              <div style={metaItemStyle}>
                <div style={labelStyle}>Resource</div>
                <div style={valueStyle}>{plan.resourceLabel}</div>
              </div>
            ) : null}
            {plan.rationale ? (
              <div style={metaItemStyle}>
                <div style={labelStyle}>Why now</div>
                <div style={valueStyle}>{plan.rationale}</div>
              </div>
            ) : null}
          </div>
        )}

        <div style={stepListStyle}>
          {plan.steps.map((step, index) => (
            <div key={step.id} style={stepStyle}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minWidth: 0,
                  }}
                >
                  {stepIcon(step)}
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: assistantTheme.text,
                        fontSize: 13.5,
                        fontWeight: 600,
                      }}
                    >
                      {index + 1}. {step.title}
                    </div>
                  </div>
                </div>
                <Pill
                  theme={assistantTheme}
                  tone={assistantStepTone(step.status)}
                >
                  {step.status.replace("_", " ")}
                </Pill>
              </div>
              {step.detail ? (
                <div style={assistantMutedTextStyle}>{step.detail}</div>
              ) : null}
            </div>
          ))}
        </div>

        {plan.warnings && plan.warnings.length > 0 ? (
          <div
            style={{
              ...assistantInsetStyle,
              padding: "12px 14px",
              background: assistantTheme.warnBg,
              borderColor: assistantTheme.warnBorder,
              display: "grid",
              gap: 6,
            }}
          >
            <div style={{ ...labelStyle, color: assistantTheme.warn }}>
              Attention
            </div>
            {plan.warnings.map((warning) => (
              <div
                key={warning}
                style={{ ...valueStyle, color: assistantTheme.warn }}
              >
                {warning}
              </div>
            ))}
          </div>
        ) : null}

        {plan.footer ? <div>{plan.footer}</div> : null}
      </div>
    </section>
  );
}
