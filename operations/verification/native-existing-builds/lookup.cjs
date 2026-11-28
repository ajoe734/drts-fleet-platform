/* eslint-disable @typescript-eslint/no-require-imports -- standalone hosted existing EAS build lookup and signed artifact verifier */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA_REGEX = /^[0-9a-f]{40}$/;

const EXPECTED_DRIVER_PROJECT = Object.freeze({
  projectId: "7f8583f8-a32d-49b8-973d-ddd34ac9b71c",
  slug: "drts-driver-app",
  name: "DRTS Driver App",
  ownerAccount: "ajoe734",
  appIdentifier: "com.cctechsupport.drts.driver",
  appVersion: "0.1.0",
  androidVersionCode: "1",
  iosBuildNumber: "1",
  scheme: "drts-driver",
});

const KNOWN_DRIVER_BUILDS = Object.freeze({
  "cb4b7f81-90bd-481e-970a-fbb1009582c0": Object.freeze({
    id: "cb4b7f81-90bd-481e-970a-fbb1009582c0",
    platform: "ANDROID",
    cohort: "2026-11-22-six-digit-driver",
    expectedSourceSha: "0e722795dec202e960e504a8fa67526fc567ed0f",
    expectedProfile: "preview",
    expectedDistribution: "INTERNAL",
    expectedAppVersion: "0.1.0",
    expectedAppBuildVersion: "1",
    createdAt: "2026-11-22T13:34:00.739Z",
  }),
  "3f4d1b8b-9811-4d03-ab31-e7554de30bff": Object.freeze({
    id: "3f4d1b8b-9811-4d03-ab31-e7554de30bff",
    platform: "IOS",
    cohort: "2026-11-22-six-digit-driver",
    expectedSourceSha: "0e722795dec202e960e504a8fa67526fc567ed0f",
    expectedProfile: "preview",
    expectedDistribution: "INTERNAL",
    expectedAppVersion: "0.1.0",
    expectedAppBuildVersion: "1",
    createdAt: "2026-11-22T13:34:11.223Z",
  }),
  "6d984721-7008-41fe-9ecc-6bc6a415697f": Object.freeze({
    id: "6d984721-7008-41fe-9ecc-6bc6a415697f",
    platform: "ANDROID",
    cohort: "2026-11-22-branded-driver",
    expectedSourceSha: "c0821992b9885e5f6c0ff5970a46cd33ff987b38",
    expectedProfile: "preview",
    expectedDistribution: "INTERNAL",
    expectedAppVersion: "0.1.0",
    expectedAppBuildVersion: "1",
    createdAt: "2026-11-22T12:23:22.733Z",
  }),
  "7ca43480-cd93-4460-8255-8f3340249e2c": Object.freeze({
    id: "7ca43480-cd93-4460-8255-8f3340249e2c",
    platform: "IOS",
    cohort: "2026-11-22-branded-driver",
    expectedSourceSha: "c0821992b9885e5f6c0ff5970a46cd33ff987b38",
    expectedProfile: "preview",
    expectedDistribution: "INTERNAL",
    expectedAppVersion: "0.1.0",
    expectedAppBuildVersion: "1",
    createdAt: "2026-11-22T12:24:07.365Z",
  }),
});

const LIMITS = Object.freeze({
  cliVersion: "21.4.0",
  cliTimeoutMs: 90000,
  downloadTimeoutMs: 120000,
  maxDownloadBytes: 262144000, // 250 MiB
  inspectTimeoutMs: 90000,
});

const ALLOWED_ARTIFACT_HOSTS = Object.freeze(["expo.dev", "artifacts.eas.ks"]);

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(code, detail = "") {
  const err = new Error(detail ? `${code}: ${detail}` : code);
  err.code = code;
  throw err;
}

