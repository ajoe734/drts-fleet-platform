import { defineConfig } from "@playwright/test";

const repoRoot = "/home/edna/workspace/drts-fleet-platform";
const nextPackage = `${repoRoot}/node_modules/.pnpm/next@16.2.3_@playwright+test@1.59.1_babel-plugin-react-compiler@1.0.0_react-dom@19.2.5_react@19.2.5__react@19.2.5/node_modules/next`;
const reactPackage = `${repoRoot}/node_modules/.pnpm/react@19.2.5/node_modules/react`;
const reactDomPackage = `${repoRoot}/node_modules/.pnpm/react-dom@19.2.5_react@19.2.5/node_modules/react-dom`;
const tailwindPostcssPackage = `${repoRoot}/node_modules/.pnpm/@tailwindcss+postcss@4.2.4/node_modules/@tailwindcss/postcss`;
const tailwindPackage = `${repoRoot}/node_modules/.pnpm/tailwindcss@4.2.4/node_modules/tailwindcss`;
const postcssPackage = `${repoRoot}/node_modules/.pnpm/postcss@8.5.10/node_modules/postcss`;
const lucidePackage = `${repoRoot}/node_modules/.pnpm/lucide-react@1.9.0_react@19.2.5/node_modules/lucide-react`;
const clsxPackage = `${repoRoot}/node_modules/.pnpm/clsx@2.1.1/node_modules/clsx`;
const tailwindMergePackage = `${repoRoot}/node_modules/.pnpm/tailwind-merge@3.5.0/node_modules/tailwind-merge`;

const localChannelPartnerPortalBaseURL = "http://127.0.0.1:3013";
const channelPartnerPortalBaseURL =
  process.env.DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL ??
  process.env.CHANNEL_PARTNER_PORTAL_BASE_URL ??
  localChannelPartnerPortalBaseURL;
const shouldStartLocalChannelPartnerPortal =
  channelPartnerPortalBaseURL === localChannelPartnerPortalBaseURL ||
  channelPartnerPortalBaseURL === "http://localhost:3013";

function repairSymlink(target: string, link: string) {
  return `[ "$(readlink ${link} 2>/dev/null)" = "${target}" ] || ln -sfnT ${target} ${link}`;
}

const repairChannelPartnerPortalSymlinksCommand = [
  "mkdir -p apps/channel-partner-portal-web/node_modules/@drts apps/channel-partner-portal-web/node_modules/@tailwindcss packages/ui-web/node_modules/@drts packages/api-client/node_modules/@drts",
  repairSymlink(
    `${repoRoot}/packages/api-client`,
    "apps/channel-partner-portal-web/node_modules/@drts/api-client",
  ),
  repairSymlink(
    `${repoRoot}/packages/contracts`,
    "apps/channel-partner-portal-web/node_modules/@drts/contracts",
  ),
  repairSymlink(
    `${repoRoot}/packages/control-plane-auth`,
    "apps/channel-partner-portal-web/node_modules/@drts/control-plane-auth",
  ),
  repairSymlink(
    `${repoRoot}/packages/shared-types`,
    "apps/channel-partner-portal-web/node_modules/@drts/shared-types",
  ),
  repairSymlink(
    `${repoRoot}/packages/ui-web`,
    "apps/channel-partner-portal-web/node_modules/@drts/ui-web",
  ),
  repairSymlink(
    `${repoRoot}/packages/ui-tokens`,
    "packages/ui-web/node_modules/@drts/ui-tokens",
  ),
  repairSymlink(
    `${repoRoot}/packages/contracts`,
    "packages/api-client/node_modules/@drts/contracts",
  ),
  repairSymlink(
    nextPackage,
    "apps/channel-partner-portal-web/node_modules/next",
  ),
  repairSymlink(
    reactPackage,
    "apps/channel-partner-portal-web/node_modules/react",
  ),
  repairSymlink(
    reactDomPackage,
    "apps/channel-partner-portal-web/node_modules/react-dom",
  ),
  repairSymlink(
    tailwindPackage,
    "apps/channel-partner-portal-web/node_modules/tailwindcss",
  ),
  repairSymlink(
    postcssPackage,
    "apps/channel-partner-portal-web/node_modules/postcss",
  ),
  repairSymlink(
    tailwindPostcssPackage,
    "apps/channel-partner-portal-web/node_modules/@tailwindcss/postcss",
  ),
  repairSymlink(
    lucidePackage,
    "apps/channel-partner-portal-web/node_modules/lucide-react",
  ),
  repairSymlink(
    clsxPackage,
    "apps/channel-partner-portal-web/node_modules/clsx",
  ),
  repairSymlink(
    tailwindMergePackage,
    "apps/channel-partner-portal-web/node_modules/tailwind-merge",
  ),
].join(" && ");

const localChannelPartnerPortalDevCommand = [
  repairChannelPartnerPortalSymlinksCommand,
  `node ${nextPackage}/dist/bin/next dev apps/channel-partner-portal-web --webpack --hostname 127.0.0.1 --port 3013`,
].join(" && ");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /channel-partner-portal-surfaces\.spec\.ts/,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: channelPartnerPortalBaseURL,
    trace: "retain-on-failure",
  },
  // Only spin up a local dev server when targeting localhost; against a deployed
  // dev URL (DRTS_DEV_CHANNEL_PARTNER_PORTAL_BASE_URL) the webServer is skipped so
  // the post-deploy smoke runs purely against the deployment.
  ...(shouldStartLocalChannelPartnerPortal
    ? {
        webServer: {
          command: `bash -lc ${JSON.stringify(localChannelPartnerPortalDevCommand)}`,
          url: localChannelPartnerPortalBaseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  timeout: 45_000,
});
