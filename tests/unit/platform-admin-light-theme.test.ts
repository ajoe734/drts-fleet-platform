import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function collectTsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      return collectTsxFiles(path);
    }

    return path.endsWith(".tsx") ? [path] : [];
  });
}

describe("Platform Admin product routes", () => {
  it("do not opt route bodies back into the legacy dark canvas theme", () => {
    const routeDir = join(process.cwd(), "apps/platform-admin-web/app");
    const offenders = collectTsxFiles(routeDir).filter((file) =>
      /buildCanvasTheme\s*\([^)]*dark\s*:\s*true/s.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(
      offenders.map((file) => file.replace(`${process.cwd()}/`, "")),
    ).toEqual([]);
  });
});
