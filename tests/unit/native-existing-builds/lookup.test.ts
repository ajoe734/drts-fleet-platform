import { execFileSync } from "node:child_process";
import { createHash, createSign } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const lookup = require("../../../operations/verification/native-existing-builds/lookup.cjs");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const INSPECT_SCRIPT = path.join(
  REPO_ROOT,
  "operations",
  "verification",
  "native-existing-builds",
  "inspect-artifacts.py",
);

const SENTINEL_TOKEN = "expo_secret_token_sentinel_998877665544332211";
const HEAD_SHA = "460265594599b7e1f4e951dcc43a9e6c78a50a96";
const SIX_DIGIT_SHA = "0e722795dec202e960e504a8fa67526fc567ed0f";
const ANDROID_ID = "cb4b7f81-90bd-481e-970a-fbb1009582c0";
const IOS_ID = "3f4d1b8b-9811-4d03-ab31-e7554de30bff";
const DRIVER_PROJECT_ID = "7f8583f8-a32d-49b8-973d-ddd34ac9b71c";

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    WORKFLOW_MODE: "lookup-existing",
    EXPO_TOKEN: SENTINEL_TOKEN,
    DRIVER_APP_EAS_PROJECT_ID: DRIVER_PROJECT_ID,
    LOOKUP_ANDROID_BUILD_ID: ANDROID_ID,
    LOOKUP_IOS_BUILD_ID: IOS_ID,
    LOOKUP_EXPECTED_SOURCE_SHA: SIX_DIGIT_SHA,
    SUBMIT_TO_TESTFLIGHT: "false",
    GITHUB_SHA: HEAD_SHA,
    GITHUB_REPOSITORY: "ajoe734/drts-fleet-platform",
    GITHUB_REF: "refs/heads/dev",
    GITHUB_RUN_ID: "5511223344",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    ...overrides,
  };
}

function buildLengthPrefixed(buf: Buffer): Buffer {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buf.length, 0);
  return Buffer.concat([header, buf]);
}

