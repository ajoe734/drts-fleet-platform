import { resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

// `next build` type-checks every file tsconfig.json includes. The Docker image
// copies this app and packages/, but not the repository-root tests/ directory,
// so a unit test that imports a root test helper (as
// enterprise-booking-lifecycle.test.ts does) failed the deploy-dev image build
// with TS2307. Simulate only that missing directory and build the real graph.
it("production TypeScript graph keeps app sources without repository test helpers", () => {
  const appRoot = resolve(__dirname, "../..");
  const repositoryTests = `${resolve(appRoot, "../../tests")}/`;
  const system = {
    ...ts.sys,
    fileExists: (file: string) =>
      !file.startsWith(repositoryTests) && ts.sys.fileExists(file),
    readFile: (file: string) =>
      file.startsWith(repositoryTests) ? undefined : ts.sys.readFile(file),
  };
  const config = ts.readConfigFile(
    resolve(appRoot, "tsconfig.json"),
    system.readFile,
  );
  expect(config.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(config.config, system, appRoot);
  expect(parsed.errors).toEqual([]);
  const host = ts.createCompilerHost(parsed.options);
  host.fileExists = system.fileExists;
  host.readFile = system.readFile;
  const program = ts.createProgram(parsed.fileNames, parsed.options, host);
  const files = program.getSourceFiles().map((file) => file.fileName);
  for (const source of [
    "app/bookings/review/booking-submit-button.tsx",
    "lib/api-client.ts",
    "lib/enterprise-booking-draft.ts",
  ]) {
    expect(files).toContain(resolve(appRoot, source));
  }
  expect(files.filter((file) => file.startsWith(`${appRoot}/tests/`))).toEqual(
    [],
  );
  expect(files.filter((file) => file.startsWith(repositoryTests))).toEqual([]);
});