function sanitizeText(value, maxLen = 240) {
  if (typeof value !== "string" || !value) return null;
  const withoutUrls = value.replace(
    /https?:\/\/[^\s"'<>]+/gi,
    "[REDACTED_URL]",
  );
  const withoutTokens = withoutUrls.replace(
    /\b(?:Bearer|Token|X-Goog-Signature|X-Goog-Credential|Signature|AWSAccessKeyId)[=:\s]+[^\s&"']+/gi,
    "[REDACTED_CREDENTIAL]",
  );
  const singleLine = withoutTokens.replace(/[\r\n\t]+/g, " ").trim();
  return singleLine.slice(0, maxLen);
}

function defaultGitRunner(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function guardConfig(env, options = {}) {
  const repoRoot =
    options.repoRoot || path.resolve(__dirname, "..", "..", "..");
  const git = options.git || ((args) => defaultGitRunner(args, repoRoot));

  const mode = (env.WORKFLOW_MODE || "lookup-existing").trim();
  if (mode !== "lookup-existing") {
    fail("UNSUPPORTED_LOOKUP_MODE", "WORKFLOW_MODE must be lookup-existing");
  }
  if (String(env.SUBMIT_TO_TESTFLIGHT || "false").toLowerCase() === "true") {
    fail(
      "SUBMIT_FORBIDDEN_IN_LOOKUP_MODE",
      "Store submission is prohibited in lookup-existing mode",
    );
  }
  if (typeof env.EXPO_TOKEN !== "string" || !env.EXPO_TOKEN.trim()) {
    fail("EXPO_TOKEN_MISSING", "EXPO_TOKEN is required in environment");
  }

  const projectId = (env.DRIVER_APP_EAS_PROJECT_ID || "").trim();
  if (!UUID_REGEX.test(projectId)) {
    fail(
      "INVALID_EAS_PROJECT_ID",
      "DRIVER_APP_EAS_PROJECT_ID must be a lowercase UUID",
    );
  }
  const expectedProjectId =
    options.expectedProjectId || EXPECTED_DRIVER_PROJECT.projectId;
  if (projectId !== expectedProjectId) {
    fail(
      "DRIVER_PROJECT_ID_MISMATCH",
      "DRIVER_APP_EAS_PROJECT_ID does not match Driver project ID",
    );
  }

  const androidBuildId = (
    env.LOOKUP_ANDROID_BUILD_ID || "cb4b7f81-90bd-481e-970a-fbb1009582c0"
  ).trim();
  const iosBuildId = (
    env.LOOKUP_IOS_BUILD_ID || "3f4d1b8b-9811-4d03-ab31-e7554de30bff"
  ).trim();
  if (!UUID_REGEX.test(androidBuildId)) {
    fail(
      "INVALID_ANDROID_BUILD_ID",
      "LOOKUP_ANDROID_BUILD_ID must be a lowercase UUID",
    );
  }
  if (!UUID_REGEX.test(iosBuildId)) {
    fail(
      "INVALID_IOS_BUILD_ID",
      "LOOKUP_IOS_BUILD_ID must be a lowercase UUID",
    );
  }
  if (androidBuildId === iosBuildId) {
    fail(
      "DUPLICATE_BUILD_IDS",
      "Android and iOS build IDs must be distinct UUIDs",
    );
  }

  const knownAndroid = KNOWN_DRIVER_BUILDS[androidBuildId];
  if (knownAndroid && knownAndroid.platform !== "ANDROID") {
    fail(
      "BUILD_PLATFORM_MISMATCH",
      "Known non-Android build ID supplied as LOOKUP_ANDROID_BUILD_ID",
    );
  }
  const knownIos = KNOWN_DRIVER_BUILDS[iosBuildId];
  if (knownIos && knownIos.platform !== "IOS") {
    fail(
      "BUILD_PLATFORM_MISMATCH",
      "Known non-iOS build ID supplied as LOOKUP_IOS_BUILD_ID",
    );
  }

  const expectedSourceSha = (
    env.LOOKUP_EXPECTED_SOURCE_SHA ||
    knownAndroid?.expectedSourceSha ||
    "0e722795dec202e960e504a8fa67526fc567ed0f"
  ).trim();
  if (!SHA_REGEX.test(expectedSourceSha)) {
    fail(
      "INVALID_EXPECTED_SOURCE_SHA",
      "LOOKUP_EXPECTED_SOURCE_SHA must be a 40-char lowercase hex SHA",
    );
  }

  const driverAppJsonPath = path.join(
    repoRoot,
    "apps",
    "driver-app",
    "app.json",
  );
  const driverEasJsonPath = path.join(
    repoRoot,
    "apps",
    "driver-app",
    "eas.json",
  );
  if (!fs.existsSync(driverAppJsonPath) || !fs.existsSync(driverEasJsonPath)) {
    fail(
      "DRIVER_APP_CONFIG_MISSING",
      "apps/driver-app/app.json or eas.json missing",
    );
  }
  const appJson = JSON.parse(fs.readFileSync(driverAppJsonPath, "utf8"));
  const expo = appJson?.expo || {};
  if (
    expo.slug !== EXPECTED_DRIVER_PROJECT.slug ||
    expo.ios?.bundleIdentifier !== EXPECTED_DRIVER_PROJECT.appIdentifier ||
    expo.android?.package !== EXPECTED_DRIVER_PROJECT.appIdentifier
  ) {
    fail(
      "DRIVER_APP_IDENTITY_MISMATCH",
      "apps/driver-app/app.json slug or package identifier mismatch",
    );
  }

  let headSha = (env.GITHUB_SHA || "").trim();
  try {
    const gitHead = git(["rev-parse", "HEAD"]);
    if (SHA_REGEX.test(gitHead)) {
      headSha = gitHead;
    }
  } catch {
    // Keep env.GITHUB_SHA if git rev-parse is unavailable in synthetic test env
  }
  if (!SHA_REGEX.test(headSha)) {
    fail(
      "HEAD_SHA_UNRESOLVED",
      "Unable to resolve 40-char checked-out HEAD SHA",
    );
  }

  return Object.freeze({
    mode,
    projectId,
    expectedProjectId,
    androidBuildId,
    iosBuildId,
    expectedSourceSha,
    headSha,
    checkedOutAppVersion: String(expo.version || ""),
    checkedOutAndroidVersionCode: String(expo.android?.versionCode ?? ""),
    checkedOutIosBuildNumber: String(expo.ios?.buildNumber ?? ""),
    checkedOutSlug: String(expo.slug || ""),
    checkedOutAppIdentifier: EXPECTED_DRIVER_PROJECT.appIdentifier,
    runIdentity: Object.freeze({
      repository: env.GITHUB_REPOSITORY || "ajoe734/drts-fleet-platform",
      ref: env.GITHUB_REF || "local",
      workflow: env.GITHUB_WORKFLOW || "Build Driver App (iOS, EAS)",
      runId: env.GITHUB_RUN_ID ? String(env.GITHUB_RUN_ID) : null,
      runAttempt: env.GITHUB_RUN_ATTEMPT
        ? String(env.GITHUB_RUN_ATTEMPT)
        : null,
      eventName: env.GITHUB_EVENT_NAME || "local_check",
    }),
  });
}

function prepareEphemeralEasProject(tempDir, config, repoRoot) {
  const projectDir = path.join(tempDir, "driver-eas-project");
  fs.mkdirSync(projectDir, { recursive: true });

  const rawAppJson = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "apps", "driver-app", "app.json"),
      "utf8",
    ),
  );
  const rawEasJson = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "apps", "driver-app", "eas.json"),
      "utf8",
    ),
  );

  // Strip plugins in the read-only lookup temp dir so @expo/config resolves
  // static project linkage without requiring workspace node_modules in /tmp.
  const expoCopy = { ...(rawAppJson.expo || {}) };
  delete expoCopy.plugins;
  const ephemeralAppJson = {
    expo: {
      ...expoCopy,
      owner: EXPECTED_DRIVER_PROJECT.ownerAccount,
      extra: {
        ...(expoCopy.extra || {}),
        eas: {
          ...((expoCopy.extra && expoCopy.extra.eas) || {}),
          projectId: config.projectId,
        },
      },
    },
  };
  delete ephemeralAppJson.expo.extra.apiBaseUrl;

  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: "drts-driver-app-eas-readonly-lookup",
        version: config.checkedOutAppVersion || "0.1.0",
        private: true,
      },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    path.join(projectDir, "app.json"),
    JSON.stringify(ephemeralAppJson, null, 2),
  );
  fs.writeFileSync(
    path.join(projectDir, "eas.json"),
    JSON.stringify(
      { cli: rawEasJson.cli || { version: ">= 16.19.0" } },
      null,
      2,
    ),
  );
  return projectDir;
}