function buildMinimalAndroidBinaryXml(pkgName: string): Buffer {
  // Strings in pool:
  // 0: "name", 1: "versionCode", 2: "versionName", 3: "minSdkVersion",
  // 4: "targetSdkVersion", 5: "scheme", 6: "package", 7: "manifest",
  // 8: "uses-sdk", 9: "uses-permission", 10: "application", 11: "activity",
  // 12: "intent-filter", 13: "data", 14: "service", 15: pkgName,
  // 16: "0.1.0", 17: "android.permission.ACCESS_BACKGROUND_LOCATION",
  // 18: "android.permission.FOREGROUND_SERVICE_LOCATION",
  // 19: "com.cctechsupport.drts.driver.MainApplication",
  // 20: "com.cctechsupport.drts.driver.MainActivity",
  // 21: "drts-driver",
  // 22: "expo.modules.location.services.LocationTaskService"
  const poolStrings = [
    "name",
    "versionCode",
    "versionName",
    "minSdkVersion",
    "targetSdkVersion",
    "scheme",
    "package",
    "manifest",
    "uses-sdk",
    "uses-permission",
    "application",
    "activity",
    "intent-filter",
    "data",
    "service",
    pkgName,
    "0.1.0",
    "android.permission.ACCESS_BACKGROUND_LOCATION",
    "android.permission.FOREGROUND_SERVICE_LOCATION",
    "com.cctechsupport.drts.driver.MainApplication",
    "com.cctechsupport.drts.driver.MainActivity",
    "drts-driver",
    "expo.modules.location.services.LocationTaskService",
  ];

  // Encode UTF-8 string pool (RES_STRING_POOL_TYPE = 0x0001)
  const encodedStrings: Buffer[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;
  for (const s of poolStrings) {
    offsets.push(currentOffset);
    const utf8 = Buffer.from(s, "utf8");
    const entry = Buffer.concat([
      Buffer.from([s.length, utf8.length]),
      utf8,
      Buffer.from([0]),
    ]);
    encodedStrings.push(entry);
    currentOffset += entry.length;
  }
  while (currentOffset % 4 !== 0) {
    encodedStrings.push(Buffer.from([0]));
    currentOffset += 1;
  }
  const offsetsBuf = Buffer.alloc(poolStrings.length * 4);
  offsets.forEach((off, i) => offsetsBuf.writeUInt32LE(off, i * 4));
  const poolDataBuf = Buffer.concat(encodedStrings);
  const poolHeaderSize = 28;
  const stringsStart = poolHeaderSize + offsetsBuf.length;
  const poolChunkSize = stringsStart + poolDataBuf.length;
  const poolHeader = Buffer.alloc(poolHeaderSize);
  poolHeader.writeUInt16LE(0x0001, 0);
  poolHeader.writeUInt16LE(poolHeaderSize, 2);
  poolHeader.writeUInt32LE(poolChunkSize, 4);
  poolHeader.writeUInt32LE(poolStrings.length, 8);
  poolHeader.writeUInt32LE(0, 12);
  poolHeader.writeUInt32LE(1 << 8, 16); // UTF8_FLAG
  poolHeader.writeUInt32LE(stringsStart, 20);
  poolHeader.writeUInt32LE(0, 24);
  const stringPoolChunk = Buffer.concat([poolHeader, offsetsBuf, poolDataBuf]);

  function makeAttr(
    nameIdx: number,
    rawValIdx: number,
    dataType: number,
    dataVal: number,
  ): Buffer {
    const b = Buffer.alloc(20);
    b.writeInt32LE(-1, 0); // ns
    b.writeInt32LE(nameIdx, 4);
    b.writeInt32LE(rawValIdx, 8);
    b.writeUInt16LE(8, 12);
    b.writeUInt8(0, 14);
    b.writeUInt8(dataType, 15);
    b.writeUInt32LE(dataVal, 16);
    return b;
  }

  function startElem(nameIdx: number, attrs: Buffer[]): Buffer {
    const headerSize = 16;
    const chunkSize = 36 + attrs.length * 20;
    const b = Buffer.alloc(36);
    b.writeUInt16LE(0x0102, 0);
    b.writeUInt16LE(headerSize, 2);
    b.writeUInt32LE(chunkSize, 4);
    b.writeUInt32LE(1, 8);
    b.writeInt32LE(-1, 12);
    b.writeInt32LE(-1, 16); // ns
    b.writeInt32LE(nameIdx, 20);
    b.writeUInt16LE(20, 24); // attr_start
    b.writeUInt16LE(20, 26); // attr_size
    b.writeUInt16LE(attrs.length, 28);
    return Buffer.concat([b, ...attrs]);
  }

  function endElem(nameIdx: number): Buffer {
    const b = Buffer.alloc(24);
    b.writeUInt16LE(0x0103, 0);
    b.writeUInt16LE(16, 2);
    b.writeUInt32LE(24, 4);
    b.writeUInt32LE(1, 8);
    b.writeInt32LE(-1, 12);
    b.writeInt32LE(-1, 16);
    b.writeInt32LE(nameIdx, 20);
    return b;
  }

  const elements = Buffer.concat([
    // <manifest package=pkgName versionCode=1 versionName="0.1.0">
    startElem(7, [
      makeAttr(6, 15, 0x03, 15),
      makeAttr(1, -1, 0x10, 1),
      makeAttr(2, 16, 0x03, 16),
    ]),
    // <uses-sdk minSdkVersion=24 targetSdkVersion=36 />
    startElem(8, [makeAttr(3, -1, 0x10, 24), makeAttr(4, -1, 0x10, 36)]),
    endElem(8),
    // <uses-permission name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    startElem(9, [makeAttr(0, 17, 0x03, 17)]),
    endElem(9),
    // <uses-permission name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    startElem(9, [makeAttr(0, 18, 0x03, 18)]),
    endElem(9),
    // <application name="com.cctechsupport.drts.driver.MainApplication">
    startElem(10, [makeAttr(0, 19, 0x03, 19)]),
    // <activity name="com.cctechsupport.drts.driver.MainActivity">
    startElem(11, [makeAttr(0, 20, 0x03, 20)]),
    startElem(12, []),
    startElem(13, [makeAttr(5, 21, 0x03, 21)]),
    endElem(13),
    endElem(12),
    endElem(11),
    // <service name="expo.modules.location.services.LocationTaskService" />
    startElem(14, [makeAttr(0, 22, 0x03, 22)]),
    endElem(14),
    endElem(10),
    endElem(7),
  ]);

  const totalSize = 8 + stringPoolChunk.length + elements.length;
  const fileHeader = Buffer.alloc(8);
  fileHeader.writeUInt16LE(0x0003, 0);
  fileHeader.writeUInt16LE(8, 2);
  fileHeader.writeUInt32LE(totalSize, 4);
  return Buffer.concat([fileHeader, stringPoolChunk, elements]);
}

function createSignedAndroidApk(
  tempDir: string,
  pkgName = "com.cctechsupport.drts.driver",
): string {
  const unsignedZipPath = path.join(tempDir, "unsigned.apk");
  const manifestPath = path.join(tempDir, "AndroidManifest.xml");
  const dexPath = path.join(tempDir, "classes.dex");
  const assetsDir = path.join(tempDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  const appConfigPath = path.join(assetsDir, "app.config");

  fs.writeFileSync(manifestPath, buildMinimalAndroidBinaryXml(pkgName));
  fs.writeFileSync(dexPath, Buffer.from("dex\n035\x00driver_classes_stub"));
  fs.writeFileSync(
    appConfigPath,
    JSON.stringify({
      name: "智行司機",
      slug: "drts-driver-app",
      version: "0.1.0",
      scheme: "drts-driver",
      extra: {
        eas: { projectId: DRIVER_PROJECT_ID },
        apiBaseUrl: "https://drts-dev-api-4t7rg6fmeq-uc.a.run.app",
      },
      ios: { bundleIdentifier: pkgName, buildNumber: "1" },
      android: { package: pkgName, versionCode: 1 },
    }),
  );

  execFileSync(
    "python3",
    [
      "-c",
      `import pathlib, sys, zipfile
base = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(base / "unsigned.apk", "w", zipfile.ZIP_DEFLATED) as z:
    z.write(base / "AndroidManifest.xml", "AndroidManifest.xml")
    z.write(base / "classes.dex", "classes.dex")
    z.write(base / "assets" / "app.config", "assets/app.config")
`,
      tempDir,
    ],
    { stdio: "ignore" },
  );

  // Generate RSA key & self-signed X.509 DER certificate via openssl
  const keyPemPath = path.join(tempDir, "apk-key.pem");
  const certDerPath = path.join(tempDir, "apk-cert.der");
  const pubDerPath = path.join(tempDir, "apk-pub.der");
  execFileSync(
    "openssl",
    [
      "req",
      "-new",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPemPath,
      "-outform",
      "DER",
      "-out",
      certDerPath,
      "-days",
      "365",
      "-subj",
      "/C=TW/ST=Taiwan/L=Taipei/O=CCTech Support/OU=Mobile/CN=DRTS Mobility",
    ],
    { stdio: "ignore" },
  );
  execFileSync(
    "openssl",
    [
      "pkey",
      "-in",
      keyPemPath,
      "-pubout",
      "-outform",
      "DER",
      "-out",
      pubDerPath,
    ],
    { stdio: "ignore" },
  );

  const rawZip = fs.readFileSync(unsignedZipPath);
  const eocdPos = rawZip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const cdOffset = rawZip.readUInt32LE(eocdPos + 16);

  const beforeCd = rawZip.subarray(0, cdOffset);
  const centralDir = rawZip.subarray(cdOffset, eocdPos);
  const eocdForDigest = Buffer.from(rawZip.subarray(eocdPos));
  eocdForDigest.writeUInt32LE(cdOffset, 16);

  // Compute APK v2 SHA-256 1 MiB chunk digest
  const chunkDigests: Buffer[] = [];
  for (const section of [beforeCd, centralDir, eocdForDigest]) {
    let pos = 0;
    while (pos < section.length) {
      const chunk = section.subarray(pos, pos + 1048576);
      pos += chunk.length;
      const prefix = Buffer.alloc(5);
      prefix[0] = 0xa5;
      prefix.writeUInt32LE(chunk.length, 1);
      chunkDigests.push(
        createHash("sha256").update(prefix).update(chunk).digest(),
      );
    }
  }
  const topPrefix = Buffer.alloc(5);
  topPrefix[0] = 0x5a;
  topPrefix.writeUInt32LE(chunkDigests.length, 1);
  const topDigest = createHash("sha256")
    .update(topPrefix)
    .update(Buffer.concat(chunkDigests))
    .digest();

  const algoIdBuf = Buffer.alloc(4);
  algoIdBuf.writeUInt32LE(0x0103, 0); // RSA PKCS#1 v1.5 with SHA-256
  const digestEntry = buildLengthPrefixed(
    Buffer.concat([algoIdBuf, buildLengthPrefixed(topDigest)]),
  );
  const digestsSeq = buildLengthPrefixed(digestEntry);
  const certDer = fs.readFileSync(certDerPath);
  const certsSeq = buildLengthPrefixed(buildLengthPrefixed(certDer));
  const additionalAttrs = buildLengthPrefixed(Buffer.alloc(0));
  const signedData = Buffer.concat([
    digestsSeq,
    certsSeq,
    additionalAttrs,
    Buffer.alloc(4),
  ]);

  const signer = createSign("RSA-SHA256");
  signer.update(signedData);
  const sigBytes = signer.sign(fs.readFileSync(keyPemPath));
  const sigEntry = buildLengthPrefixed(
    Buffer.concat([algoIdBuf, buildLengthPrefixed(sigBytes)]),
  );
  const signaturesSeq = buildLengthPrefixed(sigEntry);
  const pubKeyDer = fs.readFileSync(pubDerPath);

  const signerBlock = buildLengthPrefixed(
    Buffer.concat([
      buildLengthPrefixed(signedData),
      signaturesSeq,
      buildLengthPrefixed(pubKeyDer),
    ]),
  );
  const v2Payload = buildLengthPrefixed(signerBlock);

  const pairHeader = Buffer.alloc(12);
  pairHeader.writeBigUInt64LE(BigInt(4 + v2Payload.length), 0);
  pairHeader.writeUInt32LE(0x7109871a, 8);
  const pairBuf = Buffer.concat([pairHeader, v2Payload]);

  const blockSize = BigInt(pairBuf.length + 8 + 16);
  const blockHeader = Buffer.alloc(8);
  blockHeader.writeBigUInt64LE(blockSize, 0);
  const blockFooter = Buffer.alloc(24);
  blockFooter.writeBigUInt64LE(blockSize, 0);
  Buffer.from("APK Sig Block 42", "ascii").copy(blockFooter, 8);

  const sigBlock = Buffer.concat([blockHeader, pairBuf, blockFooter]);
  const finalEocd = Buffer.from(rawZip.subarray(eocdPos));
  finalEocd.writeUInt32LE(cdOffset + sigBlock.length, 16);

  const signedApkPath = path.join(tempDir, "signed-driver.apk");
  fs.writeFileSync(
    signedApkPath,
    Buffer.concat([beforeCd, sigBlock, centralDir, finalEocd]),
  );
  return signedApkPath;
}

function createSignedIosIpa(
  tempDir: string,
  bundleId = "com.cctechsupport.drts.driver",
): string {
  const signedIpaPath = path.join(tempDir, "signed-driver.ipa");
  execFileSync(
    "python3",
    [
      "-c",
      `import hashlib, pathlib, plistlib, struct, subprocess, sys, zipfile

base = pathlib.Path(sys.argv[1])
bundle_id = sys.argv[2]

key_pem = base / "ios-key.pem"
cert_pem = base / "ios-cert.pem"
cert_der = base / "ios-cert.der"
subprocess.run([
    "openssl", "req", "-new", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", str(key_pem), "-out", str(cert_pem), "-days", "365",
    "-subj", "/C=US/O=Shangchih Tsai/OU=2DACZBWJCS/CN=Apple Distribution: Shangchih Tsai (2DACZBWJCS)"
], check=True, capture_output=True)
subprocess.run([
    "openssl", "x509", "-in", str(cert_pem), "-outform", "DER", "-out", str(cert_der)
], check=True, capture_output=True)

info_obj = {
    "CFBundleIdentifier": bundle_id,
    "CFBundleDisplayName": "智行司機",
    "CFBundleName": "DRTSDriverApp",
    "CFBundleExecutable": "DRTSDriverApp",
    "CFBundleShortVersionString": "0.1.0",
    "CFBundleVersion": "1",
    "CFBundleSupportedPlatforms": ["iPhoneOS"],
    "DTPlatformName": "iphoneos",
    "MinimumOSVersion": "15.1",
    "UIBackgroundModes": ["location", "fetch"],
    "CFBundleURLTypes": [{"CFBundleURLSchemes": ["drts-driver", bundle_id]}],
}
raw_info = plistlib.dumps(info_obj)
raw_expo = plistlib.dumps({
    "EXUpdatesCheckOnLaunch": "ALWAYS",
    "EXUpdatesEnabled": False,
    "EXUpdatesLaunchWaitMs": 0,
})
raw_coderes = plistlib.dumps({"files": {}, "files2": {}})

profile_obj = {
    "Name": "DRTS Driver AdHoc Profile",
    "UUID": "e3bc7629-aeba-4ae3-b146-a1514bc9a85e",
    "TeamIdentifier": ["2DACZBWJCS"],
    "TeamName": "Shangchih Tsai",
    "CreationDate": "2026-11-21 12:32:36",
    "ExpirationDate": "2027-11-20 09:10:03",
    "Entitlements": {
        "aps-environment": "production",
        "application-identifier": f"2DACZBWJCS.{bundle_id}",
        "com.apple.developer.team-identifier": "2DACZBWJCS",
        "get-task-allow": False,
    },
    "Platform": ["iOS"],
    "ProvisionsAllDevices": False,
    "ProvisionedDevices": ["00008110-0011223344556677"],
    "DeveloperCertificates": [cert_der.read_bytes()],
}
profile_plist_path = base / "profile-in.plist"
prov_der_path = base / "embedded.mobileprovision"
profile_plist_path.write_bytes(plistlib.dumps(profile_obj))
subprocess.run([
    "openssl", "cms", "-sign", "-binary", "-nodetach",
    "-signer", str(cert_pem), "-inkey", str(key_pem),
    "-in", str(profile_plist_path), "-outform", "DER", "-out", str(prov_der_path)
], check=True, capture_output=True)

entitlements_obj = {
    "application-identifier": f"2DACZBWJCS.{bundle_id}",
    "com.apple.developer.team-identifier": "2DACZBWJCS",
    "get-task-allow": False,
}
ent_xml = plistlib.dumps(entitlements_obj)
ent_blob = struct.pack(">II", 0xFADE7171, 8 + len(ent_xml)) + ent_xml

# Build 64-bit Mach-O prefix before LC_CODE_SIGNATURE
code_limit = 4096
macho_header = bytearray(code_limit)
struct.pack_into("<IIIIIIII", macho_header, 0, 0xFEEDFACF, 0x0100000C, 0, 2, 1, 16, 0, 0)
# Single load command: LC_CODE_SIGNATURE (0x1d), size 16, dataoff=code_limit, datasize=0 (updated below)
ident_bytes = bundle_id.encode("utf-8") + b"\\x00"
hash_size = 32
n_special = 5
n_code = 1
cd_fixed_len = 44
ident_offset = cd_fixed_len
hash_offset = ident_offset + len(ident_bytes) + n_special * hash_size
cd_total_len = hash_offset + n_code * hash_size

# Compute preliminary code page hash after finalizing datasize
# First build CodeDirectory with placeholder code hash to get exact CMS size
def make_cd(code_page_bytes):
    cd = bytearray(cd_total_len)
    struct.pack_into(
        ">9I4B", cd, 0,
        0xFADE0C02, cd_total_len, 0x20400, 0,
        hash_offset, ident_offset, n_special, n_code, code_limit,
        hash_size, 2, 0, 12
    )
    cd[ident_offset : ident_offset + len(ident_bytes)] = ident_bytes
    for slot, payload in [(1, raw_info), (3, raw_coderes), (5, ent_blob)]:
        digest = hashlib.sha256(payload).digest()
        start = hash_offset - slot * hash_size
        cd[start : start + hash_size] = digest
    code_digest = hashlib.sha256(code_page_bytes).digest()
    cd[hash_offset : hash_offset + hash_size] = code_digest
    return bytes(cd)

# Stabilize sig_size in Mach-O header (openssl cms -sign is detached by default)
cms_der_bytes = b""
for _ in range(3):
    tentative_sb_len = 12 + 3 * 8 + cd_total_len + len(ent_blob) + (8 + len(cms_der_bytes))
    struct.pack_into("<IIII", macho_header, 32, 0x1D, 16, code_limit, tentative_sb_len)
    cd_bytes = make_cd(bytes(macho_header))
    cd_file = base / "cd-to-sign.bin"
    cms_file = base / "cd-sig.cms"
    cd_file.write_bytes(cd_bytes)
    subprocess.run([
        "openssl", "cms", "-sign", "-binary",
        "-signer", str(cert_pem), "-inkey", str(key_pem),
        "-in", str(cd_file), "-outform", "DER", "-out", str(cms_file)
    ], check=True, capture_output=True)
    cms_der_bytes = cms_file.read_bytes()

cms_blob = struct.pack(">II", 0xFADE0B01, 8 + len(cms_der_bytes)) + cms_der_bytes
sb_header_len = 12 + 3 * 8
off_cd = sb_header_len
off_ent = off_cd + len(cd_bytes)
off_cms = off_ent + len(ent_blob)
sb_total_len = off_cms + len(cms_blob)

superblob = (
    struct.pack(">III", 0xFADE0CC0, sb_total_len, 3)
    + struct.pack(">II", 0, off_cd)
    + struct.pack(">II", 5, off_ent)
    + struct.pack(">II", 0x10000, off_cms)
    + cd_bytes
    + ent_blob
    + cms_blob
)
macho_full = bytes(macho_header) + superblob

with zipfile.ZipFile(sys.argv[3], "w", zipfile.ZIP_DEFLATED) as z:
    prefix = "Payload/DRTSDriverApp.app/"
    z.writestr(prefix + "Info.plist", raw_info)
    z.writestr(prefix + "Expo.plist", raw_expo)
    z.writestr(prefix + "_CodeSignature/CodeResources", raw_coderes)
    z.write(prov_der_path, prefix + "embedded.mobileprovision")
    z.writestr(prefix + "DRTSDriverApp", macho_full)
`,
      tempDir,
      bundleId,
      signedIpaPath,
    ],
    { stdio: "ignore" },
  );
  return signedIpaPath;
}

describe("NATIVE-EXISTING-EAS-HOSTED-BUILD-LOOKUP-20261123", () => {
  let suiteTempDir = "";
  let sharedSignedApk = "";
  let sharedSignedIpa = "";

  beforeAll(() => {
    suiteTempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "driver-native-artifact-suite-"),
    );
    sharedSignedApk = createSignedAndroidApk(suiteTempDir);
    sharedSignedIpa = createSignedIosIpa(suiteTempDir);
  }, 30000);

  afterAll(() => {
    if (suiteTempDir && fs.existsSync(suiteTempDir)) {
      fs.rmSync(suiteTempDir, { recursive: true, force: true });
    }
  });

  it("preserves default build/submit behavior in build-driver-ios.yml while gating read-only lookup-existing mode", () => {
    const wfPath = path.join(
      REPO_ROOT,
      ".github",
      "workflows",
      "build-driver-ios.yml",
    );
    const wf = fs.readFileSync(wfPath, "utf8");

    expect(wf).toContain("mode:");
    expect(wf).toContain("default: build");
    expect(wf).toContain("- build");
    expect(wf).toContain("- lookup-existing");
    expect(wf).toContain("default: cb4b7f81-90bd-481e-970a-fbb1009582c0");
    expect(wf).toContain("default: 3f4d1b8b-9811-4d03-ab31-e7554de30bff");
    expect(wf).toContain("default: 0e722795dec202e960e504a8fa67526fc567ed0f");
    expect(wf).toContain(
      "run: node operations/verification/native-existing-builds/lookup.cjs guard",
    );
    expect(wf).toContain(
      "run: node operations/verification/native-existing-builds/lookup.cjs lookup",
    );
    expect(wf).toContain(
      "path: .artifacts/native-existing-builds/driver-existing-builds-receipt.json",
    );
    expect(wf).toContain(
      "if: ${{ (inputs.mode || 'build') == 'build' && inputs.submit == false }}",
    );
    expect(wf).toContain(
      "if: ${{ (inputs.mode || 'build') == 'build' && inputs.submit }}",
    );
  });

  it("validates controlled inputs in guardConfig and rejects unsafe or mismatched parameters", () => {
    const valid = lookup.guardConfig(baseEnv(), { repoRoot: REPO_ROOT });
    expect(valid.projectId).toBe(DRIVER_PROJECT_ID);
    expect(valid.androidBuildId).toBe(ANDROID_ID);
    expect(valid.iosBuildId).toBe(IOS_ID);
    expect(valid.expectedSourceSha).toBe(SIX_DIGIT_SHA);

    expect(() =>
      lookup.guardConfig(baseEnv({ WORKFLOW_MODE: "build" }), {
        repoRoot: REPO_ROOT,
      }),
    ).toThrow(/UNSUPPORTED_LOOKUP_MODE/);

    expect(() =>
      lookup.guardConfig(baseEnv({ SUBMIT_TO_TESTFLIGHT: "true" }), {
        repoRoot: REPO_ROOT,
      }),
    ).toThrow(/SUBMIT_FORBIDDEN_IN_LOOKUP_MODE/);

    expect(() =>
      lookup.guardConfig(baseEnv({ EXPO_TOKEN: "   " }), {
        repoRoot: REPO_ROOT,
      }),
    ).toThrow(/EXPO_TOKEN_MISSING/);

    expect(() =>
      lookup.guardConfig(
        baseEnv({
          DRIVER_APP_EAS_PROJECT_ID: "6d044e38-3c4a-4dce-890f-db368f13b37d",
        }),
        { repoRoot: REPO_ROOT },
      ),
    ).toThrow(/DRIVER_PROJECT_ID_MISMATCH/);

    expect(() =>
      lookup.guardConfig(
        baseEnv({ LOOKUP_ANDROID_BUILD_ID: "not-a-valid-uuid" }),
        { repoRoot: REPO_ROOT },
      ),
    ).toThrow(/INVALID_ANDROID_BUILD_ID/);

    expect(() =>
      lookup.guardConfig(
        baseEnv({
          LOOKUP_ANDROID_BUILD_ID: ANDROID_ID,
          LOOKUP_IOS_BUILD_ID: ANDROID_ID,
        }),
        { repoRoot: REPO_ROOT },
      ),
    ).toThrow(/DUPLICATE_BUILD_IDS/);

    // Swapping known iOS build ID into Android slot must fail closed
    expect(() =>
      lookup.guardConfig(
        baseEnv({
          LOOKUP_ANDROID_BUILD_ID: IOS_ID,
          LOOKUP_IOS_BUILD_ID: ANDROID_ID,
        }),
        { repoRoot: REPO_ROOT },
      ),
    ).toThrow(/BUILD_PLATFORM_MISMATCH/);
  });

  it("cryptographically verifies signed Android APK v2 and iOS Mach-O IPA archives and rejects tampered binaries", () => {
    const apkResult = JSON.parse(
      execFileSync("python3", [INSPECT_SCRIPT, "ANDROID", sharedSignedApk], {
        encoding: "utf8",
      }),
    );
    expect(apkResult.app_identifier).toBe("com.cctechsupport.drts.driver");
    expect(apkResult.app_version).toBe("0.1.0");
    expect(apkResult.app_build_version).toBe("1");
    expect(apkResult.signature_verified).toBe(true);
    expect(apkResult.manifest.deep_link_schemes).toContain("drts-driver");
    expect(apkResult.manifest.uses_permissions).toContain(
      "android.permission.ACCESS_BACKGROUND_LOCATION",
    );
    expect(apkResult.embedded_expo_config.packaged_api_base_url_host).toBe(
      "drts-dev-api-4t7rg6fmeq-uc.a.run.app",
    );
    expect(JSON.stringify(apkResult)).not.toMatch(/https?:\/\//i);

    // Tamper with 1 byte in the APK zip payload and confirm v2 digest rejection
    const tamperedApkPath = path.join(suiteTempDir, "tampered.apk");
    const tamperedBytes = Buffer.from(fs.readFileSync(sharedSignedApk));
    tamperedBytes.writeUInt8((tamperedBytes[12] ?? 0) ^ 0xff, 12);
    fs.writeFileSync(tamperedApkPath, tamperedBytes);
    expect(() =>
      execFileSync("python3", [INSPECT_SCRIPT, "ANDROID", tamperedApkPath], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow();

    // Verify signed iOS IPA
    const ipaResult = JSON.parse(
      execFileSync("python3", [INSPECT_SCRIPT, "IOS", sharedSignedIpa], {
        encoding: "utf8",
      }),
    );
    expect(ipaResult.app_identifier).toBe("com.cctechsupport.drts.driver");
    expect(ipaResult.app_version).toBe("0.1.0");
    expect(ipaResult.app_build_version).toBe("1");
    expect(ipaResult.signature_verified).toBe(true);
    expect(ipaResult.provisioning_profile.provisioned_device_count).toBe(1);
    expect(ipaResult.provisioning_profile.device_identifiers_recorded).toBe(
      false,
    );
    expect(JSON.stringify(ipaResult)).not.toContain(
      "00008110-0011223344556677",
    );
    expect(ipaResult.profile_consistency.verified_signer_matches_profile).toBe(
      true,
    );
    expect(ipaResult.code_directories[0].all_executable_pages_match).toBe(true);
  }, 30000);

  it("produces a non-confidential receipt with zero URLs when both 11/22 Driver builds finish and pass signature inspection", async () => {
    const receipt = await lookup.lookupExistingBuilds(baseEnv(), {
      repoRoot: REPO_ROOT,
      viewBuild: async (buildId: string) => {
        if (buildId === ANDROID_ID) {
          return {
            id: ANDROID_ID,
            status: "FINISHED",
            platform: "ANDROID",
            artifacts: {
              applicationArchiveUrl:
                "https://expo.dev/artifacts/eas/driver6digit.apk?X-Goog-Signature=secret_sig_123",
            },
            logFiles: [
              "https://storage.googleapis.com/eas-logs/log1?X-Goog-Signature=log_sig_1",
            ],
            project: {
              id: DRIVER_PROJECT_ID,
              name: "DRTS Driver App",
              slug: "drts-driver-app",
              ownerAccount: { name: "ajoe734" },
            },
            distribution: "INTERNAL",
            buildProfile: "preview",
            appIdentifier: "com.cctechsupport.drts.driver",
            sdkVersion: "54.0.0",
            appVersion: "0.1.0",
            appBuildVersion: "1",
            runtimeVersion: "0.1.0",
            gitCommitHash: SIX_DIGIT_SHA,
            gitCommitMessage:
              "feat(driver-app): 6-digit registration code + deep link auto-verification",
            createdAt: "2026-11-22T13:34:00.739Z",
            completedAt: "2026-11-22T13:49:10.000Z",
            isForIosSimulator: false,
          };
        }
        return {
          id: IOS_ID,
          status: "FINISHED",
          platform: "IOS",
          artifacts: {
            applicationArchiveUrl:
              "https://expo.dev/artifacts/eas/driver6digit.ipa?X-Goog-Signature=secret_sig_456",
          },
          logFiles: [
            "https://storage.googleapis.com/eas-logs/log2?X-Goog-Signature=log_sig_2",
          ],
          project: {
            id: DRIVER_PROJECT_ID,
            name: "DRTS Driver App",
            slug: "drts-driver-app",
            ownerAccount: { name: "ajoe734" },
          },
          distribution: "INTERNAL",
          buildProfile: "preview",
          appIdentifier: "com.cctechsupport.drts.driver",
          sdkVersion: "54.0.0",
          appVersion: "0.1.0",
          appBuildVersion: "1",
          runtimeVersion: "0.1.0",
          gitCommitHash: SIX_DIGIT_SHA,
          gitCommitMessage:
            "feat(driver-app): 6-digit registration code + deep link auto-verification",
          createdAt: "2026-11-22T13:34:11.223Z",
          completedAt: "2026-11-22T13:52:00.000Z",
          isForIosSimulator: false,
        };
      },
      downloadToFile: async (_rawUrl: string, destPath: string) => {
        const src = destPath.endsWith(".apk")
          ? sharedSignedApk
          : sharedSignedIpa;
        const bytes = fs.readFileSync(src);
        fs.writeFileSync(destPath, bytes);
        return {
          httpStatus: 200,
          sizeBytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          signedRedirectUrlRecorded: false,
        };
      },
    });

    expect(receipt.status).toBe("verified_finished_and_signed");
    expect(receipt.awaitingOperatorAction).toBe(false);
    expect(
      receipt.downstreamCardBindings["NATIVE-SIGNED-BUILD-READBACK-20261123"]
        .signedArtifactsVerified,
    ).toBe(true);
    expect(
      receipt.downstreamCardBindings["SR-LIVE-DRIVER-001"]
        .nativeBuildCandidateVerified,
    ).toBe(true);
    expect(
      receipt.downstreamCardBindings["SR-LIVE-DRIVER-001"]
        .physicalDeviceLifecycleGatesIncluded,
    ).toBe(false);

    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain(SENTINEL_TOKEN);
    expect(serialized).not.toMatch(/https?:\/\//i);
    expect(serialized).not.toContain("secret_sig_123");
    expect(serialized).not.toContain("secret_sig_456");
    expect(serialized).not.toContain("log_sig_1");
  }, 30000);

  it("records terminal ERRORED build diagnostics with redacted URLs without downloading artifacts", async () => {
    const receipt = await lookup.lookupExistingBuilds(baseEnv(), {
      repoRoot: REPO_ROOT,
      viewBuild: async (buildId: string) => ({
        id: buildId,
        status: "ERRORED",
        platform: buildId === ANDROID_ID ? "ANDROID" : "IOS",
        error: {
          errorCode: "UNKNOWN_FASTLANE_ERROR",
          message:
            "Build failed; see https://storage.googleapis.com/logs/secret?X-Goog-Signature=abcdef",
        },
        artifacts: {},
        logFiles: [
          "https://storage.googleapis.com/logs/secret?X-Goog-Signature=abcdef",
        ],
        project: {
          id: DRIVER_PROJECT_ID,
          name: "DRTS Driver App",
          slug: "drts-driver-app",
          ownerAccount: { name: "ajoe734" },
        },
        distribution: "INTERNAL",
        buildProfile: "preview",
        appVersion: "0.1.0",
        appBuildVersion: "1",
        gitCommitHash: SIX_DIGIT_SHA,
      }),
    });

    expect(receipt.status).toBe("verified_terminal_with_build_error");
    expect(
      receipt.builds[0].metadataComparison.terminalState.error.errorCode,
    ).toBe("UNKNOWN_FASTLANE_ERROR");
    expect(
      receipt.builds[0].metadataComparison.terminalState.error.message,
    ).toContain("[REDACTED_URL]");
    expect(JSON.stringify(receipt)).not.toMatch(/https?:\/\//i);
  });

  it("stops immediately on EAS authorization denial without retrying or switching identity", async () => {
    const viewCalls: string[] = [];
    const receipt = await lookup.lookupExistingBuilds(baseEnv(), {
      repoRoot: REPO_ROOT,
      viewBuild: async (buildId: string) => {
        viewCalls.push(buildId);
        const err = new Error("GraphQL request failed") as Error & {
          stderr?: string;
          status?: number;
        };
        err.stderr = `Entity Not Authorized: TurtleBuildEntity[${buildId}] (action = READ) token=${SENTINEL_TOKEN}`;
        err.status = 1;
        throw err;
      },
    });

    expect(viewCalls).toEqual([ANDROID_ID]);
    expect(receipt.status).toBe("blocked_unauthorized_awaiting_operator");
    expect(receipt.awaitingOperatorAction).toBe(true);
    expect(receipt.guardrails.retryOnUnauthorizedPerformed).toBe(false);
    expect(receipt.guardrails.alternateIdentityUsed).toBe(false);
    expect(receipt.builds[0].readbackStatus).toBe("blocked_cli_view_failed");
    expect(receipt.builds[0].cliFailure.classification).toBe(
      "UNAUTHORIZED_PROJECT_OR_BUILD_READ",
    );
    expect(receipt.builds[1].readbackStatus).toBe(
      "skipped_after_authorization_denial",
    );
    expect(JSON.stringify(receipt)).not.toContain(SENTINEL_TOKEN);
  });
});
