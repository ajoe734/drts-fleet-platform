import subprocess
import json
import sys
import datetime
import hashlib
import re
from pathlib import Path

# npm still publishes 4.3.1. This is a verified local mitigation, not a claim
# that the upstream version is fixed. Review these pins together with the patch.
DEEPMERGE_PATCH = 'patches/deepmerge@4.3.1.patch'
DEEPMERGE_PATCH_SHA256 = '6241e75cd0ebdeefbe93564d0f9a0da153bc6608add12970bd3c390910e7e4f4'
DEEPMERGE_MITIGATION = 'deepmerge-4.3.1-prototype-poisoning'
DEEPMERGE_FILES = {
    'index.js': 'dbef7cab6abdd1338228a08297f0047b3f56c9d7533b38358629b6024c78dbc7',
    'dist/cjs.js': '8983763adcccc772c023cb97bbf8830de52f7eeaa3c997b867345e1e62dd9d3b',
    'dist/umd.js': '61f125f6ee85c534ddafcd12d2e89c52acd0cd2c9cd292b111cd403ab58e5172',
    'package.json': 'f56978e7a6da1a3c6edee41abb54f98584a2fa2680458c48db820ae772fef0c9',
}

# Resolve from both real applications through Expo and its CLI. Also inspect
# every installed pnpm dependent link, so another consumer cannot silently use
# an unpatched copy. Hash the distributed entrypoints before executing them.
DEEPMERGE_INSTALLED_CHECK = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const [root, patchHash, files] = JSON.parse(process.argv[1]);
const virtual = path.join(root, 'node_modules/.pnpm');
const expected = fs.realpathSync(path.join(virtual,
  `deepmerge@4.3.1_patch_hash=${patchHash}/node_modules/deepmerge`));
