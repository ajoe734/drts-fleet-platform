import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { CredentialStatus, type PlatformAdapter } from "@drts/contracts";

import { defaultAdapters } from "../../../../apps/platform-admin-web/lib/AdapterManager";
import {
  RegistryNotice,
  REGISTRY_NOTICE_COPY,
} from "../../../../apps/platform-admin-web/app/adapter-registry/registry-notice";
import { buildCanvasTheme } from "../../../../packages/ui-web/src/canvas-tokens";

// Use the app's existing React runtime; no shared dependency/config changes.
const appRequire = createRequire(
  new URL("../../../../apps/platform-admin-web/package.json", import.meta.url),
);
const { createElement } = appRequire("react") as typeof import("react");
const { renderToStaticMarkup } = appRequire(
  "react-dom/server",
) as typeof import("react-dom/server");

const theme = buildCanvasTheme({ surface: "platform", density: "compact" });

// Isolated UI contract data only. This is not a registered/live adapter.
function adapter(overrides: Partial<PlatformAdapter> = {}): PlatformAdapter {
  return {
    ...defaultAdapters()[0]!,
    id: "sr-admin-adapter-unit-001",
    name: "Unit test adapter",
    platformCode: "TEST",
    ...overrides,
  };
}

function renderNotice({
  adapters = [adapter()],
  loading = false,
  error = null,
  locale = "en",
}: {
  adapters?: PlatformAdapter[];
  loading?: boolean;
  error?: string | null;
  locale?: keyof typeof REGISTRY_NOTICE_COPY;
} = {}) {
  const copy = REGISTRY_NOTICE_COPY[locale];
  return renderToStaticMarkup(
    createElement(RegistryNotice, {
      theme,
      adapters,
      loading,
      error,
      title: (entry) => copy.title(entry.platformCode),
      body: (entry) =>
        `${copy.body(entry.name, entry.credentialStatus, entry.healthStatus.status)} ${copy.unknownExpiry}`,
    }),
  );
}

describe("SR-ADMIN-ADAPTER-001 registry notices", () => {
  it("shows no invented expiry warning for loading, empty, or healthy data", () => {
    expect(renderNotice({ loading: true })).toBe("");
    expect(renderNotice({ adapters: [] })).toBe("");
    expect(renderNotice()).toBe("");
  });

  it.each(["404 Not Found", "403 Forbidden", "503 Service Unavailable"])(
    "does not show an adapter warning after %s, even with stale attention data",
    (error) => {
      expect(
        renderNotice({
          error,
          adapters: [adapter({ credentialStatus: CredentialStatus.EXPIRED })],
        }),
      ).toBe("");
    },
  );

  it("suppresses stale warnings during reload", () => {
    expect(
      renderNotice({
        loading: true,
        adapters: [adapter({ credentialStatus: CredentialStatus.INVALID })],
      }),
    ).toBe("");
  });

  it.each(["en", "zh"] as const)(
    "reports actual degraded health without claiming an expiry date (%s)",
    (locale) => {
      const output = renderNotice({
        locale,
        adapters: [
          adapter({
            healthStatus: {
              status: "DEGRADED",
              lastCheckTimestamp: null,
              message: null,
            },
          }),
        ],
      });
      expect(output).toContain("Unit test adapter");
      expect(output).toContain("DEGRADED");
      expect(output).toContain(REGISTRY_NOTICE_COPY[locale].unknownExpiry);
      expect(output).not.toMatch(/mof-bgmt|2026-05-31|6 days|6 天|<button/);
    },
  );

  it("preserves reported expired credentials without fabricating a timestamp or rotation action", () => {
    const output = renderNotice({
      adapters: [adapter({ credentialStatus: CredentialStatus.EXPIRED })],
    });
    expect(output).toContain("EXPIRED");
    expect(output).toContain(REGISTRY_NOTICE_COPY.en.unknownExpiry);
    expect(output).not.toMatch(/2026-05-31|expires in|Rotate now|<button/);
  });
});
