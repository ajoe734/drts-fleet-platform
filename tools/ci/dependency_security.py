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
        
    if 'error' in data:
        print(f"pnpm audit returned an operational error: {data['error']}")
        sys.exit(1)
        
    if 'advisories' not in data and 'metadata' not in data:
        print("Malformed audit report: missing advisories and metadata")
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
        expiry = datetime.datetime.fromisoformat(exc['expires_at'].replace('Z', '+00:00'))
        if now > expiry:
            print(f"Exception for advisory {exc.get('advisory_id', 'unknown')} has expired!")
            sys.exit(1)
            
        if 'advisory_id' in exc:
            valid_exceptions[str(exc['advisory_id'])] = exc
            
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
            
        expected_paths = set(exc.get('paths', []))
        expected_versions = set(exc.get('versions', []))
        
        for finding in vuln['findings']:
            ver = finding['version']
            if expected_versions and ver not in expected_versions:
                failed = True
                unexcepted.append(f"[{severity}] ID: {vuln_id} ({module_name}): Version {ver} is not excepted.")
                
            for path in finding['paths']:
                if expected_paths and path not in expected_paths:
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