function redactAndClassifyCliError(stderr, exitCode = 1, stdout = "") {
  const stderrText =
    typeof stderr === "string"
      ? stderr
      : Buffer.isBuffer(stderr)
        ? stderr.toString("utf8")
        : String(stderr || "");
  const stdoutText =
    typeof stdout === "string"
      ? stdout
      : Buffer.isBuffer(stdout)
        ? stdout.toString("utf8")
        : String(stdout || "");
  const stderrSha256 = sha256Hex(stderrText);
  const combinedText = stdoutText ? `${stderrText}\n${stdoutText}` : stderrText;
  const markers = [];
  if (
    /Entity Not Authorized|UNAUTHORIZED_ERROR|not authorized/i.test(
      combinedText,
    )
  ) {
    markers.push("ENTITY_NOT_AUTHORIZED");
  }
  if (/GraphQL request failed/i.test(combinedText)) {
    markers.push("GRAPHQL_REQUEST_FAILED");
  }
  if (
    /Invalid token|Authentication|not logged in|401|403/i.test(combinedText) ||
    /Either log in with .*eas login.* or set the .*EXPO_TOKEN.* environment variable/i.test(
      combinedText,
    )
  ) {
    markers.push("AUTHENTICATION_ERROR");
  }
  if (
    /Couldn't find any builds|Build not found|NOT_FOUND/i.test(combinedText)
  ) {
    markers.push("BUILD_NOT_FOUND");
  }

  let classification = "EAS_CLI_VIEW_FAILED";
  let isAuthorizationDenial = false;
  if (markers.includes("ENTITY_NOT_AUTHORIZED")) {
    classification = "UNAUTHORIZED_PROJECT_OR_BUILD_READ";
    isAuthorizationDenial = true;
  } else if (markers.includes("AUTHENTICATION_ERROR")) {
    classification = "AUTHENTICATION_REJECTED";
    isAuthorizationDenial = true;
  } else if (markers.includes("BUILD_NOT_FOUND")) {
    classification = "BUILD_NOT_FOUND";
  } else if (markers.includes("GRAPHQL_REQUEST_FAILED")) {
    classification = "GRAPHQL_REQUEST_FAILED";
    isAuthorizationDenial = true;
  }

  return Object.freeze({
    exitCode: Number.isInteger(exitCode) ? exitCode : 1,
    stderrSha256,
    classification,
    isAuthorizationDenial,
    matchedMarkers: markers,
  });
}

function sanitizeArtifactUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) {
    return Object.freeze({
      present: false,
      host: null,
      extension: null,
      canonicalUrlSha256: null,
      hadQueryParameters: false,
      signedUrlRecorded: false,
      rawUrlRecorded: false,
    });
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    fail("INVALID_ARTIFACT_URL", "EAS returned a malformed artifact URL");
  }
  if (parsed.protocol !== "https:") {
    fail("INSECURE_ARTIFACT_URL", "Artifact URL must use https:");
  }
  const host = parsed.hostname.toLowerCase();
  const isAllowedHost =
    ALLOWED_ARTIFACT_HOSTS.includes(host) || host.endsWith(".expo.dev");
  if (!isAllowedHost) {
    fail("UNTRUSTED_ARTIFACT_HOST", `Unexpected artifact host: ${host}`);
  }
  const pathname = parsed.pathname || "";
  let extension = null;
  for (const ext of [".apk", ".ipa", ".aab", ".tar.gz"]) {
    if (pathname.toLowerCase().endsWith(ext)) {
      extension = ext;
      break;
    }
  }
  const canonicalNoQuery = `${parsed.origin}${parsed.pathname}`;
  return Object.freeze({
    present: true,
    host,
    extension,
    canonicalUrlSha256: sha256Hex(canonicalNoQuery),
    hadQueryParameters: parsed.search.length > 0,
    signedUrlRecorded: false,
    rawUrlRecorded: false,
  });
}

function resolveGitSourceRelation(commitHash, headSha, git) {
  if (typeof commitHash !== "string" || !SHA_REGEX.test(commitHash)) {
    return Object.freeze({
      commitHashValid: false,
      resolvableInCurrentCheckout: false,
      isAncestorOfCurrentCheckout: false,
      matchesCurrentCheckoutHead: false,
    });
  }
  const matchesCurrentCheckoutHead = commitHash === headSha;
  let resolvableInCurrentCheckout = false;
  let isAncestorOfCurrentCheckout = false;
  try {
    const objType = git(["cat-file", "-t", `${commitHash}^{commit}`]);
    resolvableInCurrentCheckout = objType === "commit";
  } catch {
    resolvableInCurrentCheckout = false;
  }
  if (resolvableInCurrentCheckout) {
    try {
      git(["merge-base", "--is-ancestor", commitHash, headSha]);
      isAncestorOfCurrentCheckout = true;
    } catch {
      isAncestorOfCurrentCheckout = false;
    }
  }
  return Object.freeze({
    commitHashValid: true,
    resolvableInCurrentCheckout,
    isAncestorOfCurrentCheckout,
    matchesCurrentCheckoutHead,
  });
}

