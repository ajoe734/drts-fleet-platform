import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const appRoot = resolve(__dirname, "../../../apps/driver-app");
const appRequire = createRequire(resolve(appRoot, "package.json"));
const expoRequire = createRequire(appRequire.resolve("expo/package.json"));
const { IOSConfig } = expoRequire("@expo/config-plugins");

it("links the driver capability module and includes the generated Maps configuration in the iOS app target", () => {
  const project = IOSConfig.XcodeUtils.getPbxproj(appRoot);
  const target = project.getFirstTarget().firstTarget;
  const objects = project.hash.project.objects;
  const pathsInPhase = (phaseType: string) => {
    const phase = target.buildPhases.find(
      (entry: { value: string }) => objects[phaseType][entry.value],
    );
    return objects[phaseType][phase.value].files.map(
      (entry: { value: string }) =>
        objects.PBXFileReference[objects.PBXBuildFile[entry.value].fileRef]
          .path,
    );
  };
  expect(target.name).toBe("DRTSDriverApp");
  expect(pathsInPhase("PBXSourcesBuildPhase")).toContain(
    "DRTSDriverApp/DRTSDriverMapConfig.m",
  );
  expect(pathsInPhase("PBXResourcesBuildPhase")).toContain(
    "Pods/DRTSDriverGoogleMaps.txt",
  );
});

it("allows the driver to check whether Google Maps can open external navigation", () => {
  const pluginRequire = createRequire(
    expoRequire.resolve("@expo/config-plugins"),
  );
  const plist = pluginRequire("@expo/plist").default;
  const infoPath = IOSConfig.Paths.getInfoPlistPath(appRoot);
  const info = plist.parse(readFileSync(infoPath, "utf8"));
  expect(info.LSApplicationQueriesSchemes).toContain("comgooglemaps");
});
