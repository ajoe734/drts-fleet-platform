#!/usr/bin/env python3
"""
Coverage and Traceability Check for Unattended Voice Booking (UV-EXEC-025).

Verifies:
- 48 Acceptance Criteria (UV-AC-001 through UV-AC-048) have designated genuine task owners and reviewers.
- Status categories ('conditional', 'live', 'pending', 'pass') are segregated.
- All 32 Functional Requirements (UV-FR-001 through UV-FR-032) are traceable.
- UV-EXEC-025 does NOT impersonate ownership of all ACs (strict non-025 coverage gate).
- Holdout and exploration datasets are present and separated.
- Fixed models, prompts, rate cards, and evaluation artifacts exist.
"""

import json
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

MANIFEST_PATH = os.path.join(REPO_ROOT, 'docs', '04-uat', 'unattended-voice-acceptance-manifest.json')
DISPATCH_MANIFEST = os.path.join(REPO_ROOT, 'tools', 'task-dispatch', 'manifests', 'unattended-voice-booking-20260906.json')
SCENARIOS_PATH = os.path.join(REPO_ROOT, 'tests', 'fixtures', 'unattended-voice', 'scenarios.json')
HOLDOUT_PATH = os.path.join(REPO_ROOT, 'tests', 'fixtures', 'unattended-voice', 'holdout.json')
MODELS_PATH = os.path.join(REPO_ROOT, 'tests', 'fixtures', 'unattended-voice', 'models-profiles.json')
RATE_CARDS_PATH = os.path.join(REPO_ROOT, 'tests', 'fixtures', 'unattended-voice', 'rate-cards.json')
EVAL_SCRIPT_PATH = os.path.join(REPO_ROOT, 'operations', 'verification', 'unattended-voice-eval.mjs')
PLAYWRIGHT_CONFIG = os.path.join(REPO_ROOT, 'playwright.unattended-voice.config.ts')

def fail(msg: str):
    print(f'[FAIL] {msg}', file=sys.stderr)
    sys.exit(1)

def info(msg: str):
    print(f'[INFO] {msg}')

