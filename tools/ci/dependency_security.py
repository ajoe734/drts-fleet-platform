import subprocess
import json
import sys
import datetime
from pathlib import Path

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
