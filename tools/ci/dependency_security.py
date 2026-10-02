import subprocess
import json
import sys
import datetime
from pathlib import Path

def run_audit():
    try:
        # Run pnpm audit --prod --json
        # pnpm audit returns non-zero if vulnerabilities are found
        result = subprocess.run(
            ['pnpm', 'audit', '--prod', '--json'],
            capture_output=True,
            text=True
        )
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        print("Failed to parse pnpm audit output")
        print(result.stdout)
        sys.exit(1)

def is_mobile_or_build_path(path):
    # React Native, Expo, PostCSS, Next are either mobile (client-side only) or build-time
    return any(p in path for p in ['apps__driver-app>expo', 'apps__driver-app>react-native', 'apps__driver-app>@react-navigation/native', 'postcss', 'apps__bank-console-web>next', 'apps__driver-app>expo>@expo/cli>undici', 'apps__driver-app>expo>@expo/cli>@expo/xcpretty>js-yaml'])

def main():
    audit_data = run_audit()
    
    # Load exceptions
    exceptions_file = Path(__file__).parent / 'dependency-security-exceptions.json'
    if not exceptions_file.exists():
        exceptions = []
    else:
        with open(exceptions_file) as f:
            exceptions = json.load(f)
            
    # Check expiry
    now = datetime.datetime.now(datetime.timezone.utc)
    valid_exceptions = {}
    for exc in exceptions:
        expiry = datetime.datetime.fromisoformat(exc['expires_at'].replace('Z', '+00:00'))
        if now > expiry:
            print(f"Exception for {exc['module_name']} has expired!")
            sys.exit(1)
        valid_exceptions[exc['module_name']] = exc
        
    failed = False
    unexcepted = []
    
    advisories = audit_data.get('advisories', {})
    for vuln_id, vuln in advisories.items():
        module_name = vuln['module_name']
        severity = vuln['severity']
        
        # Check if all paths are mobile or build
        all_ignored = True
        for finding in vuln['findings']:
            for path in finding['paths']:
                if not is_mobile_or_build_path(path):
                    all_ignored = False
                    break
        
        if all_ignored:
            continue
            
        if module_name in valid_exceptions:
            continue
            
        failed = True
        unexcepted.append(f"[{severity}] {module_name}: {vuln['title']}")
        
    if failed:
        print("Found unexcepted vulnerabilities:")
        for u in unexcepted:
            print(u)
        sys.exit(1)
        
    print("Dependency security audit passed.")

if __name__ == '__main__':
    main()
