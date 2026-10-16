import { createWireApp } from "./wire-app";
import {
  saveWireHostBrowserSessions,
  removeWireHostBrowserSessions,
} from "./host-browser-sessions";
async function main() {
  const { app, baseUrl, hostA, hostB } = await createWireApp(
    Number(process.env.WIRE_API_PORT ?? 4102),
  );
  saveWireHostBrowserSessions({ hostA, hostB });
  console.log(`WIRE full AppModule listening on ${baseUrl}`);
  const shutdown = async () => {
    await app.close();
    removeWireHostBrowserSessions();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
