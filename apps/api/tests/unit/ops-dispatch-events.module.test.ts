import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { OpsDispatchEventsModule } from "../../src/common/ops-dispatch-events.module";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { IncidentModule } from "../../src/modules/incident/incident.module";
import { OwnedMobilityModule } from "../../src/modules/owned-mobility/owned-mobility.module";
import { RegulatoryRegistryModule } from "../../src/modules/regulatory-registry/regulatory-registry.module";

describe("OpsDispatchEventsModule", () => {
  it("owns the dispatch event service provider", () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      OpsDispatchEventsModule,
    ) as unknown[];

    expect(providers).toContain(OpsDispatchEventsService);
  });

  it.each([IncidentModule, OwnedMobilityModule, RegulatoryRegistryModule])(
    "%s imports the singleton provider instead of redeclaring it",
    (consumerModule) => {
      const imports = Reflect.getMetadata(
        MODULE_METADATA.IMPORTS,
        consumerModule,
      ) as unknown[];
      const providers = Reflect.getMetadata(
        MODULE_METADATA.PROVIDERS,
        consumerModule,
      ) as unknown[];

      expect(imports).toContain(OpsDispatchEventsModule);
      expect(providers).not.toContain(OpsDispatchEventsService);
    },
  );
});
