// Explicit production inputs for the existing document/proof/scanner factories.
// No object access, scanner call, credential discovery or provider defaults.
function artifactConfig(vars, env, secrets, need, reject, https) {
  const selected = new Set();
  const field = (key, optional = false) => {
    selected.add(`PROD_${key}`);
    if (!optional || vars[`PROD_${key}`] !== undefined)
      env[key] = need(`PROD_${key}`);
    return env[key];
  };
  const secret = (key, optional = false) => {
    const input = `PROD_${key}_SECRET`;
    selected.add(input);
    if (optional && vars[input] === undefined) return;
    const name = need(input);
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) reject(input);
    secrets[key] = name;
  };
  const boolean = (key) => {
    if (!["true", "false"].includes(field(key))) reject(`PROD_${key}`);
  };
  const integer = (key, min, max) => {
    const raw = field(key),
      value = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(value) ||
      value < min ||
      value > max
    )
      reject(`PROD_${key}`);
  };
  for (const prefix of ["DOCUMENT_ARTIFACT", "REMITTANCE_PROOF"]) {
    const provider = field(`${prefix}_STORAGE_PROVIDER`);
    if (!["gcs", "s3"].includes(provider))
      reject(`PROD_${prefix}_STORAGE_PROVIDER`);
    const bucket = field(`${prefix}_${provider.toUpperCase()}_BUCKET`);
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket))
      reject(`PROD_${prefix}_${provider.toUpperCase()}_BUCKET`);
    if (provider === "s3") {
      if (!/^[a-z0-9-]+$/.test(field(`${prefix}_S3_REGION`)))
        reject(`PROD_${prefix}_S3_REGION`);
      boolean(`${prefix}_S3_FORCE_PATH_STYLE`);
      const endpoint = field(`${prefix}_S3_ENDPOINT`, true);
      if (endpoint) https(endpoint, `PROD_${prefix}_S3_ENDPOINT`);
      // This GCP runtime has no approved ambient AWS credential chain. Require
      // a managed complete pair rather than pretending factory construction
      // proves that an unconfigured AWS credential provider is usable.
      secret(`${prefix}_S3_ACCESS_KEY_ID`);
      secret(`${prefix}_S3_SECRET_ACCESS_KEY`);
      secret(`${prefix}_S3_SESSION_TOKEN`, true);
    }
  }
  const scanner = field("REMITTANCE_PROOF_SCANNER_PROVIDER");
  if (scanner === "cloud-run-clamd") {
    const url = field("REMITTANCE_PROOF_SCANNER_URL");
    https(url, "PROD_REMITTANCE_PROOF_SCANNER_URL", true);
    if (!new URL(url).hostname.endsWith(".run.app"))
      reject("PROD_REMITTANCE_PROOF_SCANNER_URL");
    integer("REMITTANCE_PROOF_SCANNER_TIMEOUT_MS", 100, 60000);
  } else if (scanner === "clamd") {
    if (!/^[a-zA-Z0-9.:-]+$/.test(field("REMITTANCE_PROOF_CLAMD_HOST")))
      reject("PROD_REMITTANCE_PROOF_CLAMD_HOST");
    integer("REMITTANCE_PROOF_CLAMD_PORT", 1, 65535);
    integer("REMITTANCE_PROOF_CLAMD_TIMEOUT_MS", 100, 60000);
    boolean("REMITTANCE_PROOF_CLAMD_TLS");
  } else reject("PROD_REMITTANCE_PROOF_SCANNER_PROVIDER");
  // Reject typos, raw credentials and stale settings for a different provider;
  // --set-env-vars must never silently drop supplied artifact configuration.
  for (const key of Object.keys(vars))
    if (/^PROD_(DOCUMENT_|REMITTANCE_)/.test(key) && !selected.has(key))
      reject(key);
}
module.exports = { artifactConfig };
