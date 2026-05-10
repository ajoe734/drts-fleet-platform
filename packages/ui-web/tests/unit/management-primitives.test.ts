import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AuthorityBadge,
  AuthorityBanner,
  PlatformBadge,
  StatusChip,
} from "../../src/management-primitives";
import { managementSurfaceTone } from "../../src/management-theme";

describe("management primitives authority wrappers", () => {
  it("renders forwarded status chips from ui-tokens status metadata", () => {
    const markup = renderToStaticMarkup(
      createElement(StatusChip, {
        authority: "forwarded",
        status: "accept_pending",
      }),
    );

    expect(markup).toContain("等待平台確認");
    expect(markup).toContain(managementSurfaceTone("warning").background);
  });

  it("renders owned authority badges with localized defaults", () => {
    const markup = renderToStaticMarkup(
      createElement(AuthorityBadge, {
        authority: "owned",
        category: "authority",
      }),
    );

    expect(markup).toContain("自營派遣");
    expect(markup).toContain("authority");
    expect(markup).toContain(managementSurfaceTone("owned").background);
  });

  it("renders platform badges from surface display strings", () => {
    const markup = renderToStaticMarkup(
      createElement(PlatformBadge, { surface: "platform" }),
    );

    expect(markup).toContain("平台管理後台");
    expect(markup).toContain(managementSurfaceTone("platform").background);
  });

  it("renders forwarded authority banners with lifecycle status meta", () => {
    const markup = renderToStaticMarkup(
      createElement(AuthorityBanner, {
        authority: "forwarded",
        status: "sync_failed",
        title: "Manual intervention required",
        description: "Escalate the reassignment to platform operations.",
      }),
    );

    expect(markup).toContain("轉派訂單");
    expect(markup).toContain("同步失敗");
    expect(markup).toContain(managementSurfaceTone("danger").background);
  });
});
