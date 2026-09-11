import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// SR-WIRE-001: DriverLeaveModule (SR-LEAVE-BE-001), DriverAcademyModule
// (SR-ACADEMY-BE-001), and HostViewModule (SR-HOST-BE-001) each shipped with
// a working controller/service/repository but were never imported into
// AppModule -- their own module files carried an explicit "not registered
// by this task, owned by SR-WIRE-001" note (see
// apps/api/src/modules/driver-academy/driver-academy.module.ts). Without
// this registration none of their HTTP routes are reachable from a real
// NestJS app, no matter how correct the module's own code is.
//
// This is a source-text assertion (not a live NestFactory bootstrap) so it
// runs fast and without a database; the full-stack reachability claim is
// exercised in each module's own SR-*-BE-001 acceptance evidence plus the
// AppModule typecheck run recorded in SR-WIRE-001's evidence log.
describe("SR-WIRE-001: root module registration", () => {
  const source = readFileSync(
    new URL("../../../../apps/api/src/app.module.ts", import.meta.url),
    "utf8",
  );

  it.each([
    ["DriverLeaveModule", "./modules/driver-leave/driver-leave.module"],
    ["DriverAcademyModule", "./modules/driver-academy/driver-academy.module"],
    ["HostViewModule", "./modules/host-view/host-view.module"],
  ])("imports %s from %s", (className, importPath) => {
    expect(source).toContain(
      `import { ${className} } from "${importPath}";`,
    );
  });

  it("registers all three new modules inside the AppModule imports array", () => {
    const importsArrayMatch = source.match(/imports:\s*\[([\s\S]*?)\],\s*providers:/);
    expect(importsArrayMatch).not.toBeNull();
    const importsArrayBody = importsArrayMatch![1]!;

    expect(importsArrayBody).toMatch(/\bDriverLeaveModule\b/);
    expect(importsArrayBody).toMatch(/\bDriverAcademyModule\b/);
    expect(importsArrayBody).toMatch(/\bHostViewModule\b/);
  });
});