function compareBuildViewMetadata(
  rawBuild,
  expectedPlatform,
  requestedBuildId,
  config,
  gitRelation,
) {
  if (!rawBuild || typeof rawBuild !== "object" || Array.isArray(rawBuild)) {
    fail("MALFORMED_EAS_BUILD_JSON", "build:view output must be a JSON object");
  }
  if (rawBuild.id !== requestedBuildId) {
    fail(
      "BUILD_ID_MISMATCH",
      `Returned build ID ${rawBuild.id} !== requested ${requestedBuildId}`,
    );
  }
  if (rawBuild.platform !== expectedPlatform) {
    fail(
      "BUILD_PLATFORM_MISMATCH",
      `Returned build platform ${rawBuild.platform} !== expected ${expectedPlatform}`,
    );
  }

  const projectObj = rawBuild.project || rawBuild.app || {};
  const projectId = projectObj.id || null;
  const projectSlug = projectObj.slug || null;
  const projectName = projectObj.name || null;
  const ownerAccount = projectObj.ownerAccount?.name || null;

  if (projectId && projectId !== config.projectId) {
    fail(
      "BUILD_PROJECT_ID_MISMATCH",
      "Returned build belongs to a different EAS project ID",
    );
  }
  if (projectSlug && projectSlug !== EXPECTED_DRIVER_PROJECT.slug) {
    fail(
      "BUILD_PROJECT_SLUG_MISMATCH",
      "Returned build slug does not match drts-driver-app",
    );
  }
  if (ownerAccount && ownerAccount !== EXPECTED_DRIVER_PROJECT.ownerAccount) {
    fail(
      "BUILD_OWNER_ACCOUNT_MISMATCH",
      "Returned build ownerAccount does not match ajoe734",
    );
  }

  const knownSnapshot = KNOWN_DRIVER_BUILDS[requestedBuildId] || null;
  const expectedBuildVersion =
    expectedPlatform === "ANDROID"
      ? config.checkedOutAndroidVersionCode
      : config.checkedOutIosBuildNumber;

  const status = typeof rawBuild.status === "string" ? rawBuild.status : null;
  const isTerminal = ["FINISHED", "ERRORED", "CANCELED"].includes(status);

  let errorRecord = null;
  if (rawBuild.error && typeof rawBuild.error === "object") {
    errorRecord = {
      errorCode:
        typeof rawBuild.error.errorCode === "string"
          ? rawBuild.error.errorCode
          : null,
      message: sanitizeText(rawBuild.error.message, 400),
    };
  }

  const rawArchiveUrl =
    rawBuild.artifacts?.applicationArchiveUrl ||
    rawBuild.artifacts?.buildUrl ||
    null;
  const artifactDescriptor = sanitizeArtifactUrl(rawArchiveUrl);

  return Object.freeze({
    id: requestedBuildId,
    platform: expectedPlatform,
    knownCohort: knownSnapshot ? knownSnapshot.cohort : "custom-driver-build",
    project: Object.freeze({
      id: projectId,
      slug: projectSlug,
      name: projectName,
      ownerAccount,
      matchesConfiguredProjectId: projectId === config.projectId,
      matchesExpectedSlug: projectSlug === EXPECTED_DRIVER_PROJECT.slug,
      matchesExpectedOwner:
        ownerAccount === EXPECTED_DRIVER_PROJECT.ownerAccount,
    }),
    appIdentity: Object.freeze({
      expectedAppIdentifier: EXPECTED_DRIVER_PROJECT.appIdentifier,
      reportedAppIdentifier:
        typeof rawBuild.appIdentifier === "string"
          ? rawBuild.appIdentifier
          : null,
      matchesExpectedIfPresent:
        !rawBuild.appIdentifier ||
        rawBuild.appIdentifier === EXPECTED_DRIVER_PROJECT.appIdentifier,
    }),
    profileAndDistribution: Object.freeze({
      buildProfile:
        typeof rawBuild.buildProfile === "string"
          ? rawBuild.buildProfile
          : null,
      distribution:
        typeof rawBuild.distribution === "string"
          ? rawBuild.distribution
          : null,
      channel: typeof rawBuild.channel === "string" ? rawBuild.channel : null,
      isForIosSimulator: Boolean(rawBuild.isForIosSimulator),
      matchesKnownCreationProfile: knownSnapshot
        ? rawBuild.buildProfile === knownSnapshot.expectedProfile
        : null,
    }),
    version: Object.freeze({
      appVersion:
        typeof rawBuild.appVersion === "string" ? rawBuild.appVersion : null,
      appBuildVersion:
        rawBuild.appBuildVersion !== undefined &&
        rawBuild.appBuildVersion !== null
          ? String(rawBuild.appBuildVersion)
          : null,
      sdkVersion:
        typeof rawBuild.sdkVersion === "string" ? rawBuild.sdkVersion : null,
      runtimeVersion:
        typeof rawBuild.runtimeVersion === "string"
          ? rawBuild.runtimeVersion
          : typeof rawBuild.runtime?.version === "string"
            ? rawBuild.runtime.version
            : null,
      matchesCheckedOutAppVersion:
        rawBuild.appVersion === config.checkedOutAppVersion,
      matchesCheckedOutBuildVersion:
        String(rawBuild.appBuildVersion ?? "") === String(expectedBuildVersion),
    }),
    sourceRevision: Object.freeze({
      gitCommitHash:
        typeof rawBuild.gitCommitHash === "string"
          ? rawBuild.gitCommitHash
          : null,
      gitCommitMessage: sanitizeText(rawBuild.gitCommitMessage, 200),
      expectedSourceSha: config.expectedSourceSha,
      matchesExpectedSourceSha:
        rawBuild.gitCommitHash === config.expectedSourceSha,
      matchesKnownCreationSourceSha: knownSnapshot
        ? rawBuild.gitCommitHash === knownSnapshot.expectedSourceSha
        : null,
      checkedOutHeadSha: config.headSha,
      ...gitRelation,
    }),
    terminalState: Object.freeze({
      status,
      isTerminal,
      isFinished: status === "FINISHED",
      isErrored: status === "ERRORED",
      createdAt:
        typeof rawBuild.createdAt === "string" ? rawBuild.createdAt : null,
      updatedAt:
        typeof rawBuild.updatedAt === "string" ? rawBuild.updatedAt : null,
      completedAt:
        typeof rawBuild.completedAt === "string" ? rawBuild.completedAt : null,
      expirationDate:
        typeof rawBuild.expirationDate === "string"
          ? rawBuild.expirationDate
          : null,
      error: errorRecord,
      logFilesCount: Array.isArray(rawBuild.logFiles)
        ? rawBuild.logFiles.length
        : 0,
      logFileUrlsRecorded: false,
    }),
    artifactDescriptor,
  });
}

async function defaultDownloadToFile(rawUrl, destPath, maxBytes, timeoutMs) {
  const response = await fetch(rawUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok || !response.body) {
    fail("ARTIFACT_DOWNLOAD_HTTP_ERROR", `HTTP status ${response.status}`);
  }
  const hash = createHash("sha256");
  let sizeBytes = 0;
  const fd = fs.openSync(destPath, "w", 0o600);
  try {
    for await (const chunk of response.body) {
      const buf = Buffer.from(chunk);
      sizeBytes += buf.length;
      if (sizeBytes > maxBytes) {
        fail("ARTIFACT_DOWNLOAD_SIZE_EXCEEDED", `Exceeded ${maxBytes} bytes`);
      }
      hash.update(buf);
      fs.writeSync(fd, buf);
    }
  } finally {
    fs.closeSync(fd);
  }
  return {
    httpStatus: response.status,
    sizeBytes,
    sha256: hash.digest("hex"),
    signedRedirectUrlRecorded: false,
  };
}

