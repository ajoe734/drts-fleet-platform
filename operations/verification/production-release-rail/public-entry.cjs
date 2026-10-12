/* eslint-disable @typescript-eslint/no-require-imports -- executable CommonJS deployment rail */
const { createHash } = require("node:crypto");
const PUBLIC_IDS = ["referral-embed-web", "passenger-app-web"];
function blocked(detail) {
  throw new Error(
    `Missing or invalid production configuration: F-PUBLIC-ENTRY deployment blocker: ${detail}`,
  );
}
function publicEntryConfig(raw) {
  let entries;
  try {
    entries = JSON.parse(raw);
  } catch {
    blocked(
      "PROD_PUBLIC_ENTRY_CONFIG_JSON (approved public IAM/OAuth policy evidence required)",
    );
  }
  if (
    !entries ||
    Array.isArray(entries) ||
    Object.keys(entries).length !== PUBLIC_IDS.length ||
    Object.keys(entries).some((id) => !PUBLIC_IDS.includes(id))
  )
    blocked(
      "PROD_PUBLIC_ENTRY_CONFIG_JSON must cover only referral and passenger entry",
    );
  for (const id of PUBLIC_IDS) {
    const entry = entries[id];
    if (
      entry?.mode !== "iap-public-entry" ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(entry.backendService) ||
      typeof entry.approvalRef !== "string" ||
      !/^https:\/\/github\.com\/ajoe734\/drts-fleet-platform\/(issues|pull)\/[1-9][0-9]*(#[-a-zA-Z0-9]+)?$/.test(
        entry.approvalRef,
      )
    )
      blocked(
        `${id}: approved resource-specific iap-public-entry policy and approvalRef required`,
      );
    if (id === "passenger-app-web") {
      const providers = entry.expectedProviders;
      if (
        !Array.isArray(providers) ||
        !providers.length ||
        new Set(providers).size !== providers.length ||
        providers.some(
          (p) => !["phone", "email", "facebook", "line", "google"].includes(p),
        )
      )
        blocked(
          `${id}: expectedProviders must name real enabled customer login methods`,
        );
    } else if (
      !/^[a-z0-9][a-z0-9-]{0,127}$/.test(entry.entrySlug) ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(entry.entryHost)
    )
      blocked(`${id}: canonical entrySlug and entryHost required`);
  }
  if (
    entries[PUBLIC_IDS[0]].backendService ===
    entries[PUBLIC_IDS[1]].backendService
  )
    blocked("public surfaces require separate backend policies");
  return entries;
}

