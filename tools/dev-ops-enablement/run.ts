import { runFromEnvironment } from "./runner";

void runFromEnvironment().catch(() => {
  // No raw response, exception message, command output or credential is printed.
  process.stderr.write("Normal development Ops enablement did not complete.\n");
  process.exitCode = 1;
});
