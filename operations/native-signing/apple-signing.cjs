/* eslint-disable @typescript-eslint/no-require-imports -- standalone runner script without dependencies */
// Usage: node operations/native-signing/apple-signing.cjs check|ensure
//
// check   reads the driver app's identifier, capabilities, profiles and devices.
// ensure  turns Associated Domains on when it is off, changes nothing else, and
//         writes the API key to APPLE_KEY_FILE for the EAS CLI.
//
// The Actions log is public: only counts, states and Apple's own constants are
// printed. Never print a device, certificate, team, key or Apple error text.
const fs = require("node:fs");
const { createPrivateKey, sign } = require("node:crypto");

const API = "https://api.appstoreconnect.apple.com";
const BUNDLE_IDENTIFIER = "com.cctechsupport.drts.driver";
const CAPABILITY = "ASSOCIATED_DOMAINS";
const CONSTANT = /^[A-Z][A-Z0-9_.]{0,79}$/;

class SigningError extends Error {}

const constant = (value) =>
  typeof value === "string" && CONSTANT.test(value) ? value : "UNKNOWN";

function loadKey(env) {
  const raw = (env.ASC_API_KEY_P8 ?? "").replace(/\\n/g, "\n").trim();
  const encoded = (env.ASC_API_KEY_P8_BASE64 ?? "").trim();
  for (const pem of [raw, Buffer.from(encoded, "base64").toString("utf8")]) {
    if (!pem.includes("PRIVATE KEY")) continue;
    try {
      const key = createPrivateKey(pem);
      if (key.asymmetricKeyDetails?.namedCurve !== "prime256v1") continue;
      return { key, pem: key.export({ type: "pkcs8", format: "pem" }) };
    } catch {
      // Try the other form; the parser's message may quote the key.
    }
  }
  throw new SigningError("The App Store Connect API key cannot be read.");
}

function createClient(env, fetchImpl = fetch) {
  const { key, pem } = loadKey(env);
  const keyId = (env.ASC_KEY_ID ?? "").trim();
  const issuerId = (env.ASC_ISSUER_ID ?? "").trim();
  if (!keyId || !issuerId)
    throw new SigningError("ASC_KEY_ID or ASC_ISSUER_ID is not configured.");
  const token = () => {
    const now = Math.floor(Date.now() / 1000);
    const part = (value) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const head = part({ alg: "ES256", kid: keyId, typ: "JWT" });
    const body = part({
      iss: issuerId,
      iat: now,
      exp: now + 600,
      aud: "appstoreconnect-v1",
    });
    const signature = sign("sha256", Buffer.from(`${head}.${body}`), {
      key,
      dsaEncoding: "ieee-p1363",
    });
    return `${head}.${body}.${signature.toString("base64url")}`;
  };
  const call = async (label, path, body) => {
    let response;
    try {
      response = await fetchImpl(`${API}${path}`, {
        method: body ? "POST" : "GET",
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
        headers: {
          authorization: `Bearer ${token()}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new SigningError(`Apple could not be reached (${label}).`);
    }
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // A proxy or an empty answer; the status decides.
    }
    if (!response.ok)
      throw new SigningError(
        `Apple refused: ${label}, HTTP ${response.status}, ${constant(payload?.errors?.[0]?.code)}.`,
      );
    if (!payload?.data) throw new SigningError(`Apple sent no data: ${label}.`);
    return payload;
  };
  return { call, pem };
}

async function findBundle(client) {
  const { data } = await client.call(
    "find the app identifier",
    `/v1/bundleIds?filter[identifier]=${BUNDLE_IDENTIFIER}&limit=200`,
  );
  // Apple's filter matches longer identifiers too.
  const bundle = data.find(
    (item) => item.attributes?.identifier === BUNDLE_IDENTIFIER,
  );
  if (!bundle)
    throw new SigningError(
      `${BUNDLE_IDENTIFIER} is not registered with Apple.`,
    );
  return bundle;
}

async function readCapabilities(client, bundle) {
  const { data } = await client.call(
    "read the capabilities",
    `/v1/bundleIds/${bundle.id}/bundleIdCapabilities`,
  );
  return data.map((item) => constant(item.attributes?.capabilityType)).sort();
}

async function check(client, print) {
  const bundle = await findBundle(client);
  const capabilities = await readCapabilities(client, bundle);
  const profiles = await client.call(
    "read the profiles",
    `/v1/bundleIds/${bundle.id}/profiles?limit=200`,
  );
  const devices = await client.call(
    "count the devices",
    "/v1/devices?filter[status]=ENABLED&limit=200",
  );
  const counts = {};
  for (const { attributes } of profiles.data) {
    const name = `${constant(attributes?.profileType)}/${constant(attributes?.profileState)}`;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  print(`bundle_id=${BUNDLE_IDENTIFIER}`);
  print(`capabilities=${capabilities.join(",") || "none"}`);
  print(
    `associated_domains=${capabilities.includes(CAPABILITY) ? "on" : "off"}`,
  );
  print(
    `profiles=${
      Object.entries(counts)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, count]) => `${name}:${count}`)
        .join(",") || "none"
    }`,
  );
  print(
    `enabled_devices=${devices.meta?.paging?.total ?? devices.data.length}`,
  );
}

async function ensure(client, env, print) {
  if (!env.APPLE_KEY_FILE)
    throw new SigningError("APPLE_KEY_FILE is not configured.");
  const bundle = await findBundle(client);
  const before = await readCapabilities(client, bundle);
  if (before.includes(CAPABILITY)) {
    print("associated_domains=already on");
  } else {
    await client.call(
      "turn Associated Domains on",
      "/v1/bundleIdCapabilities",
      {
        data: {
          type: "bundleIdCapabilities",
          attributes: { capabilityType: CAPABILITY, settings: [] },
          relationships: {
            bundleId: { data: { type: "bundleIds", id: bundle.id } },
          },
        },
      },
    );
    const after = await readCapabilities(client, bundle);
    if (!after.includes(CAPABILITY))
      throw new SigningError("Associated Domains is still off.");
    const lost = before.filter((name) => !after.includes(name));
    if (lost.length)
      throw new SigningError(`Capabilities went off: ${lost.join(",")}.`);
    print("associated_domains=turned on");
  }
  fs.writeFileSync(env.APPLE_KEY_FILE, client.pem, { mode: 0o600, flag: "wx" });
}

async function main(command, env, fetchImpl, print) {
  if (command !== "check" && command !== "ensure")
    throw new SigningError("Use check or ensure.");
  const client = createClient(env, fetchImpl);
  if (command === "check") await check(client, print);
  else await ensure(client, env, print);
}

/* v8 ignore start */
if (require.main === module) {
  main(process.argv[2], process.env, fetch, (line) => console.log(line)).catch(
    (error) => {
      console.error(
        `::error::${error instanceof SigningError ? error.message : `Apple signing failed (${error?.code ?? error?.name}).`}`,
      );
      process.exitCode = 1;
    },
  );
}
/* v8 ignore stop */

module.exports = { main, SigningError };
