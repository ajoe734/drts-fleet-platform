#!/usr/bin/env bash
# Operator preparation only. This script manages one monthly billing job.
# It never enables APIs, changes IAM/identity registries/secrets or runs a job.
set -euo pipefail
: "${PROJECT_ID:?PROJECT_ID is required}"
: "${REGION:?REGION is required}"
: "${API_ORIGIN:?API_ORIGIN is required}"
: "${SCHEDULER_SERVICE_ACCOUNT:?SCHEDULER_SERVICE_ACCOUNT is required}"
: "${BILLING_MONTHLY_SCHEDULE:?BILLING_MONTHLY_SCHEDULE (five numeric cron fields) is required}"
: "${TIME_ZONE:?TIME_ZONE (IANA) is required}"
readonly BILLING_MONTHLY_JOB="drts-billing-monthly"
export PROJECT_ID REGION API_ORIGIN SCHEDULER_SERVICE_ACCOUNT BILLING_MONTHLY_SCHEDULE TIME_ZONE
python3 - <<'PY'
import os,re
from urllib.parse import urlparse
from zoneinfo import ZoneInfo
p=os.environ['PROJECT_ID'];region=os.environ['REGION'];origin=os.environ['API_ORIGIN'];sa=os.environ['SCHEDULER_SERVICE_ACCOUNT']
if not re.fullmatch(r'[a-z][a-z0-9-]{4,61}[a-z0-9]',p):raise SystemExit('Invalid PROJECT_ID')
if not re.fullmatch(r'[a-z]+-[a-z]+[0-9]',region):raise SystemExit('Invalid REGION')
u=urlparse(origin)
if u.scheme!='https' or not u.hostname or u.username or u.password or u.path or u.query or u.fragment:raise SystemExit('API_ORIGIN must be an HTTPS origin without path/trailing slash')
if not re.fullmatch(r'[a-z][a-z0-9-]*@'+re.escape(p)+r'\.iam\.gserviceaccount\.com',sa):raise SystemExit('Invalid SCHEDULER_SERVICE_ACCOUNT')
try:ZoneInfo(os.environ['TIME_ZONE'])
except Exception:raise SystemExit('Invalid TIME_ZONE')
fields=os.environ['BILLING_MONTHLY_SCHEDULE'].split()
if len(fields)!=5:raise SystemExit('Schedule requires five fields')
for field,(low,high) in zip(fields,[(0,59),(0,23),(1,31),(1,12),(0,7)]):
 for part in field.split(','):
  bits=part.split('/')
  if len(bits)>2 or (len(bits)==2 and (not bits[1].isdigit() or not 1<=int(bits[1])<=high-low+1)):raise SystemExit('Invalid schedule step')
  span=bits[0]
  if span=='*':continue
  endpoints=span.split('-')
  if len(endpoints)>2 or not all(x.isdigit() and low<=int(x)<=high for x in endpoints) or (len(endpoints)==2 and int(endpoints[0])>int(endpoints[1])):raise SystemExit('Invalid schedule field')
PY
args=(--project "$PROJECT_ID" --location "$REGION")
if gcloud scheduler jobs describe "$BILLING_MONTHLY_JOB" "${args[@]}" >/dev/null 2>&1; then
  action=update
else
  action=create
fi
gcloud scheduler jobs "$action" http "$BILLING_MONTHLY_JOB" "${args[@]}" \
  --schedule "$BILLING_MONTHLY_SCHEDULE" --time-zone "$TIME_ZONE" \
  --uri "$API_ORIGIN/api/internal/scheduled-tasks/billing-monthly/run" \
  --http-method POST --headers Content-Type=application/json --message-body '{}' \
  --oidc-service-account-email "$SCHEDULER_SERVICE_ACCOUNT" --oidc-token-audience "$API_ORIGIN"
