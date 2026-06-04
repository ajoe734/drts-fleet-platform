const path = require("path");

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: path.join(__dirname),
  testMatch: "dev-gap-audit.spec.js",
  fullyParallel: false,
  reporter: "line",
  timeout: 300_000,
  use: {
    viewport: {
      width: 1440,
      height: 950,
    },
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
  outputDir: path.join(process.cwd(), "test-results/dev-gap-audit"),
};
