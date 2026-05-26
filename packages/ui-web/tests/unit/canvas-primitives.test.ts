import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BiLabel,
  buildCanvasTheme,
  Checkbox,
  Code,
  Drawer,
  Modal,
  Pill,
  Stepper,
  Timeline,
  Toggle,
} from "../../src/canvas-primitives";

const theme = buildCanvasTheme({ surface: "ops", dark: true });

describe("canvas primitives", () => {
  it("renders realm-coloured pills using the theme.realm palette", () => {
    const markup = renderToStaticMarkup(
      createElement(Pill, { theme, tone: "driver" }, "Driver"),
    );
    expect(markup).toContain(theme.realm.driver.fg);
    expect(markup).toContain(theme.realm.driver.bg);
  });

  it("BiLabel renders zh primary with mono en suffix", () => {
    const markup = renderToStaticMarkup(
      createElement(BiLabel, { theme, zh: "派遣", en: "Dispatch" }),
    );
    expect(markup).toContain("派遣");
    expect(markup).toContain("Dispatch");
  });

  it("Code uses the mono font and surfaceLo background", () => {
    const markup = renderToStaticMarkup(
      createElement(Code, { theme }, "GET /health"),
    );
    expect(markup).toContain("GET /health");
    expect(markup).toContain("JetBrains Mono");
  });

  it("Toggle is keyboard-accessible (role=switch + aria-checked)", () => {
    const markup = renderToStaticMarkup(
      createElement(Toggle, { theme, on: true, label: "Notify" }),
    );
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-checked="true"');
  });

  it("Checkbox renders a labelled native input", () => {
    const markup = renderToStaticMarkup(
      createElement(Checkbox, { theme, on: false, label: "I agree" }),
    );
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("I agree");
  });

  it("Stepper marks the active step with the surface accent", () => {
    const markup = renderToStaticMarkup(
      createElement(Stepper, {
        theme,
        current: 1,
        steps: [{ t: "Draft" }, { t: "Review" }, { t: "Live" }],
      }),
    );
    expect(markup).toContain("Draft");
    expect(markup).toContain("Review");
    expect(markup).toContain(theme.accent);
  });

  it("Timeline renders a realm chip when actorRealm is provided", () => {
    const markup = renderToStaticMarkup(
      createElement(Timeline, {
        theme,
        events: [
          {
            t: "Override approved",
            actor: "yuli",
            actorRealm: "ops",
            at: "2026-05-26 10:21",
          },
        ],
      }),
    );
    expect(markup).toContain("Override approved");
    expect(markup).toContain(theme.realm.ops.fg);
  });

  it("Drawer renders as a labelled dialog when given a string title", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Drawer,
        { theme, title: "Order detail", subtitle: "ORD-001" },
        "body",
      ),
    );
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain("Order detail");
    expect(markup).toContain("ORD-001");
  });

  it("Modal renders a labelled modal dialog", () => {
    const markup = renderToStaticMarkup(
      createElement(
        Modal,
        { theme, title: "Confirm cancel", accent: theme.accent },
        "body",
      ),
    );
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain("Confirm cancel");
  });
});