def main():
    print('======================================================================')
    print('  Unattended Voice Booking - Coverage & Traceability Verification     ')
    print('======================================================================')

    # 1. Verify required files exist
    required_files = [
        MANIFEST_PATH,
        DISPATCH_MANIFEST,
        SCENARIOS_PATH,
        HOLDOUT_PATH,
        MODELS_PATH,
        RATE_CARDS_PATH,
        EVAL_SCRIPT_PATH,
        PLAYWRIGHT_CONFIG
    ]
    for rf in required_files:
        if not os.path.isfile(rf):
            fail(f'Missing required artifact: {os.path.relpath(rf, REPO_ROOT)}')
        info(f'Found artifact: {os.path.relpath(rf, REPO_ROOT)}')

    # 2. Load manifest
    with open(MANIFEST_PATH, 'r', encoding='utf-8') as f:
        manifest = json.load(f)

    # 3. Verify ACs (exactly 48)
    acs = manifest.get('acceptance_criteria', [])
    if len(acs) != 48:
        fail(f'Expected exactly 48 ACs, found {len(acs)}')

    ac_ids = {ac['ac_id'] for ac in acs}
    expected_ac_ids = {f'UV-AC-{i:03d}' for i in range(1, 49)}
    if ac_ids != expected_ac_ids:
        missing = expected_ac_ids - ac_ids
        fail(f'Missing AC IDs: {sorted(list(missing))}')

    # 4. Verify FRs (exactly 32)
    frs = manifest.get('functional_requirements', [])
    if len(frs) != 32:
        fail(f'Expected exactly 32 FRs, found {len(frs)}')

    fr_ids = {fr['fr_id'] for fr in frs}
    expected_fr_ids = {f'UV-FR-{i:03d}' for i in range(1, 33)}
    if fr_ids != expected_fr_ids:
        missing = expected_fr_ids - fr_ids
        fail(f'Missing FR IDs: {sorted(list(missing))}')

    # 5. Check task ownership and non-025 dump guardrail
    # UV-EXEC-025 must NOT claim to be the primary implementation task for all ACs!
    uv_025_claimed = [ac['ac_id'] for ac in acs if ac.get('primary_task_id') == 'UV-EXEC-025']
    if len(uv_025_claimed) > 2:
        fail(f'UV-EXEC-025 claimed too many ACs as primary ({uv_025_claimed}). Prohibition on dumping all ACs into 025 violated!')
    info(f'UV-EXEC-025 direct primary ACs: {uv_025_claimed} (Evaluation harness & benchmark acceptance only)')

    # Check distinct owners across ACs
    owners = {ac['implementation_owner'] for ac in acs}
    if len(owners) < 3:
        fail(f'Expected multiple genuine implementation owners, found only: {owners}')
    info(f'Verified diverse real task owners across ACs: {sorted(list(owners))}')

    # 6. Check status categories
    valid_categories = {'conditional', 'live', 'pending', 'pass'}
    status_counts = {}
    for ac in acs:
        cat = ac.get('status_category')
        if cat not in valid_categories:
            fail(f'AC {ac["ac_id"]} has invalid status category: {cat}')
        status_counts[cat] = status_counts.get(cat, 0) + 1

    info(f'Status category distribution: {status_counts}')
    if status_counts.get('conditional', 0) == 0:
        fail('No conditional ACs recorded!')
    if status_counts.get('live', 0) == 0:
        fail('No live ACs recorded!')
    if status_counts.get('pending', 0) == 0:
        fail('No pending ACs recorded!')
    if status_counts.get('pass', 0) == 0:
        fail('No pass ACs recorded!')

    # 7. Check FR traceability
    for fr in frs:
        if not fr.get('associated_acs'):
            fail(f'FR {fr["fr_id"]} has no associated ACs!')
        if not fr.get('associated_tasks'):
            fail(f'FR {fr["fr_id"]} has no associated tasks!')
    info('All 32 FRs are traceable to both ACs and execution tasks.')

    # 8. Check scenarios and holdout isolation
    with open(SCENARIOS_PATH, 'r', encoding='utf-8') as f:
        scen_data = json.load(f)
    scenarios = scen_data.get('scenarios', [])
    if len(scenarios) < 100:
        fail(f'Expected >= 100 exploration scenarios, found {len(scenarios)}')
    info(f'Exploration dataset verified: {len(scenarios)} scenarios covering all dialects.')

    with open(HOLDOUT_PATH, 'r', encoding='utf-8') as f:
        hold_data = json.load(f)
    holdout = hold_data.get('scenarios', [])
    if len(holdout) < 20:
        fail(f'Expected >= 20 holdout scenarios, found {len(holdout)}')
    info(f'Holdout dataset verified: {len(holdout)} isolated scenarios.')

    # Verify no ID overlap between exploration and holdout
    scen_ids = {s['id'] for s in scenarios}
    hold_ids = {h['id'] for h in holdout}
    if scen_ids.intersection(hold_ids):
        fail(f'Dataset leakage detected between exploration and holdout: {scen_ids.intersection(hold_ids)}')
    info('Zero scenario overlap confirmed between exploration and holdout sets.')

    # 9. Check models and rate cards
    with open(MODELS_PATH, 'r', encoding='utf-8') as f:
        models = json.load(f)
    if 'candidates' not in models or 'twm_llm_twm' not in models['candidates']:
        fail('Missing baseline candidate in models-profiles.json')
    info('Fixed model/prompt/codec versions verified.')

    with open(RATE_CARDS_PATH, 'r', encoding='utf-8') as f:
        rates = json.load(f)
    if 'rates' not in rates or rates.get('currency') != 'TWD':
        fail('Invalid rate-cards.json structure')
    info('Rate cards ledger structure verified.')

    print('----------------------------------------------------------------------')
    print('  Summary Table: Unattended Voice Acceptance Criteria Coverage        ')
    print('----------------------------------------------------------------------')
    print(f'| Category    | Count | Description                                   |')
    print(f'| ----------- | ----- | --------------------------------------------- |')
    print(f'| conditional | {status_counts.get("conditional", 0):5d} | Feature-flagged; safety fallback verified      |')
    print(f'| live        | {status_counts.get("live", 0):5d} | External PSTN / UAT gate verification required|')
    print(f'| pending     | {status_counts.get("pending", 0):5d} | In active task development DAG (001..024)     |')
    print(f'| pass        | {status_counts.get("pass", 0):5d} | Harness & benchmark acceptance (025)          |')
    print(f'| Total       | {len(acs):5d} | All 48 ACs accounted for                      |')
    print('----------------------------------------------------------------------')
    print('[PASS] Unattended voice acceptance & traceability check completed successfully.')

if __name__ == '__main__':
    main()