function defaultPythonInspector(platform, archivePath) {
  const scriptPath = path.join(__dirname, "inspect-artifacts.py");
  const stdout = execFileSync("python3", [scriptPath, platform, archivePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: LIMITS.inspectTimeoutMs,
  });
  return JSON.parse(stdout);
}

async function downloadAndInspectArtifact(
  rawUrl,
  expectedPlatform,
  tempDir,
  options = {},
) {
  const descriptor = sanitizeArtifactUrl(rawUrl);
  if (!descriptor.present) {
    fail("ARTIFACT_URL_MISSING", "FINISHED build has no artifact archive URL");
  }
  const ext = expectedPlatform === "ANDROID" ? ".apk" : ".ipa";
  const tempFilePath = path.join(
    tempDir,
    `driver-${expectedPlatform.toLowerCase()}-artifact${ext}`,
  );
  const downloadFn = options.downloadToFile || defaultDownloadToFile;
  const inspectFn = options.inspectArchive || defaultPythonInspector;

  try {
    const downloadReceipt = await downloadFn(
      rawUrl,
      tempFilePath,
      LIMITS.maxDownloadBytes,
      LIMITS.downloadTimeoutMs,
    );
    const inspection = await inspectFn(expectedPlatform, tempFilePath);

    if (inspection.app_identifier !== EXPECTED_DRIVER_PROJECT.appIdentifier) {
      fail(
        "PACKAGED_APP_IDENTIFIER_MISMATCH",
        `Packaged identifier ${inspection.app_identifier} !== ${EXPECTED_DRIVER_PROJECT.appIdentifier}`,
      );
    }
    if (inspection.signature_verified !== true) {
      fail(
        "ARTIFACT_SIGNATURE_INVALID",
        `Cryptographic signature check failed for ${expectedPlatform}`,
      );
    }

    return Object.freeze({
      status: "verified",
      httpStatus: downloadReceipt.httpStatus,
      sizeBytes: downloadReceipt.sizeBytes,
      sha256: downloadReceipt.sha256,
      signedRedirectUrlRecorded: false,
      rawUrlRecorded: false,
      packagedIdentity: Object.freeze({
        appIdentifier: inspection.app_identifier,
        appVersion: inspection.app_version,
        appBuildVersion: inspection.app_build_version,
        matchesExpectedDriverIdentifier:
          inspection.app_identifier === EXPECTED_DRIVER_PROJECT.appIdentifier,
      }),
      inspection,
    });
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.rmSync(tempFilePath, { force: true });
    }
  }
}

