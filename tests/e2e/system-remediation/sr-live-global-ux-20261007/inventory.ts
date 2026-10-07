import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import type { Inventory, Surface } from "./model";

export const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const fullSha = (value: string) => /^[0-9a-f]{40}$/.test(value);
const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }).trim();
export const sourceAt = (sha: string, file: string) => git("show", `${sha}:${file}`);
export function inventoryAt(runtimeSha: string): Inventory {
  if (!fullSha(runtimeSha)) throw new Error("runtimeSha must be immutable full SHA");
  const policy = "packages/contracts/src/iam-policy-catalog.ts";
  const tenantRoles = [...sourceAt(runtimeSha, policy).matchAll(/roleCode: "([a-z_]+)"/g)].map(m => m[1]!);
  if (tenantRoles.length < 4) throw new Error("tenant role source changed; review inventory parser");
  const surface = (app: string, roles: string[], roleSource = policy): Surface => ({ app, roles, roleSource, service: app === "channel-partner-portal-web" ? `drts-${app}` : `drts-dev-${app}` });
  const surfaces = [
    surface("tenant-console-web", tenantRoles), surface("enterprise-dispatch-web", tenantRoles),
    surface("platform-admin-web", ["platform_admin"]), surface("ops-console-web", ["ops_user", "ops_observer"]),
    surface("bank-console-web", ["bank_program_admin", "bank_ops_viewer", "bank_finance"], "apps/bank-console-web/lib/session.ts"),
    surface("fleet-partner-portal-web", ["partner_api_key", "partner_user"]),
    surface("channel-partner-portal-web", ["partner_api_key"]), surface("referral-embed-web", ["referral_passenger"]),
  ];
  const workflow = sourceAt(runtimeSha, ".github/workflows/deploy-dev.yml");
  const deployed = [...workflow.matchAll(/assert_exact_active_service ([a-z-]+) /g)].map(m => m[1]!).filter(app => app !== "api").sort();
  if (JSON.stringify(deployed) !== JSON.stringify(surfaces.map(s => s.app).sort())) throw new Error("deployment active surface inventory changed; review required");
  for (const s of surfaces) for (const role of s.roles) {
    if (!sourceAt(runtimeSha, s.roleSource).includes(`"${role}"`)) throw new Error(`role source missing: ${s.app}/${role}`);
  }
  const files = git("ls-tree", "-r", "--name-only", runtimeSha, "apps").split("\n");
  const screens = surfaces.flatMap(s => files.filter(file => file.startsWith(`apps/${s.app}/app/`) && /\/page\.tsx$/.test(file)).map(source => {
    const route = "/" + source.slice(`apps/${s.app}/app/`.length).replace(/(^|\/)page\.tsx$/, "").replace(/\/$/, "");
    return { id: `${s.app}:${route}`, app: s.app, route, source, sourceBlob: git("rev-parse", `${runtimeSha}:${source}`), sourceCommit: runtimeSha, roles: s.roles, design: "unverified" as const };
  }));
  // Referral is a real multi-screen client, not just its single Next route.
  const referral = screens.find(s => s.id === "referral-embed-web:/embed/[entrySlug]");
  if (!referral) throw new Error("referral screen source missing");
  const embedSource = "apps/referral-embed-web/components/passenger-embed.tsx";
  const embed = sourceAt(runtimeSha, embedSource);
  for (const screen of ["book", "trip", "trips", "receipt", "completed", "cancelled", "nosupply", "ineligible", "denied", "degraded"]) {
    if (!embed.includes(`"${screen}"`)) throw new Error(`referral screen changed: ${screen}`);
    screens.push({ ...referral, id: `${referral.id}?screen=${screen}`, route: `${referral.route}?screen=${screen}`, source: embedSource, sourceBlob: git("rev-parse", `${runtimeSha}:${embedSource}`) });
  }
  if (screens.length < 100) throw new Error("incomplete page inventory");
  return { runtimeSha, surfaces, screens, excluded: {
    "partner-booking-web": ".github/workflows/deploy-dev.yml: paused-partner-booking-cleanup",
    "passenger-web": ".github/workflows/deploy-dev.yml: retired-service-cleanup; first-party passenger scope remains excluded",
    "concierge-portal-web": "docs/03-runbooks/smarttransport-tw-custom-domains.md: retired",
    "assisted-entry-web": "docs/03-runbooks/smarttransport-tw-custom-domains.md: retired",
    "driver-app": "SR-LIVE-GLOBAL-UX-20261007 task spec: native lifecycle separate; raw driver17/18/20/21 designs unverified",
  } };
}
