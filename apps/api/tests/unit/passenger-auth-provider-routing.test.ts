import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { MetadataScanner } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { PassengerAppModule } from "../../src/modules/passenger-app/passenger-app.module";

// Inspect the production module and Nest's actual route metadata. No HTTP
// listener, application bootstrap or provider/database/network logic is mocked.
describe("passenger auth provider discovery route", () => {
  it("registers exactly one GET passenger-app/auth/providers handler", () => {
    const controllers = Reflect.getMetadata(
      MODULE_METADATA.CONTROLLERS,
      PassengerAppModule,
    ) as { name: string; prototype: Record<string, object> }[];
    const scanner = new MetadataScanner();
    const matches: string[] = [];
    for (const controller of controllers) {
      if (
        Reflect.getMetadata(PATH_METADATA, controller) !== "passenger-app/auth"
      )
        continue;
      for (const name of scanner.getAllMethodNames(controller.prototype)) {
        const method = controller.prototype[name]!;
        if (
          Reflect.getMetadata(PATH_METADATA, method) === "providers" &&
          Reflect.getMetadata(METHOD_METADATA, method) === RequestMethod.GET
        )
          matches.push(`${controller.name}.${name}`);
      }
    }
    expect(matches, matches.join(", ")).toHaveLength(1);
  });
});
