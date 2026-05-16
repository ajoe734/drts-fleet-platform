import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ManagementShell } from "./management-shell";
import { ManagementThemeProvider, useTheme } from "./management-theme-context";

function ThemeProbe() {
  const { density, dark, mode } = useTheme();

  return (
    <span data-density={density} data-dark={String(dark)} data-mode={mode} />
  );
}

describe("ManagementThemeProvider", () => {
  it("provides density and dark state through useTheme", () => {
    const markup = renderToStaticMarkup(
      <ManagementThemeProvider density="compact" dark>
        <ThemeProbe />
      </ManagementThemeProvider>,
    );

    expect(markup).toContain('data-density="compact"');
    expect(markup).toContain('data-dark="true"');
    expect(markup).toContain('data-mode="dark"');
  });

  it("lets ManagementShell consume theme defaults from context", () => {
    const markup = renderToStaticMarkup(
      <ManagementThemeProvider density="compact" dark>
        <ManagementShell>
          <div>content</div>
        </ManagementShell>
      </ManagementThemeProvider>,
    );

    expect(markup).toContain("padding:24px");
    expect(markup).toContain("background:#020617");
    expect(markup).toContain("color:#e2e8f0");
  });
});
