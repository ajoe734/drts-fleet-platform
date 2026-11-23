import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const app = fileURLToPath(
  new URL("../../../apps/driver-app/android/app/", import.meta.url),
);
const manifest = readFileSync(
  join(app, "src/main/AndroidManifest.xml"),
  "utf8",
);
const kotlin = join(app, "src/main/java/com/cctechsupport/drts/driver");
const gradle = readFileSync(join(app, "build.gradle"), "utf8");
const resourceName = "driver_google_maps_key";

it("connects the checked Android project, Google SDK and RN capability to one string resource", () => {
  expect(gradle).toContain(
    `resValue "string", "${resourceName}", providers.environmentVariable("GOOGLE_MAPS_ANDROID_KEY").getOrElse("").trim()`,
  );
  expect(manifest).toContain(
    `android:name="com.google.android.geo.API_KEY" android:value="@string/${resourceName}"`,
  );
  const queries = manifest.match(/<queries>([\s\S]*?)<\/queries>/)?.[1];
  const viewIntents = Array.from(
    queries?.matchAll(/<intent>([\s\S]*?)<\/intent>/g) ?? [],
  )
    .map((match) => match[1])
    .filter((intent) =>
      intent.includes('android:name="android.intent.action.VIEW"'),
    );
  for (const scheme of ["https", "google.navigation"]) {
    expect(
      viewIntents.some((intent) =>
        intent.includes(`android:scheme="${scheme}"`),
      ),
    ).toBe(true);
  }
  expect(readFileSync(join(kotlin, "MainApplication.kt"), "utf8")).toContain(
    "add(DriverMapConfigPackage())",
  );
  const bridge = readFileSync(
    join(kotlin, "DriverMapConfigPackage.kt"),
    "utf8",
  );
  expect(bridge).toContain('"DRTSDriverMapConfig"');
  expect(bridge).toContain(
    `"googleMapsConfigured" to reactApplicationContext.getString(R.string.${resourceName}).isNotBlank()`,
  );
});

function sdkFile(directory: string, file: string) {
  if (!existsSync(directory)) return undefined;
  return readdirSync(directory)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map((version) => join(directory, version, file))
    .find(existsSync);
}

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const aapt =
  process.env.DRTS_TEST_AAPT2 ||
  (sdk && sdkFile(join(sdk, "build-tools"), "aapt2"));
const framework =
  process.env.DRTS_TEST_ANDROID_FRAMEWORK ||
  (sdk && sdkFile(join(sdk, "platforms"), "android.jar"));

it.skipIf(!aapt || !framework).each([
  ["configured", "fixture-driver-maps-key"],
  ["unconfigured", ""],
])("links the packaged manifest to the %s resource", (_name, value) => {
  const dir = mkdtempSync(join(tmpdir(), "driver-map-resources-"));
  try {
    // AGP supplies the namespace and generated string. Stub the other RN resources
    // so aapt2 can link the complete product manifest without a device or signing.
    mkdirSync(join(dir, "res/values"), { recursive: true });
    writeFileSync(
      join(dir, "AndroidManifest.xml"),
      manifest.replace(
        "<manifest ",
        '<manifest package="com.cctechsupport.drts.driver" ',
      ),
    );
    writeFileSync(
      join(dir, "res/values/fixtures.xml"),
      `<resources>
      <string name="app_name">Driver</string><string name="expo_runtime_version">1</string>
      <style name="AppTheme"/><style name="Theme.App.SplashScreen" parent=""/>
      <item name="ic_launcher" type="mipmap">@android:color/transparent</item>
      <item name="ic_launcher_round" type="mipmap">@android:color/transparent</item>
      <string name="${resourceName}">${value}</string>
    </resources>`,
    );
    const run = (...args: string[]) =>
      execFileSync(aapt!, args, {
        cwd: dir,
        encoding: "utf8",
        timeout: 15_000,
      });
    run("compile", "--dir", "res", "-o", "res.zip");
    run(
      "link",
      "-I",
      framework!,
      "--manifest",
      "AndroidManifest.xml",
      "-o",
      "fixture.apk",
      "res.zip",
    );
    const resources = run("dump", "resources", "fixture.apk");
    const resource = resources.match(
      new RegExp(
        `resource (0x[\\da-f]+) string/${resourceName}\\s*\\n\\s*\\(\\) "([^"]*)"`,
      ),
    );
    expect(resource?.[2]).toBe(value);
    const xml = run(
      "dump",
      "xmltree",
      "fixture.apk",
      "--file",
      "AndroidManifest.xml",
    );
    const packagedQueries = xml
      .split("E: queries")[1]
      ?.split("E: application")[0];
    for (const scheme of ["https", "google.navigation"]) {
      expect(packagedQueries).toContain(`"${scheme}"`);
    }
    const metadata = xml
      .split(/^\s*E: /m)
      .find((element) => element.includes('"com.google.android.geo.API_KEY"'));
    expect(metadata).toContain(resource![1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