const checked = new Set();
function check(consumerRequire) {
  const entry = fs.realpathSync(consumerRequire.resolve('deepmerge'));
  assert.equal(entry, path.join(expected, 'dist/cjs.js'), 'unexpected deepmerge resolution');
  if (checked.has(entry)) return;
  for (const [file, hash] of Object.entries(files)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(expected, file)))
      .digest('hex'), hash, `installed deepmerge integrity: ${file}`);
  }
  for (const file of ['dist/cjs.js', 'dist/umd.js']) {
    const merge = consumerRequire(path.join(expected, file));
    const attack = () => JSON.parse('{"__proto__":{"injectedAdmin":true},"safe":42}');
    const safe = result => {
      assert.equal(Object.getPrototypeOf(result), Object.prototype);
      assert.equal(result.injectedAdmin, undefined);
      assert.equal(Object.hasOwn(result, '__proto__'), false);
      assert.equal(result.safe, 42);
    };
    safe(merge(Object.create(null), attack()));
    safe(merge(attack(), {}));
    safe(merge(attack(), attack()));
    for (const value of [null, undefined, false, 0, 'placeholder']) {
      safe(merge({session: value}, {session: attack()}).session);
    }
    safe(merge({}, {list: [attack()]}).list[0]);
    assert.deepEqual(merge({a: {b: 1}, list: [1]}, {a: {c: 2}, list: [2]}),
      {a: {b: 1, c: 2}, list: [1, 2]});
    assert.equal(({}).injectedAdmin, undefined);
  }
  checked.add(entry);
}
const consumers = [];
for (const app of ['driver-app', 'passenger-app']) {
  const appRequire = createRequire(path.join(root, 'apps', app, 'package.json'));
  const expoRequire = createRequire(appRequire.resolve('expo/package.json'));
  const cliRequire = createRequire(expoRequire.resolve('@expo/cli/package.json'));
  for (const parent of [expoRequire, cliRequire]) {
    const configEntry = parent.resolve('@expo/config');
    check(createRequire(configEntry));
    consumers.push({app, configEntry});
  }
}
for (const directory of fs.readdirSync(virtual)) {
  const dependent = path.join(virtual, directory, 'node_modules/deepmerge');
  if (fs.existsSync(dependent)) {
    check(createRequire(path.join(virtual, directory, 'node_modules/__probe__.cjs')));
  }
}
assert.equal(checked.size, 1);
console.log(JSON.stringify({entry: [...checked][0], files, consumers}));
"""


def verify_deepmerge_patch(root):
    """Fail closed unless manifest, lock and effective consumers bind this patch."""
    if hashlib.sha256((root / DEEPMERGE_PATCH).read_bytes()).hexdigest() != DEEPMERGE_PATCH_SHA256:
        raise ValueError('deepmerge patch integrity mismatch')
    manifest = json.loads((root / 'package.json').read_text())
    if manifest.get('pnpm', {}).get('patchedDependencies', {}).get('deepmerge@4.3.1') != DEEPMERGE_PATCH:
        raise ValueError('deepmerge manifest patch binding missing')
    lock = (root / 'pnpm-lock.yaml').read_text()
    # Deliberately accept only the reviewed pnpm 9 lock stanza, not arbitrary
    # YAML spellings/aliases. No YAML dependency is needed before install in CI.
    stanza = (f'patchedDependencies:\n  deepmerge@4.3.1:\n'
              f'    hash: {DEEPMERGE_PATCH_SHA256}\n    path: {DEEPMERGE_PATCH}\n')
    version = f'4.3.1(patch_hash={DEEPMERGE_PATCH_SHA256})'
    references = re.findall(r'^      deepmerge: (.+)$', lock, re.MULTILINE)
    package_keys = re.findall(r'^  deepmerge@([^\n]+):(?: \{\})?$', lock, re.MULTILINE)
    if (lock.count(stanza) != 1 or lock.count('\npatchedDependencies:\n') != 1
            or not references or any(ref != version for ref in references)
            or sorted(package_keys) != sorted(['4.3.1', '4.3.1', version])):
        raise ValueError('deepmerge lock patch binding mismatch')
    result = subprocess.run(
        ['node', '-e', DEEPMERGE_INSTALLED_CHECK,
         json.dumps([str(root), DEEPMERGE_PATCH_SHA256, DEEPMERGE_FILES])],
        cwd=root, capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise ValueError(f'deepmerge installed patch verification failed: {result.stderr}')
    print(f'Verified effective deepmerge patch: {result.stdout.strip()}')


def run_audit():
    result = subprocess.run(
        ['pnpm', 'audit', '--prod', '--json'],
        capture_output=True,
        text=True
    )
    
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("Failed to parse pnpm audit output")
        print("Exit code:", result.returncode)
        print(result.stdout)
        print(result.stderr)
        sys.exit(1)
        
    if not isinstance(data, dict):
        print("Malformed audit report: not an object")
        sys.exit(1)

    if 'error' in data:
        print(f"pnpm audit returned an operational error: {data['error']}")
        sys.exit(1)
        
    if result.returncode not in (0, 1):
        print(f"pnpm audit failed with unexpected exit code: {result.returncode}")
        print(result.stderr)
        sys.exit(1)

    if 'advisories' not in data and 'metadata' not in data:
        print("Malformed audit report: missing advisories and metadata")
        sys.exit(1)
        
    if 'metadata' not in data or not isinstance(data['metadata'], dict):
        print("Malformed audit report: metadata is not an object")
        sys.exit(1)
        
    if 'vulnerabilities' not in data['metadata'] or not isinstance(data['metadata']['vulnerabilities'], dict):
        print("Malformed audit report: metadata.vulnerabilities missing or not an object")
        sys.exit(1)
        
    vuln_counts = data['metadata']['vulnerabilities']
    required_counters = {'info', 'low', 'moderate', 'high', 'critical'}
    if set(vuln_counts.keys()) != required_counters:
        print(f"Malformed audit report: metadata.vulnerabilities must contain exactly {required_counters}")
        sys.exit(1)
        
    for key, val in vuln_counts.items():
        if not isinstance(val, int) or isinstance(val, bool) or val < 0:
            print(f"Malformed audit report: metadata.vulnerabilities.{key} must be a non-negative integer")
            sys.exit(1)
            
    if 'advisories' in data and not isinstance(data['advisories'], dict):
        print("Malformed audit report: advisories is not an object")
        sys.exit(1)
        
    advisories = data.get('advisories', {})
    vuln_totals = sum(vuln_counts.values())
    
    if result.returncode == 0 and vuln_totals > 0:
        print("pnpm audit exited 0 but metadata indicates vulnerabilities are present")
        sys.exit(1)
        
    if result.returncode == 1 and vuln_totals == 0:
        print("pnpm audit exited 1 but metadata indicates no vulnerabilities")
        sys.exit(1)
        
    if result.returncode == 1 and not advisories:
        print("pnpm audit exited 1 but no advisories found to evaluate")
        sys.exit(1)
        
    if result.returncode == 0 and advisories:
        print("pnpm audit exited 0 but advisories are present")
        sys.exit(1)
        
    return data

def main():
    audit_data = run_audit()
    
    # Load exceptions
    exceptions_file = Path(__file__).parent / 'dependency-security-exceptions.json'
    if not exceptions_file.exists():
        exceptions = []
    else:
        with open(exceptions_file) as f:
            exceptions = json.load(f)
            
    now = datetime.datetime.now(datetime.timezone.utc)
    valid_exceptions = {}
    for exc in exceptions:
        if not isinstance(exc, dict):
            print("Exception entry must be an object")
            sys.exit(1)
            
        required_keys = {'advisory_id', 'module_name', 'expires_at', 'versions', 'paths'}
        missing = required_keys - set(exc.keys())
        if missing:
            print(f"Exception missing required keys {missing}: {exc}")
            sys.exit(1)
            
        if not isinstance(exc['versions'], list) or not exc['versions']:
            print(f"Exception versions must be a non-empty list: {exc}")
            sys.exit(1)
            
        if not isinstance(exc['paths'], list) or not exc['paths']:
            print(f"Exception paths must be a non-empty list: {exc}")
            sys.exit(1)
            
        adv_id = str(exc['advisory_id'])
        if adv_id in valid_exceptions:
            print(f"Duplicate exception for advisory {adv_id}")
            sys.exit(1)
            
        try:
            expiry = datetime.datetime.fromisoformat(exc['expires_at'].replace('Z', '+00:00'))
        except ValueError:
            print(f"Invalid expires_at format in exception: {exc['expires_at']}")
            sys.exit(1)
            
        if now > expiry:
            print(f"Exception for advisory {adv_id} has expired!")
            sys.exit(1)

        mitigation = exc.get('verified_patch')
        if adv_id == '1243505':
            if (exc['module_name'] != 'deepmerge' or exc['versions'] != ['4.3.1']
                    or mitigation != DEEPMERGE_MITIGATION):
                print('Advisory 1243505 requires the verified deepmerge patch condition')
                sys.exit(1)
            try:
                verify_deepmerge_patch(Path(__file__).resolve().parents[2])
            except (OSError, ValueError, subprocess.SubprocessError) as error:
                print(f'Cannot accept deepmerge mitigation: {error}')
                sys.exit(1)
        elif mitigation is not None:
            print(f'Unsupported verified_patch condition for advisory {adv_id}')
            sys.exit(1)
            
        valid_exceptions[adv_id] = exc
            
    failed = False
    unexcepted = []
    
    advisories = audit_data.get('advisories', {})
    for vuln_id, vuln in advisories.items():
        module_name = vuln['module_name']
        severity = vuln['severity']
        title = vuln['title']
        
        exc = valid_exceptions.get(str(vuln_id))
        
        if not exc:
            failed = True
            unexcepted.append(f"[{severity}] ID: {vuln_id} ({module_name}): {title} (No exception found)")
            continue
            
        if exc['module_name'] != module_name:
            failed = True
            unexcepted.append(f"[{severity}] ID: {vuln_id} ({module_name}): Exception module {exc['module_name']} does not match.")
            continue
            
        expected_paths = set(exc['paths'])
        expected_versions = set(exc['versions'])
        
        findings = vuln.get('findings', [])
        if not findings or not isinstance(findings, list):
            failed = True
            unexcepted.append(f"[{severity}] ID: {vuln_id} ({module_name}): Missing or empty findings.")
            continue
            
        for finding in findings:
            ver = finding.get('version')
            if not ver or ver not in expected_versions:
                failed = True
                unexcepted.append(f"[{severity}] ID: {vuln_id} ({module_name}): Version {ver} is not excepted.")
                
            paths = finding.get('paths', [])
            if not paths or not isinstance(paths, list):
                failed = True
                unexcepted.append(f"[{severity}] ID: {vuln_id} ({module_name}): Missing or empty paths in finding.")
                continue
                
            for path in paths:
                if path not in expected_paths:
                    failed = True
                    unexcepted.append(f"[{severity}] ID: {vuln_id} ({module_name}): Path {path} is not excepted.")

    if failed:
        print("Found unexcepted vulnerabilities:")
        for u in unexcepted:
            print(u)
        sys.exit(1)
        
    print("No unexcepted vulnerabilities found.")
    sys.exit(0)

if __name__ == '__main__':
    main()
