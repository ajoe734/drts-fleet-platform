"""Read-only end-to-end omission check against an actual Vitest JSON report."""
import argparse
import json
from pathlib import Path
import tempfile

from collect import ROOT, collect

parser = argparse.ArgumentParser()
parser.add_argument('--report', type=Path, required=True)
parser.add_argument('--base', required=True)
args = parser.parse_args()
report = json.loads(args.report.read_text())
removed = str(Path(report['testResults'].pop(0)['name']).relative_to(ROOT))
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'partial.json'
    path.write_text(json.dumps(report))
    result = collect(path, args.base)
assert removed in result['regression']['missing_suites']
assert result['regression']['coverage_state'] == 'local_regression_incomplete_live_missing'
affected = [i for i in result['issues'] if removed in i['regression_suites']]
assert affected and all(i['current_result'] != 'local_regression_passed_live_missing' for i in affected)
print('Omitted:', removed, '; affected issues:', [i['id'] for i in affected], '; no false pass')
