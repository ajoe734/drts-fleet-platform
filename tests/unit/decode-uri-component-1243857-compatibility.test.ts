import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Resolve through the installed Driver -> Expo Router -> query-string edges.
// Each subprocess has a hard deadline, including when run on the old decoder.
const root = resolve(__dirname, "../..");
const driverRequire = createRequire(
  resolve(root, "apps/driver-app/package.json"),
);
const routerRequire = createRequire(
  driverRequire.resolve("expo-router/package.json"),
);
const queryEntry = routerRequire.resolve("query-string");
const queryRequire = createRequire(queryEntry);
const decoderEntry = queryRequire.resolve("decode-uri-component");
const setup = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const queryEntry = ${JSON.stringify(queryEntry)};
const decoderEntry = ${JSON.stringify(decoderEntry)};
const queryRequire = createRequire(queryEntry);
`;

function probe(code: string, timeout = 5000) {
  const result = spawnSync(process.execPath, ["-e", setup + code], {
    cwd: root,
    encoding: "utf8",
    timeout,
  });
  expect(result.error, result.error?.message).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return result.stdout;
}

const behavior = `
const parsed = query.parse('city=%E5%8F%B0%E5%8C%97&tag=one&tag=%E4%BA%8C&plus=a+b&literal=%2B&percent=%25&empty=&flag');
assert.deepEqual({...parsed}, {city:'台北', tag:['one','二'], plus:'a b', literal:'+', percent:'%', empty:'', flag:null});
const params = {city:'台北', tag:['one','二'], plus:'a+b', percent:'100%', space:'a b'};
// Expo Router's named namespace consumption and {sort:false} option.
const encoded = query.stringify(params, {sort:false});
assert.ok(encoded.startsWith('city='));
assert.deepEqual({...query.parse(encoded)}, params);
const url = query.parseUrl('https://example.invalid/路線?' + encoded + '#stop');
assert.equal(url.url, 'https://example.invalid/路線');
assert.deepEqual({...url.query}, params);
assert.equal(query.stringifyUrl(url), 'https://example.invalid/路線?' + query.stringify(params));
for (const [input, expected] of [['%', '%'], ['%zz','%zz'], ['%E0%A4%A','%E0%A4%A'], ['%C3%28','%C3('], ['%FE%FF','\\uFFFD\\uFFFD']]) {
  assert.equal(query.parse('value=' + input).value, expected, input);
}
`;

describe("decode-uri-component advisory 1243857: installed Expo consumer", () => {
  it("retains Router/query-string versions and resolves official fixed ESM bytes", () => {
    expect(routerRequire("expo-router/package.json").version).toBe("6.0.24");
    expect(queryRequire("./package.json").version).toBe("7.1.3");
    const decoder = JSON.parse(
      readFileSync(resolve(dirname(decoderEntry), "package.json"), "utf8"),
    );
    expect(decoder.name).toBe("decode-uri-component");
    expect(decoder.version).toBe("0.5.1");
    expect(decoder.type).toBe("module");
    expect(decoderEntry.startsWith(root + "/node_modules/")).toBe(true);
    // Confirm the public namespace consumption in the real installed Router.
    const caller = readFileSync(
      routerRequire.resolve("expo-router/build/fork/getPathFromState-forks.js"),
      "utf8",
    );
    expect(caller).toContain('__importStar(require("query-string"))');
    expect(caller).toContain(
      "queryString.stringify(focusedParams, { sort: false })",
    );
  });

  it("parses and roundtrips valid/malformed inputs through Node 22 CJS", () => {
    probe(`const query = require(queryEntry); ${behavior}`);
  });

  it("executes the installed closure after Metro's ESM transform without a server", () => {
    probe(`
const driverRequire = createRequire(${JSON.stringify(resolve(root, "apps/driver-app/package.json"))});
const expoRequire = createRequire(driverRequire.resolve('expo/package.json'));
const metroRequire = createRequire(expoRequire.resolve('@expo/metro-config/package.json'));
const babel = metroRequire('@babel/core');
const {importExportPlugin} = metroRequire('metro-transform-plugins');
const vm = require('node:vm');
const cache = new Map();
// This loader evaluates the real package files after the same import/export
// transform Metro uses. Resolution follows installed package edges; no module
// implementation is substituted and Node's native ESM interop is not used.
function load(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = {exports:{}};
  cache.set(filename,module);
  const code = babel.transformSync(fs.readFileSync(filename,'utf8'), {
    filename, babelrc:false, configFile:false,
    plugins:[[importExportPlugin, {importDefault:'metroImportDefault', importAll:'metroImportAll'}]]
  }).code;
  const localRequire = name => load(createRequire(filename).resolve(name));
  const fn = vm.runInThisContext('(function(require,module,exports){' + code + '\\n})', {filename});
  fn(localRequire,module,module.exports);
  return module.exports;
}
const query = load(queryEntry);
${behavior}
// Execute the actual installed Router caller, isolated from unrelated native UI
// imports by selecting its declaration from the parsed distribution. The
// function body and query-string implementation are neither copied nor mocked.
const routerRequire = createRequire(driverRequire.resolve('expo-router/package.json'));
const callerPath = routerRequire.resolve('expo-router/build/fork/getPathFromState-forks.js');
const callerSource = fs.readFileSync(callerPath, 'utf8');
const callerAst = babel.parseSync(callerSource, {babelrc:false, configFile:false});
const declaration = callerAst.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'appendQueryAndHash');
assert.ok(declaration, 'real Router caller must exist');
const append = vm.runInThisContext('(function(queryString){' + callerSource.slice(declaration.start, declaration.end) + ';return appendQueryAndHash;})')(query);
const linked = append('/trip', {...params, '#':'stop'});
assert.equal(linked, '/trip?' + query.stringify(params, {sort:false}) + '#stop');
assert.deepEqual({...query.parseUrl(linked).query}, params);
`);
  });

  it("finishes the advisory's distinct malformed runs through the real parser", () => {
    probe(
      `
const query = require(queryEntry);
let payload = '';
for(let i=0;i<32000;i++) {
  payload += '%' + Math.floor(i/256).toString(16).padStart(2,'0') + '%' + (i%256).toString(16).padStart(2,'0') + 'x';
}
payload += '%zz';
const value = query.parse('value=' + payload).value;
assert.equal(typeof value, 'string');
assert.ok(value.endsWith('%zz'));
`,
      3000,
    );
  });

  it("finishes repeated invalid UTF-8 without recursive exponential fallback", () => {
    probe(
      `
const query = require(queryEntry);
const payload = '%EA'.repeat(1000);
assert.equal(query.parse('value=' + payload).value, payload);
`,
      3000,
    );
  });
});
