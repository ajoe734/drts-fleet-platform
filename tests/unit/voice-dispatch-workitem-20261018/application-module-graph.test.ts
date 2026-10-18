import { createRequire } from "node:module";
import { expect, it } from "vitest";
import { AppModule } from "../../../apps/api/src/app.module";

const require = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { NestContainer } = require("@nestjs/core/injector/container") as {
  NestContainer: new () => unknown;
};
const { MetadataScanner } = require("@nestjs/core/metadata-scanner") as {
  MetadataScanner: new () => unknown;
};
const { GraphInspector } =
  require("@nestjs/core/inspector/graph-inspector") as {
    GraphInspector: new (container: unknown) => unknown;
  };
const { DependenciesScanner } = require("@nestjs/core/scanner") as {
  DependenciesScanner: new (
    container: unknown,
    metadata: unknown,
    graph: unknown,
  ) => {
    scan(module: unknown): Promise<void>;
  };
};

// Scan real production module metadata without constructing application
// providers, running lifecycle hooks, or opening an API, database or server.
// This reproduces the undefined Callcenter import found by hosted API startup.
it("resolves the application module graph with the queued voice dispatch executor", async () => {
  const container = new NestContainer();
  const scanner = new DependenciesScanner(
    container,
    new MetadataScanner(),
    new GraphInspector(container),
  );
  await expect(scanner.scan(AppModule)).resolves.toBeUndefined();
});
