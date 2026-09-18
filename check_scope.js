const fs = require("fs");
const code = fs.readFileSync(
  "apps/api/src/modules/owned-mobility/owned-mobility.service.ts",
  "utf8",
);
const lines = code.split("\n");

let braceCount = 0;
let funcStart = -1;
for (let i = 1035; i < 1250; i++) {
  if (lines[i].includes("createMultiTaxiRide(")) {
    funcStart = i;
  }
  braceCount += (lines[i].match(/\{/g) || []).length;
  braceCount -= (lines[i].match(/\}/g) || []).length;
  if (braceCount === 0 && funcStart !== -1) {
    console.log(`Function ends at line ${i}`);
    break;
  }
}
