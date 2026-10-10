import {
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { MetadataScanner } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import { PassengerAppModule } from "../../src/modules/passenger-app/passenger-app.module";
import { PassengerOtpController } from "../../src/modules/passenger-app/otp/passenger-otp.controller";
import { AUTH_OPEN_ROUTE_KEY } from "../../src/common/auth/auth.constants";

// Inspect the production module and Nest's actual route metadata. No HTTP
// listener, application bootstrap or provider/database/network logic is mocked.
describe("passenger auth provider discovery route", () => {
  it.each([
    [RequestMethod.GET, "providers", "PassengerOAuthController.providers"],
    [RequestMethod.POST, "otp/request", "PassengerOtpController.request"],
    [RequestMethod.POST, "otp/verify", "PassengerOtpController.verify"],
    [
      RequestMethod.POST,
      "oauth/:provider/start",
      "PassengerOAuthController.start",
    ],
    [
      RequestMethod.POST,
      "oauth/:provider/callback",
      "PassengerOAuthController.callback",
    ],
  ])(
    "registers one open handler for method %s passenger-app/auth/%s",
    (verb, path, expected) => {
      const controllers = Reflect.getMetadata(
        MODULE_METADATA.CONTROLLERS,
        PassengerAppModule,
      ) as { name: string; prototype: Record<string, object> }[];
      const scanner = new MetadataScanner();
      const matches: string[] = [];
      for (const controller of controllers) {
        if (
          Reflect.getMetadata(PATH_METADATA, controller) !==
          "passenger-app/auth"
        )
          continue;
        for (const name of scanner.getAllMethodNames(controller.prototype)) {
          const method = controller.prototype[name]!;
          if (
            Reflect.getMetadata(PATH_METADATA, method) === path &&
            Reflect.getMetadata(METHOD_METADATA, method) === verb
          ) {
            matches.push(`${controller.name}.${name}`);
            expect(Reflect.getMetadata(AUTH_OPEN_ROUTE_KEY, method)).toBe(true);
          }
        }
      }
      expect(matches).toEqual([expected]);
    },
  );

  it("preserves the OTP providers helper and open metadata without registering another route", () => {
    const helper = PassengerOtpController.prototype.providers;
    expect(Reflect.getMetadata(AUTH_OPEN_ROUTE_KEY, helper)).toBe(true);
    expect(Reflect.getMetadata(PATH_METADATA, helper)).toBeUndefined();
    expect(Reflect.getMetadata(METHOD_METADATA, helper)).toBeUndefined();
  });
});
