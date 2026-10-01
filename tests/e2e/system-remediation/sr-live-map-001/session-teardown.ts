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
}

main().catch(err => {
  console.error("Error during teardown:", err);
  process.exitCode = 1;
});
