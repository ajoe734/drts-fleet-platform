import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ActionReceipt, ConfirmModal } from "../../src/canvas-primitives";

describe("canvas primitives", () => {
  it("renders audit and resource links as clickable anchors when href is provided", () => {
    const markup = renderToStaticMarkup(
      createElement(ActionReceipt, {
        title: "Dispatch override published",
        auditId: "aud_20260525_8821",
        auditLink: {
          label: "View audit",
          href: "/audit?auditId=aud_20260525_8821",
          openMode: "new_tab",
          crossApp: true,
        },
        resourceLink: {
          label: "Open reconciliation",
          href: "/reconciliation/orders/OWN-240525-018",
          openMode: "same_tab",
        },
        dismissible: false,
      }),
    );

    expect(markup).toContain('href="/audit?auditId=aud_20260525_8821"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('href="/reconciliation/orders/OWN-240525-018"');
  });

  it("accepts explicit reason state for high-risk confirm flows with custom fields", () => {
    const markup = renderToStaticMarkup(
      createElement(ConfirmModal, {
        risk: "high",
        title: "Force driver offline",
        body: "This action will suspend platform matching until manually restored.",
        reasonField: createElement("textarea", {
          defaultValue: "Manual override approved by shift lead.",
          readOnly: true,
        }),
        reasonProvided: true,
      }),
    );

    expect(markup).toContain("<textarea");
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>確認<\/button>/);
  });

  it("keeps high-risk confirm disabled when no reason has been provided", () => {
    const markup = renderToStaticMarkup(
      createElement(ConfirmModal, {
        risk: "high",
        title: "Force driver offline",
        body: "This action will suspend platform matching until manually restored.",
      }),
    );

    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>確認<\/button>/);
  });
});
