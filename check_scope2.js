const fs = require("fs");
const code = fs.readFileSync(
  "apps/api/src/modules/owned-mobility/owned-mobility.service.ts",
  "utf8",
);
const lines = code.split("\n");

let braceCount = 0;
let funcStart = -1;
let started = false;
for (let i = 1030; i < 1255; i++) {
  if (lines[i].includes("createMultiTaxiRide(")) {
    funcStart = i;
  }
  if (funcStart !== -1) {
    braceCount += (lines[i].match(/\{/g) || []).length;
    braceCount -= (lines[i].match(/\}/g) || []).length;
    if (braceCount > 0) started = true;
    if (started && braceCount === 0) {
      console.log(`Function ended at line ${i}`);
      break;
    }
  }
}
if (!started || braceCount > 0) {
  console.log("Function still open at line 1254. Brace count: " + braceCount);
}
