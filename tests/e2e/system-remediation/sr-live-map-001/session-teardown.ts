import { validateCoverageTargets } from "./live-map-config";

async function main() {
  const config = validateCoverageTargets(process.env);
  const deviceId = process.env.DRTS_LIVE_MAP_DRIVER_DEVICE_ID;
  const driverToken = process.env.DRTS_LIVE_MAP_DRIVER_SESSION_TOKEN;
  
  if (deviceId && driverToken) {
    console.log("Revoking driver device session...");
    const url = `${config.apiOrigin}/api/auth/driver/device/revoke`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${driverToken}`
      },
      body: JSON.stringify({ deviceId }),
    });
    if (!response.ok) {
      console.error(`Failed to revoke session: ${response.status} ${await response.text()}`);
      process.exitCode = 1;
    } else {
      console.log("Driver session revoked successfully.");
    }
  } else {
    console.log("No driver device ID or session token to revoke.");
  }

  const inviteCode = process.env.DRTS_LIVE_MAP_INVITE_CODE;
  if (inviteCode) {
    console.log("Revoking driver device invite...");
    const { execFileSync } = await import("node:child_process");
    const internalKey = execFileSync(
      "gcloud",
      [
        "secrets",
        "versions",
        "access",
        "latest",
        "--secret=drts-dev-jwt-secret",
        `--project=${process.env.DEV_GCP_PROJECT_ID}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    ).trim();

    const tokenUrl = `${config.apiOrigin}/api/auth/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-drts-internal-key": internalKey,
        "x-actor-type": "platform_admin",
        "x-actor-id": "principal_platform_admin_default",
        "x-realm": "platform",
        "x-scopes": "driver:provision",
      },
      body: "{}",
    });
    
    if (tokenResponse.ok) {
      const { token } = await tokenResponse.json();
      const revokeUrl = `${config.apiOrigin}/api/auth/driver/device/invite/revoke`;
      const revokeResponse = await fetch(revokeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ registrationCode: inviteCode }),
      });
      if (revokeResponse.ok) {
        console.log("Invite revoked successfully.");
      } else {
        console.error(`Failed to revoke invite: ${revokeResponse.status} ${await revokeResponse.text()}`);
      }
    } else {
      console.error(`Failed to mint temp token for invite revocation: ${tokenResponse.status}`);
    }
  }
}

main().catch(err => {
  console.error("Error during teardown:", err);
  process.exitCode = 1;
});