// Read the real external policy. An approval reference describes authorization;
// it does not replace these reads or an anonymous request through the origin.
// This rail supports a global LB with one regional serverless NEG per surface.
// Other approved topologies require an explicit reviewed adapter, never fallback.
function checkPublicEntryPolicies(plan, cloud) {
  const records = [];
  for (const service of plan.services.filter((s) => s.publicEntry)) {
    const entry = service.publicEntry;
    const read = (args) => {
      try {
        return JSON.parse(
          cloud([...args, "--project", plan.project, "--format=json"]),
        );
      } catch {
        blocked(
          `${service.id}: external IAM/OAuth policy read unavailable (${args.slice(0, 3).join(" ")})`,
        );
      }
    };
    const project = read(["projects", "describe", plan.project]);
    if (!/^[0-9]+$/.test(String(project.projectNumber)))
      blocked(`${service.id}: project number evidence`);
    const backend = read([
      "compute",
      "backend-services",
      "describe",
      entry.backendService,
      "--global",
    ]);
    const groupPrefix = `https://www.googleapis.com/compute/v1/projects/${plan.project}/regions/${plan.region}/networkEndpointGroups/`;
    const group = backend.backends?.[0]?.group;
    if (
      backend.name !== entry.backendService ||
      backend.iap?.enabled !== true ||
      backend.backends?.length !== 1 ||
      typeof group !== "string" ||
      !group.startsWith(groupPrefix) ||
      !/^[a-z][a-z0-9-]{0,62}$/.test(group.slice(groupPrefix.length))
    )
      blocked(
        `${service.id}: enabled IAP and exact regional serverless backend evidence`,
      );
    const neg = read([
      "compute",
      "network-endpoint-groups",
      "describe",
      group.slice(groupPrefix.length),
      "--region",
      plan.region,
    ]);
    if (
      neg.networkEndpointType !== "SERVERLESS" ||
      neg.cloudRun?.service !== service.name ||
      neg.cloudRun?.tag ||
      neg.cloudRun?.urlMask
    )
      blocked(
        `${service.id}: LB backend must target the exact untagged Cloud Run service`,
      );
    const iap = read([
      "iap",
      "web",
      "get-iam-policy",
      "--resource-type=backend-services",
      `--service=${entry.backendService}`,
    ]);
    if (
      !iap.bindings?.some(
        (b) =>
          b.role === "roles/iap.httpsResourceAccessor" &&
          !b.condition &&
          b.members?.includes("allUsers"),
      )
    )
      blocked(
        `${service.id}: unconditional IAP allUsers entry grant absent; staff-only/allAuthenticatedUsers cannot serve anonymous customers`,
      );
    const iam = read([
      "run",
      "services",
      "get-iam-policy",
      service.name,
      "--region",
      plan.region,
    ]);
    const iapAgent = `serviceAccount:service-${project.projectNumber}@gcp-sa-iap.iam.gserviceaccount.com`;
    if (
      !iam.bindings?.some(
        (b) =>
          b.role === "roles/run.invoker" &&
          !b.condition &&
          b.members?.includes(iapAgent),
      ) ||
      iam.bindings.some((b) =>
        b.members?.some((m) =>
          ["allUsers", "allAuthenticatedUsers"].includes(m),
        ),
      )
    )
      blocked(
        `${service.id}: private Run IAM must grant the IAP service agent and exclude public members`,
      );
    const run = read([
      "run",
      "services",
      "describe",
      service.name,
      "--region",
      plan.region,
    ]);
    if (
      run.metadata?.annotations?.["run.googleapis.com/ingress"] !==
        "internal-and-cloud-load-balancing" ||
      run.metadata?.annotations?.["run.googleapis.com/invoker-iam-disabled"] ===
        "true"
    )
      blocked(`${service.id}: private ingress/invoker IAM evidence`);
    records.push({
      service: service.id,
      mode: entry.mode,
      backendService: entry.backendService,
      approvalRef: entry.approvalRef,
      policySha256: createHash("sha256")
        .update(JSON.stringify({ backend, neg, iap, iam }))
        .digest("hex"),
    });
  }
  return records;
}
async function verifyPublicEntry(service, request) {
  const records = [];
  const get = async (path, headers = {}) => {
    const response = await request(`${service.origin}${path}`, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    return { response, body: await response.text() };
  };
  const record = (path, response, kind) =>
    records.push({
      path,
      status: response.status,
      kind,
      credentials:
        kind === "invalid-session-denied" ? "invalid-fixture" : "none",
      result: "pass",
    });
  const parse = (body) => {
    try {
      return JSON.parse(body);
    } catch {
      blocked(`${service.id}: public entry JSON contract`);
    }
  };
  if (service.id === "passenger-app-web") {
    const page = await get("/login");
    if (page.response.status !== 200 || !page.body.includes("登入智行叫車"))
      blocked(`${service.id}: anonymous login page unreachable`);
    record("/login", page.response, "anonymous-login");
    const path = "/api/passenger-app/auth/providers";
    const providers = await get(path),
      body = parse(providers.body);
    if (
      providers.response.status !== 200 ||
      body.error !== undefined ||
      !Array.isArray(body.data?.providers) ||
      JSON.stringify([...body.data.providers].sort()) !==
        JSON.stringify([...service.publicEntry.expectedProviders].sort())
    )
      blocked(
        `${service.id}: anonymous provider discovery / approved OTP-OAuth availability`,
      );
    record(path, providers.response, "anonymous-provider-discovery");
  } else {
    const path = `/embed/${service.publicEntry.entrySlug}?entryHost=${service.publicEntry.entryHost}`;
    const page = await get(path);
    if (
      page.response.status !== 200 ||
      !page.body.includes(`/embed/${service.publicEntry.entrySlug}`) ||
      !page.body.includes("fallback_to_web")
    )
      blocked(
        `${service.id}: anonymous canonical embed fallback entry unreachable`,
      );
    record(path, page.response, "anonymous-embed-entry");
  }
  const path = service.probe.path;
  // Even a stale customer credential must reach the application denial boundary,
  // never an employee Google login page, generic edge denial or personal data.
  for (const headers of [
    {},
    { Cookie: "pax_session=invalid; drts_referral_embed_session=invalid" },
  ]) {
    const denied = await get(path, headers),
      body = parse(denied.body);
    const validDenial =
      service.id === "referral-embed-web"
        ? denied.response.status === 400 &&
          body.ok === false &&
          body.error?.message ===
            "UNAUTHORIZED: Active referral session required"
        : denied.response.status === 401 &&
          body.error?.code === "unauthorized" &&
          body.error?.message === "An active passenger session is required.";
    if (!validDenial || body.data !== undefined)
      blocked(`${service.id}: anonymous/invalid-session personal-data denial`);
    record(
      path,
      denied.response,
      Object.keys(headers).length
        ? "invalid-session-denied"
        : "anonymous-data-denied",
    );
  }
  return records;
}
module.exports = {
  PUBLIC_IDS,
  publicEntryConfig,
  checkPublicEntryPolicies,
  verifyPublicEntry,
};