function parseEasBuildViewJsonStdout(stdout) {
  const raw =
    typeof stdout === "string"
      ? stdout
      : Buffer.isBuffer(stdout)
        ? stdout.toString("utf8")
        : String(stdout || "");
  const trimmed = raw.trim();
  if (!trimmed) {
    fail("EMPTY_EAS_BUILD_JSON", "eas build:view returned empty stdout");
  }
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const lineStartIdx = trimmed.search(/^\s*\{/m);
  if (lineStartIdx >= 0) {
    const match = /^\s*\{/m.exec(trimmed.slice(lineStartIdx));
    const braceOffset = match ? match[0].indexOf("{") : 0;
    return JSON.parse(trimmed.slice(lineStartIdx + braceOffset));
  }
  const firstBraceIdx = trimmed.indexOf("{");
  if (firstBraceIdx >= 0) {
    return JSON.parse(trimmed.slice(firstBraceIdx));
  }
  return JSON.parse(trimmed);
}

function defaultEasBuildViewRunner(buildId, projectDir, env, options = {}) {
  const execFn = options.execFileSync || execFileSync;
  const stdout = execFn(
    "npx",
    ["--yes", `eas-cli@${LIMITS.cliVersion}`, "build:view", buildId, "--json"],
    {
      cwd: projectDir,
      env: {
        ...env,
        EAS_NO_VCS: "1",
        EAS_PROJECT_ROOT: projectDir,
        CI: "1",
        EXPO_NO_TELEMETRY: "1",
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: LIMITS.cliTimeoutMs,
    },
  );
  return parseEasBuildViewJsonStdout(stdout);
}

function assertRedactedReceipt(receipt, env = {}) {
  const serialized = JSON.stringify(receipt);
  const token = typeof env.EXPO_TOKEN === "string" ? env.EXPO_TOKEN.trim() : "";
  if (token && serialized.includes(token)) {
    fail("SECRET_LEAK_DETECTED", "Receipt contained EXPO_TOKEN value");
  }
  if (/https?:\/\//i.test(serialized)) {
    fail(
      "RAW_OR_SIGNED_URL_DETECTED",
      "Receipt must not contain any http:// or https:// URLs",
    );
  }
  if (
    /X-Goog-Signature|X-Goog-Credential|AWSAccessKeyId|BEGIN (?:RSA |EC )?PRIVATE KEY/i.test(
      serialized,
    )
  ) {
    fail(
      "CREDENTIAL_MARKER_DETECTED",
      "Receipt contained a signed URL parameter or private key marker",
    );
  }
  return true;
}

async function lookupExistingBuilds(env, options = {}) {
  const repoRoot =
    options.repoRoot || path.resolve(__dirname, "..", "..", "..");
  const config = guardConfig(env, { ...options, repoRoot });
  const git = options.git || ((args) => defaultGitRunner(args, repoRoot));
  const viewBuild = options.viewBuild || defaultEasBuildViewRunner;

  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "driver-eas-existing-lookup-"),
  );
  const builds = [];
  let authDenied = false;

  try {
    const projectDir = prepareEphemeralEasProject(tempDir, config, repoRoot);
    const targets = [
      { platform: "ANDROID", buildId: config.androidBuildId },
      { platform: "IOS", buildId: config.iosBuildId },
    ];

    for (const target of targets) {
      if (authDenied) {
        builds.push({
          id: target.buildId,
          platform: target.platform,
          readbackStatus: "skipped_after_authorization_denial",
          retryPerformed: false,
          alternateIdentityUsed: false,
          cliFailure: null,
          metadataComparison: null,
          artifactReadback: {
            status: "not_available",
            reason:
              "Skipped after initial EAS authorization denial to avoid blind retries.",
          },
        });
        continue;
      }

      let rawBuild;
      try {
        rawBuild = await viewBuild(target.buildId, projectDir, env);
      } catch (err) {
        const stderr =
          typeof err?.stderr === "string"
            ? err.stderr
            : Buffer.isBuffer(err?.stderr)
              ? err.stderr.toString("utf8")
              : err?.message || "";
        const stdout =
          typeof err?.stdout === "string"
            ? err.stdout
            : Buffer.isBuffer(err?.stdout)
              ? err.stdout.toString("utf8")
              : "";
        const exitCode = Number.isInteger(err?.status) ? err.status : 1;
        const classified = redactAndClassifyCliError(stderr, exitCode, stdout);
        if (classified.isAuthorizationDenial) {
          authDenied = true;
        }
        builds.push({
          id: target.buildId,
          platform: target.platform,
          readbackStatus: "blocked_cli_view_failed",
          retryPerformed: false,
          alternateIdentityUsed: false,
          cliFailure: classified,
          metadataComparison: null,
          artifactReadback: {
            status: "not_available",
            reason:
              "EAS build:view failed; see cliFailure classification and stderrSha256.",
          },
        });
        continue;
      }

      const gitRelation = resolveGitSourceRelation(
        rawBuild?.gitCommitHash,
        config.headSha,
        git,
      );
      const metadataComparison = compareBuildViewMetadata(
        rawBuild,
        target.platform,
        target.buildId,
        config,
        gitRelation,
      );

      let artifactReadback;
      if (metadataComparison.terminalState.isFinished) {
        const rawArchiveUrl =
          rawBuild?.artifacts?.applicationArchiveUrl ||
          rawBuild?.artifacts?.buildUrl ||
          null;
        artifactReadback = await downloadAndInspectArtifact(
          rawArchiveUrl,
          target.platform,
          tempDir,
          options,
        );
      } else if (metadataComparison.terminalState.isErrored) {
        artifactReadback = {
          status: "build_errored_no_artifact",
          reason:
            "Build reached ERRORED terminal state in EAS; no signed artifact produced.",
        };
      } else {
        artifactReadback = {
          status: "not_finished_no_artifact",
          reason: `Build is in ${metadataComparison.terminalState.status || "UNKNOWN"} state; no signed artifact available.`,
        };
      }

      builds.push({
        id: target.buildId,
        platform: target.platform,
        readbackStatus: "observed",
        retryPerformed: false,
        alternateIdentityUsed: false,
        cliFailure: null,
        metadataComparison,
        artifactReadback,
      });
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  const allObserved =
    builds.length === 2 && builds.every((b) => b.readbackStatus === "observed");
  const allFinishedAndVerified =
    allObserved &&
    builds.every(
      (b) =>
        b.metadataComparison?.terminalState?.isFinished === true &&
        b.artifactReadback?.status === "verified" &&
        b.metadataComparison?.project?.matchesConfiguredProjectId === true &&
        b.metadataComparison?.project?.matchesExpectedSlug === true &&
        b.artifactReadback?.packagedIdentity
          ?.matchesExpectedDriverIdentifier === true,
    );
  const anyErrored =
    allObserved &&
    builds.some((b) => b.metadataComparison?.terminalState?.isErrored === true);

  let status = "incomplete_or_failed";
  if (allFinishedAndVerified) {
    status = "verified_finished_and_signed";
  } else if (allObserved && anyErrored) {
    status = "verified_terminal_with_build_error";
  } else if (authDenied) {
    status = "blocked_unauthorized_awaiting_operator";
  }

  const receipt = {
    schemaVersion: 1,
    taskId: "NATIVE-EXISTING-EAS-HOSTED-BUILD-LOOKUP-20261123",
    mode: config.mode,
    cliVersion: LIMITS.cliVersion,
    checkedOutHeadSha: config.headSha,
    expectedSourceSha: config.expectedSourceSha,
    status,
    awaitingOperatorAction: authDenied,
    runIdentity: config.runIdentity,
    project: {
      projectId: config.projectId,
      expectedProjectId: EXPECTED_DRIVER_PROJECT.projectId,
      slug: EXPECTED_DRIVER_PROJECT.slug,
      ownerAccount: EXPECTED_DRIVER_PROJECT.ownerAccount,
      appIdentifier: EXPECTED_DRIVER_PROJECT.appIdentifier,
      checkedOutAppVersion: config.checkedOutAppVersion,
      checkedOutAndroidVersionCode: config.checkedOutAndroidVersionCode,
      checkedOutIosBuildNumber: config.checkedOutIosBuildNumber,
    },
    guardrails: {
      readOnlyLookupMode: true,
      buildTriggered: false,
      storeSubmissionTriggered: false,
      privateKeysReadOrExported: false,
      secretExported: false,
      accountSwitched: false,
      alternateIdentityUsed: false,
      retryOnUnauthorizedPerformed: false,
      signedUrlsRecorded: false,
      rawUrlsRecorded: false,
      temporaryArtifactsDeleted: !fs.existsSync(tempDir),
    },
    builds,
    downstreamCardBindings: {
      "NATIVE-SIGNED-BUILD-READBACK-20261123": {
        requiredAcceptanceKey:
          "actual_eas_builds_read_back_with_artifact_identity",
        targetBuildIds: [config.androidBuildId, config.iosBuildId],
        terminalStateReadBack: allObserved,
        signedArtifactsVerified: allFinishedAndVerified,
        status: allFinishedAndVerified
          ? "satisfied_by_hosted_eas_readback"
          : allObserved && anyErrored
            ? "terminal_build_error_observed"
            : authDenied
              ? "blocked_existing_github_identity_unauthorized"
              : "pending_or_incomplete",
      },
      "SR-LIVE-DRIVER-001": {
        requiredAcceptanceKey: "native_build_candidate",
        targetBuildIds: [config.androidBuildId, config.iosBuildId],
        nativeBuildCandidateVerified: allFinishedAndVerified,
        physicalDeviceLifecycleGatesIncluded: false,
        remainingOriginalCardGates: [
          "authorized_android_ios_devices",
          "background_offline_sos_evidence",
          "live_candidate_sha",
        ],
      },
    },
  };

  assertRedactedReceipt(receipt, env);
  return receipt;
}

function writeReceipt(receipt, outputPath, env = {}) {
  assertRedactedReceipt(receipt, env);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function main(argv = process.argv.slice(2), env = process.env) {
  const command = argv[0] || "lookup";
  const outputPath = path.resolve(
    ".artifacts",
    "native-existing-builds",
    "driver-existing-builds-receipt.json",
  );

  if (command === "guard") {
    const config = guardConfig(env);
    process.stdout.write(
      `${JSON.stringify({
        phase: "guard",
        result: "pass",
        mode: config.mode,
        projectId: config.projectId,
        androidBuildId: config.androidBuildId,
        iosBuildId: config.iosBuildId,
        expectedSourceSha: config.expectedSourceSha,
        checkedOutHeadSha: config.headSha,
      })}\n`,
    );
    return 0;
  }

  if (command === "lookup") {
    const receipt = await lookupExistingBuilds(env);
    writeReceipt(receipt, outputPath, env);
    if (
      receipt.status !== "verified_finished_and_signed" &&
      receipt.status !== "verified_terminal_with_build_error"
    ) {
      process.stderr.write(
        `Existing Driver EAS build lookup finished with status=${receipt.status}; redacted receipt written to ${outputPath}\n`,
      );
      return 1;
    }
    return 0;
  }

  fail("UNKNOWN_COMMAND", "Supported commands: guard, lookup");
  return 1;
}

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err) => {
      const code = err?.code || "LOOKUP_FAILED";
      process.stderr.write(
        `Existing Driver EAS build lookup failed (${code}); sensitive details withheld.\n`,
      );
      process.exitCode = 1;
    });
}

module.exports = {
  UUID_REGEX,
  SHA_REGEX,
  EXPECTED_DRIVER_PROJECT,
  KNOWN_DRIVER_BUILDS,
  LIMITS,
  ALLOWED_ARTIFACT_HOSTS,
  sha256Hex,
  sanitizeText,
  guardConfig,
  prepareEphemeralEasProject,
  redactAndClassifyCliError,
  parseEasBuildViewJsonStdout,
  defaultEasBuildViewRunner,
  sanitizeArtifactUrl,
  resolveGitSourceRelation,
  compareBuildViewMetadata,
  downloadAndInspectArtifact,
  assertRedactedReceipt,
  lookupExistingBuilds,
  writeReceipt,
  main,
};
