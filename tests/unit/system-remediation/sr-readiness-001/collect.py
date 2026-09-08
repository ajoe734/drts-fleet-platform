"""Read-only inventory; writes only the explicitly owned readiness artifact.

Run from the repository root after the regression command in SR-READINESS-001.md.
No credentials, environment values, HTTP requests or provider mutations are read.
"""
import argparse
import datetime
import fnmatch
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[4]
DOC = ROOT / 'docs/04-uat/system-remediation-20260906'
STATUS = '/home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT, text=True).strip()


def read(path):
    return json.loads(path.read_text())


def collect(report_path, base):
    manifest = read(ROOT / 'tools/task-dispatch/manifests/system-remediation-20260906.json')
    coverage = read(DOC / 'coverage.json')
    findings = read(DOC / 'source/findings.json') + read(DOC / 'source/new-gaps.json')
    caps = read(DOC / 'source/capabilities.json')
    comparison = read(DOC / 'source/source-comparison.json')
    tasks = {t['id']: t for t in manifest['tasks']}
    files = git('ls-tree', '-r', '--name-only', base).splitlines()
    log = [line.split('\t', 1) for line in git('log', base, '--format=%H%x09%s').splitlines()]
    report = read(report_path)
    suites = []
    for suite in report['testResults']:
        path = str(Path(suite['name']).relative_to(ROOT))
        suites.append({'path': path, 'status': suite['status'],
                       'tests': len(suite['assertionResults']),
                       'assertions': [{'name': a['fullName'], 'status': a['status']}
                                      for a in suite['assertionResults']]})
    task_evidence = {}
    issue_tasks = {t['id'] for t in tasks.values() if t.get('gap_ids')}
    issue_tasks.add('SR-UAT-HARNESS-001')
    for task_id in sorted(issue_tasks):
        task = tasks[task_id]
        # Squash merge subject must name the exact task, not an unblock/planning child.
        merges = [{'sha': sha, 'subject': subject, 'pr': int(re.search(r'\(#(\d+)\)$', subject)[1])}
                  for sha, subject in log
                  if re.search(r'(?<![\w-])' + re.escape(task_id) + r'(?![\w-])', subject)
                  and re.search(r'\(#(\d+)\)$', subject) and 'UNBLOCK' not in subject]
        scopes = [s for s in task['write_scopes'] if not s.startswith(('docs/', 'tests/'))]
        matched = [f for f in files if any(f == s or f.startswith(s.rstrip('/') + '/')
                                          or fnmatch.fnmatch(f, s) for s in scopes)]
        # A bounded source locator per task, with the complete scopes retained for reruns.
        task_evidence[task_id] = {
            'source_scopes': scopes,
            'source_locators': [{'path': f, 'git_blob': git('rev-parse', f'{base}:{f}')} for f in matched[:4]],
            'merged_prs': merges[:3],
            'regression_suites': [s['path'] for s in suites if f'/{task_id.lower()}/' in s['path']],
            'evidence_ref': task['task_spec_ref'],
        }
    issues = []
    for source in findings:
        issue_id = source.get('編號', source.get('ID'))
        linked = sorted(t['id'] for t in tasks.values() if issue_id in t.get('gap_ids', []))
        locators = []
        for row in comparison:
            if issue_id in row['finding'].split('/'):
                path = row['file']
                locators.append({'path': path, 'git_blob': git('rev-parse', f'{base}:{path}')})
        regressions = sorted({s for t in linked for s in task_evidence[t]['regression_suites']})
        issues.append({
            'id': issue_id, 'title': source.get('不足', source.get('問題')),
            'role': source.get('角色', source.get('受影響角色')),
            'base_sha': base, 'task_ids': linked, 'current_source_locators': locators,
            'historical_observation': source.get('重現步驟與實際結果', source.get('證據與限制')),
            'reproduction_requirement': source.get('建議修正及驗收', source.get('驗收條件')),
            'current_result': 'local_regression_passed_live_missing' if regressions else 'current_version_indexed_reproduction_missing',
            'regression_suites': regressions,
            'live_status': 'missing',
            'missing': '目前部署 SHA、合法角色與同資源跨端讀回；本機測試不代表完整 issue 已驗收。',
        })

    profiles = {
        '入口與身份': ['tenant_id × 2', '合法 actor/realm/role/scopes', '有效、停權、到期 session', '跨租戶拒絕資源'],
        '預約與乘客': ['tenant_id × 2', 'passenger_id', 'booking_id/order_id', 'UTC 時窗邊界', '有效/取消/逾時訂單'],
        '調度與營運': ['order_id', 'dispatch_job_id/attempt_id/assignment_id', 'driver_id/vehicle_id', 'call_id/case_no', '競態 revision'],
        '司機': ['driver_id × 2', 'vehicle_id', 'assignment_id/trip_id', '合法裝置/session', '離線/到期/完成狀態'],
        '車行與供給': ['partner_id × 2', 'driver_id/vehicle_id', '有效/到期文件', 'revision', 'statement_id/case_no'],
        '帳務與金流': ['tenant_id/partner_id × 2', 'invoice_id/statement_id', '來源 order_id', '金額/期間', '成功/拒絕/重試 receipt'],
        '報表與法遵': ['package_id', '來源 order_id/trip_id', '期間/版本', '受控 artifact ID', '可見與禁止下載角色'],
        '平臺治理': ['合法 actor/realm/role/scopes', 'tenant_id/partner_id', '治理資源 ID/revision', '稽核事件 ID'],
        '整合與自動化': ['tenant_id/partner_id', '受控 provider account reference', 'correlation/event ID', '成功/失敗/重送 receipt'],
        '品質與營運保障': ['candidate/deployment SHA', '隔離 target ID', '同 order_id 跨角色證據', 'job/backup/restore run ID'],
        '範圍邊界': ['來源範圍裁決與排除依據；不建立驗收資料或開通資源'],
    }
    capabilities = []
    for cap in caps:
        cid = cap['ID']
        excluded = cid in manifest['excluded_capability_ids']
        capabilities.append({
            'id': cid, 'domain': cap['領域'], 'role': cap['角色'], 'capability': cap['能力／應完成工作'],
            'state_at_audit': cap['狀態'], 'status': 'excluded' if excluded else 'missing',
            'role_mapping_status': 'not_applicable' if excluded else 'legitimate_account_and_iam_mapping_missing',
            'data_requirements': profiles[cap['領域']],
            'scenario_requirement': cap['缺口／下一個驗收條件'],
            'resource_ids': [],
            'provisioning_owner': 'SR-UAT-HARNESS-001 + 各 verification task owner；正式身份由 IAM 管理員提供',
            'readback': '依本列 scenario，由合法角色經權威 API 讀回相同 canonical ID；核對另一角色/另一租戶的允許與拒絕結果。',
            **{k: coverage[cid][k] for k in ('implementation_tasks', 'verification_tasks', 'source_refs')},
        })
    gate_profiles = {
        'ENTRY': ('環境管理員 + IAM 管理員', '授權環境變更、公開 DNS/TLS、IAP/SSO/MFA 角色帳號、部署 SHA', '唯讀讀回 DNS/TLS 與部署 revision；授權帳號從正式入口登入並核對 realm/角色與 candidate SHA。'),
        'MAIL': ('郵件服務管理員 + 授權信箱持有人', '測試信箱授權、provider 設定 reference、message ID 與送達回執', 'provider console/API 讀回 message ID、狀態與 recipient receipt；對齊 outbox/invitation/approval ID。'),
        'PUSH': ('行動端負責人 + push provider 管理員', '授權真裝置、provider account reference、裝置送達證據', 'provider message ID 對齊 order/event ID；真裝置讀回收訊時間與前景/背景狀態。'),
        'DOC': ('儲存管理員 + 銀行簽章管理員', 'storage/signer 授權 reference、受控 bytes、正式公鑰與簽章', '合法角色下载同 artifact ID；獨立工具核對 bytes SHA-256/公鑰簽章，跨角色拒絕及到期失效。'),
        'FINANCE': ('財務/issuer/ERP sandbox 管理員', '隔離 financial sandbox、issuer eligibility receipts、付款恢復與對帳資料', '以 sandbox transaction/eligibility ID 查 provider receipt，再查平台 ledger/statement 同 ID 與金額。'),
        'MAP': ('地圖 provider 管理員 + 授權定位測試人員', '受限 map credential reference、定位測試授權、route/ETA provider evidence', 'provider project 配額/限制 metadata 與 route request ID；對齊座標時間、路線與 ETA。'),
        'DRIVER': ('行動端負責人 + Android/iOS 測試裝置持有人', '兩平台授權真機、native build SHA、背景/離線/SOS 證據', '讀回 build ID、device reference、assignment/trip/event ID 與重連後 API 狀態。'),
        'FORWARD': ('第三方轉單 sandbox 管理員', 'sandbox 授權、雙向 signed receipts、取消與失去搶單對帳資料', '以外部 order/receipt ID 讀回第三方 authoritative state；核對平台狀態與簽章。'),
        'OPS': ('SRE + DBA', '隔離 target 授權、backup/restore metadata、RPO/RTO 基準、排程重啟證據', '唯讀查 project/target、backup ID/時間、restore run ID、row/checksum、job execution ID；實際還原另由 gate 授權執行。'),
    }
    gates = []
    snapshots = []
    for task_id in [t for t in tasks if t.startswith('SR-LIVE-')] + ['UV-EXEC-027', 'SR-PUBLIC-001', 'SR-DRIVER-WEB-001']:
        result = subprocess.run([STATUS, 'show', task_id], capture_output=True, text=True, cwd=ROOT)
        if result.returncode:
            raise RuntimeError(f'{task_id}: status read failed: {result.returncode}')
        status = json.loads(result.stdout)
        snapshots.append({k: status.get(k) for k in ('id', 'owner', 'reviewer', 'status', 'last_update', 'next', 'required_acceptance')})
        if not task_id.startswith('SR-LIVE-'):
            continue
        owner, missing, readback = gate_profiles[task_id.split('-')[2]]
        gates.append({'task_id': task_id, 'task_owner': status['owner'], 'provider_owner': owner,
                      'status': 'missing', 'missing': missing, 'readback': readback,
                      'requirements': [{'key': k, 'status': 'missing', 'resource_id': None, 'evidence_ref': None}
                                       for k in status['required_acceptance']],
                      'source_ref': tasks[task_id]['task_spec_ref']})
    return {
        'schema_version': 1, 'task_id': 'SR-READINESS-001',
        'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'base_sha': base, 'tested_code_sha': base,
        'candidate_sha': None,
        'candidate_binding': 'Exact final candidate SHA is recorded by canonical ai-status.sh handoff; resolve with show SR-READINESS-001. A commit cannot embed its own hash.',
        'historical_audit_sha': '08b7a32f6fdaa00d8d1894f91569a7d72860cec2',
        'boundary': '唯讀準備報告。未登入 live、未寄信、未送 push、未買資源、未讀秘密、未執行真機/付款/還原。missing 表示未取得證據，非資源不存在。',
        'authority_refs': ['phase1_service_contracts_v1.md#2.1', 'phase1_service_contracts_v1.md#2.5',
                           'packages/contracts/src/iam-policy-catalog.ts', 'tests/e2e/system-remediation/shared/role-personas.ts'],
        'sources': {f: hashlib.sha256((DOC / f).read_bytes()).hexdigest() for f in
                    ['source/findings.json', 'source/new-gaps.json', 'source/capabilities.json', 'coverage.json']},
        'regression': {'command': 'pnpm exec vitest run ' + ' '.join(sorted({str(Path(s['path']).parent) + '/' for s in suites})) + ' --reporter=json --outputFile=/tmp/sr-readiness-regressions.json',
                       'exit_code': 0 if report['success'] else 1, 'passed': report['numPassedTests'],
                       'failed': report['numFailedTests'], 'skipped': report['numPendingTests'],
                       'raw_report_sha256': hashlib.sha256(report_path.read_bytes()).hexdigest(), 'suites': suites},
        'task_evidence': task_evidence, 'issues': issues, 'capabilities': capabilities, 'live_gates': gates,
        'task_status_snapshots': snapshots,
        'voice_reuse': {'task_id': 'UV-EXEC-027', 'evidence_ref': 'docs/04-uat/unattended-voice-external-readiness.md',
                        'merged_sha': '2093cf7e3852', 'status': 'missing',
                        'interpretation': 'task show reports done; merged report still lists seven missing external acceptance items. Reuse report only; do not infer account availability or release UV live gates.',
                        'resource_ids': []},
        'entry_policy': {'merge_sha': '70355aba97c23dd1cd592b71f1d3dfe6315d91ff', 'pr': 1710,
                         'source_ref': '.github/workflows/deploy-dev.yml',
                         'status': 'live_deployment_readback_missing',
                         'interpretation': 'Current source closes public exposure defaults. Historical TLS failure is not evidence of a new code defect or authorization to reopen exposure.'},
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=Path, required=True)
    parser.add_argument('--base', required=True)
    args = parser.parse_args()
    result = collect(args.report, args.base)
    (DOC / 'readiness.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f"44 issue / 134 capability inventory written; {result['regression']['passed']} local tests; all live gates missing")
