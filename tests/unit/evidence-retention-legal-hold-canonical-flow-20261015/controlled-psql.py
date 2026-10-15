#!/usr/bin/env python3
"""Socket-free psql boundary double; NOT PostgreSQL permission/transaction proof.

Candidate SELECT is executed, not reimplemented: SQLite evaluates production SQL
against columns extracted from V0009. Only PG casts/interval clock are translated.
COPY/transaction and error exits are controlled protocol inputs to the real shell.
"""
import datetime as dt
import json
import os
from pathlib import Path
import re
import sqlite3
import sys

root = Path(os.environ['RETENTION_FIXTURE'])
state_path = root / 'state.json'
state = json.loads(state_path.read_text())
args = sys.argv[1:]
sql = args[args.index('-tAc') + 1] if '-tAc' in args else sys.stdin.read()
with (root / 'calls.jsonl').open('a') as log:
    log.write(json.dumps({'args': args[1:], 'sql': sql}) + '\n')
stop_on_error = 'ON_ERROR_STOP=1' in args
mode = os.environ.get('RETENTION_FAILURE', '')
now = dt.datetime(2026, 10, 15, 12, 0, 0, tzinfo=dt.timezone.utc)
def iso(value):
    return value.isoformat(timespec='milliseconds').replace('+00:00', 'Z')
def save():
    state_path.write_text(json.dumps(state))
def fail(message):
    print('ERROR: controlled ' + message, file=sys.stderr)
    sys.exit(3 if stop_on_error else 0)
def aged(rows, days, at=now):
    return [row for row in rows if row['created_at'] < iso(at - dt.timedelta(days=days))]
if mode == 'sql' and 'DELETE FROM admin.audit_logs' in sql:
    fail('permission / trigger / transaction rejection')
match = re.search(r'CREATE TEMP TABLE audit_retention_candidates ON COMMIT DROP AS\s*(.*?);', sql, re.S)
if match:
    # Evaluate the actual producer SELECT; no duplicate hold/exception selector.
    schema = Path(os.environ['RETENTION_SCHEMA']).read_text()
    body = re.search(r'CREATE TABLE IF NOT EXISTS admin.audit_logs \((.*?)\n\);', schema, re.S)[1]
    columns = re.findall(r'^\s+(\w+)\s+', body, re.M)
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.execute("ATTACH DATABASE ':memory:' AS admin")
    db.execute('CREATE TABLE admin.audit_logs (' + ','.join('"' + name + '" TEXT' for name in columns) + ')')
    for row in state['rows']:
        values = [json.dumps(row.get(col)) if isinstance(row.get(col), dict) else row.get(col) for col in columns]
        db.execute('INSERT INTO admin.audit_logs VALUES (' + ','.join('?' for _ in columns) + ')', values)
    days = int(re.search(r'-v retention_days=(\d+)', ' '.join(args))[1])
    query = match[1].replace('::text', '').replace('::timestamptz', '')
    query = query.replace("(CURRENT_TIMESTAMP - (:'retention_days'::integer * INTERVAL '1 day'))", "'" + iso(now - dt.timedelta(days=days)) + "'")
    query = query.replace('CURRENT_TIMESTAMP', "'" + iso(now) + "'")
    selected_ids = [row['audit_id'] for row in db.execute(query)]
    selected = [row for row in state['rows'] if row['audit_id'] in selected_ids]
    state['selected'] = selected_ids
    # Simulate rows first visible after the fixed candidate selection. They must
    # remain even when already old (a real table lock serializes such inserts).
    state['rows'].extend(state.pop('concurrent', []))
    save()
    if '\\copy' not in sql:
        print(len(selected))
        sys.exit(0)
    filename = re.search(r"\\copy .*? TO '([^']+)'", sql)[1]
    if mode == 'write':
        fail('archive-output write failed')
    Path(filename).write_text(''.join(json.dumps(row) + '\n' for row in selected))
    if mode == 'verify':
        # Simulate a client output corruption; actual verification must abort.
        Path(filename).write_text('{}\n')
        fail('archive verification mismatch')
    # The test checks that real generated SQL verifies the COPY-back multiset
    # before the identity DELETE, and that deletion uses the selected table.
    if "FROM audit_retention_verified" not in sql or 'EXCEPT ALL' not in sql:
        fail('missing full-row verification')
    if not re.search(r'DELETE FROM admin.audit_logs\s+\w+\s+USING audit_retention_candidates\s+\w+\s+WHERE \w+\.audit_id = \w+\.audit_id', sql):
        fail('missing exact identity purge')
    if sql.index('EXCEPT ALL') > sql.index('DELETE FROM admin.audit_logs'):
        fail('verification after deletion')
    state['rows'] = [row for row in state['rows'] if row['audit_id'] not in selected_ids]
    save()
    print(len(selected))
    sys.exit(0)
# Original entry point before repair: ordinary age-only independent commands.
days = int(re.search(r"interval '(\d+) days'", sql)[1])
if 'SELECT count(*)' in sql:
    print(len(aged(state['rows'], days)))
elif 'json_build_object' in sql:
    selected = aged(state['rows'], days)
    if mode == 'write':
        fail('archive-output write failed')
    for row in selected:
        print(json.dumps(row))
    state['selected'] = [row['audit_id'] for row in selected]
    state['rows'].extend(state.pop('concurrent', []))
    save()
elif 'DELETE FROM' in sql:
    purged = aged(state['rows'], days, now + dt.timedelta(seconds=2))
    state['rows'] = [row for row in state['rows'] if row not in purged]
    save()
