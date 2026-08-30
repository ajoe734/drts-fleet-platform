import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard for DRV-RWD-001:
 * - Scans apps/driver-app for position: "absolute" and asserts that every
 *   instance belongs to an explicitly justified whitelist.
 * - Asserts no newly introduced fixed width/height container constraints.
 * - Asserts that allowFontScaling={false} is never set to ensure iOS Dynamic Type
 *   and Android font accessibility scaling remain fully enabled.
 */

const ROOT = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components"];

/**
 * Whitelist of permitted absolute positioning in apps/driver-app with written justification.
 */
const JUSTIFIED_ABSOLUTE_POSITIONING: Record<
  string,
  { selector: string; justification: string }[]
> = {
  "app/index.tsx": [
    {
      selector: "headerActionDot",
      justification: "Interactive action button notification badge dot positioned in button corner.",
    },
    {
      selector: "heroGlowLarge",
      justification: "Non-interactive decorative background ambient lighting glow (pointerEvents none).",
    },
    {
      selector: "heroGlowSmall",
      justification: "Non-interactive decorative background ambient lighting glow (pointerEvents none).",
    },
  ],
  "app/onboarding.tsx": [
    {
      selector: "cockpitBellBadge",
      justification: "Interactive action button notification badge dot positioned in bell button corner.",
    },
    {
      selector: "provisionHeroGlow",
      justification: "Non-interactive decorative background ambient lighting glow.",
    },
    {
      selector: "heroGlow",
      justification: "Non-interactive decorative background ambient lighting glow.",
    },
  ],
  "app/safety-operator.tsx": [
    {
      selector: "frameGlowTop",
      justification: "Non-interactive decorative background ambient lighting glow (pointerEvents none).",
    },
    {
      selector: "frameGlowBottom",
      justification: "Non-interactive decorative background ambient lighting glow (pointerEvents none).",
    },
  ],
  "app/sos.tsx": [
    {
      selector: "holdButtonProgress",
      justification: "Animated horizontal progress overlay inside interactive hold-to-activate button.",
    },
    {
      selector: "falseAlarmFill",
      justification: "Animated slider track fill background for slide-to-confirm gesture.",
    },
    {
      selector: "falseAlarmThumb",
      justification: "Interactive draggable slider thumb positioned along the slider track.",
    },
  ],
};

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      files.push(...listSourceFiles(full));
      continue;
    }
    if (
      [".ts", ".tsx"].includes(extname(full)) &&
      !full.endsWith(".test.ts") &&
      !full.endsWith(".test.tsx")
    ) {
      files.push(full);
    }
  }
  return files;
}

describe("DRV-RWD-001: Responsive layout and sizing regression guards", () => {
  const files = SCAN_DIRS.flatMap((dir) => listSourceFiles(join(ROOT, dir)));

  it("discovers driver-app screen and component source files", () => {
    expect(files.length).toBeGreaterThan(15);
  });

  describe("Absolute positioning whitelist check", () => {
    for (const file of files) {
      const relPath = relative(ROOT, file);

      it(`verifies absolute positioning in ${relPath} is strictly whitelisted and justified`, () => {
        const source = stripComments(readFileSync(file, "utf8"));
        const absoluteMatches: string[] = [];

        // Match lines containing position: "absolute" or position: 'absolute'
        const regex = /([a-zA-Z0-9_]+)\s*:\s*\{[^}]*position\s*:\s*["']absolute["']/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(source)) !== null) {
          absoluteMatches.push(match[1]);
        }

        const allowed = JUSTIFIED_ABSOLUTE_POSITIONING[relPath] ?? [];
        const allowedSelectors = new Set(allowed.map((a) => a.selector));

        const unexpected = absoluteMatches.filter((s) => !allowedSelectors.has(s));
        expect(
          unexpected,
          `Found unapproved position: "absolute" in ${relPath}: ${unexpected.join(
            ", ",
          )}. Every absolute position must be justified in JUSTIFIED_ABSOLUTE_POSITIONING.`,
        ).toEqual([]);
      });
    }
  });

  describe("Font scaling accessibility guards", () => {
    for (const file of files) {
      const relPath = relative(ROOT, file);

      it(`ensures ${relPath} does not disable font scaling (allowFontScaling={false})`, () => {
        const source = stripComments(readFileSync(file, "utf8"));
        const disablesFontScaling =
          /allowFontScaling\s*=\s*\{\s*false\s*\}/.test(source) ||
          /allowFontScaling\s*:\s*false/.test(source);

        expect(
          disablesFontScaling,
          `${relPath} explicitly disables font scaling, breaking iOS Dynamic Type and Android accessibility!`,
        ).toBe(false);
      });
    }
  });

  describe("Hardcoded outer device viewport guards", () => {
    for (const file of files) {
      const relPath = relative(ROOT, file);

      it(`ensures ${relPath} has no hardcoded screen simulator dimensions (412x892)`, () => {
        const source = stripComments(readFileSync(file, "utf8"));
        const hasHardcodedWebCenter =
          /width\s*:\s*412/.test(source) || /height\s*:\s*892/.test(source);

        expect(
          hasHardcodedWebCenter,
          `${relPath} contains hardcoded viewport simulator dimensions (412x892).`,
        ).toBe(false);
      });
    }
  });
});
