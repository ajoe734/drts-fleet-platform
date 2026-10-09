import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FcmFirstPartyPushProvider } from "../../../apps/api/src/modules/multi-taxi/fcm-push.provider";
import { FirstPartyNotificationTransport } from "../../../apps/api/src/modules/multi-taxi/first-party-notification.transport";
import { PassengerPushDevicesModule } from "../../../apps/api/src/modules/passenger-push-devices/passenger-push-devices.module";

afterEach(() => vi.unstubAllEnvs());
describe("first-party delivery stays dormant", () => {
  it("unset flag short-circuits provider and transport before credentials, DB or FCM I/O", async () => {
    vi.stubEnv("PASSENGER_PUSH_FIRST_PARTY_ENABLED", undefined);
    vi.stubEnv("PASSENGER_PUSH_FCM_PROJECT_ID", "synthetic-project");
    const network = vi.fn<typeof fetch>();
    const accessToken = vi.fn();
    const provider = new FcmFirstPartyPushProvider(
      { accessToken, identityToken: vi.fn() },
      network,
    );
    const query = vi.fn();
    const transport = new FirstPartyNotificationTransport(
      { findFirstPartyNotificationContextAndTokens: query } as never,
      {} as never,
      provider,
    );
    // Empty messages intentionally verify that even payload processing cannot
    // precede the disabled guard; these methods are the production entry points.
    expect(await provider.send({} as never, {} as never, vi.fn())).toEqual({
      kind: "configuration_blocked",
    });
    await expect(
      transport.send({ message: {}, context: {} } as never),
    ).rejects.toMatchObject({
      failure: { failureReason: "configuration_blocked" },
    });
    expect(query).not.toHaveBeenCalled();
    expect(accessToken).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("deployment files do not enable first-party push or configure a Firebase project", () => {
    const paths = execFileSync(
      "git",
      [
        "ls-files",
        "-z",
        ".github/workflows",
        "infra",
        "operations",
        "tools/local-development",
        ":(glob)**/Dockerfile*",
        ":(glob)**/*compose*.yml",
        ":(glob)**/.env*",
      ],
      { encoding: "utf8" },
    )
      .split("\0")
      .filter(Boolean);
    expect(paths).toContain(".github/workflows/deploy-dev.yml");
    expect(paths.length).toBeGreaterThan(100);
    const configured = paths.filter((path) =>
      /PASSENGER_PUSH_(FIRST_PARTY_ENABLED|FCM_PROJECT_ID)/.test(
        readFileSync(path, "utf8"),
      ),
    );
    expect(configured).toEqual([]);
  });

  it("no controller or runtime caller exposes the first-party registration seam", () => {
    expect(
      Reflect.getMetadata("controllers", PassengerPushDevicesModule) ?? [],
    ).toEqual([]);
    const paths = execFileSync("git", ["ls-files", "-z", "apps/api/src"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter((p) => p.endsWith(".ts"));
    const callers: string[] = [];
    for (const path of paths) {
      const file = ts.createSourceFile(
        path,
        readFileSync(path, "utf8"),
        ts.ScriptTarget.Latest,
        true,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ["registerDevice", "writeFirstPartyRoute"].includes(
            node.expression.name.text,
          )
        )
          callers.push(`${path}:${node.expression.name.text}`);
        ts.forEachChild(node, visit);
      }
      visit(file);
      if (path.endsWith(".controller.ts"))
        expect(file.text, path).not.toMatch(
          /PassengerPushDevices|FIRST_PARTY_PUSH_DEVICE_RESOLVER|passenger-push-devices/,
        );
    }
    expect(callers.sort()).toEqual([
      "apps/api/src/modules/passenger-push-devices/passenger-push-devices.service.ts:registerDevice",
      "apps/api/src/modules/passenger-push-devices/passenger-push-devices.service.ts:writeFirstPartyRoute",
    ]);
  });
});
