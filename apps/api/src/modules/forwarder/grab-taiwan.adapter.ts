import { Injectable } from "@nestjs/common";
import { PLATFORM_CODE_GRAB_TAIWAN } from "@drts/contracts";

import { ForwarderSandboxAdapter } from "./sandbox.adapter";
import { buildForwarderSandboxFixtures } from "./sandbox.fixtures";

export const GRAB_TAIWAN_PLATFORM_CODE = PLATFORM_CODE_GRAB_TAIWAN;
export const GRAB_TAIWAN_SANDBOX_FIXTURES = buildForwarderSandboxFixtures({
  platformCode: GRAB_TAIWAN_PLATFORM_CODE,
  providerKey: "grab-taiwan",
  providerDisplayName: "Grab Taiwan",
  signatureHeaderName: "x-grab-signature",
});

@Injectable()
export class GrabTaiwanAdapter extends ForwarderSandboxAdapter {
  constructor() {
    super(GRAB_TAIWAN_SANDBOX_FIXTURES);
  }
}
