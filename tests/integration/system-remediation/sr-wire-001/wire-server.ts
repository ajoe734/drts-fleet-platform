import { createWireApp } from "./wire-app";
async function main() {
  const { app, baseUrl } = await createWireApp(
    Number(process.env.WIRE_API_PORT ?? 4102),
  );
  console.log(`WIRE full AppModule listening on ${baseUrl}`);
  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
