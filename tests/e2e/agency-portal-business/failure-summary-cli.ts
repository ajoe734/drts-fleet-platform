// Usage: tsx failure-summary-cli.ts <report.json> <playwright.log>
import { main } from "./failure-summary";

process.stdout.write(main(process.argv.slice(2)));
