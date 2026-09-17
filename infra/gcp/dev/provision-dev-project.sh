#!/usr/bin/env bash
# Provision a DRTS dev environment inside a fresh GCP project.
#
# This is step 3 ("Provision and cut dev over") of
# docs/03-runbooks/dev-gcp-project-billing-rotation-20260903.md. Dev has now
# rotated through five projects, every time under time pressure, so the steps
# live here instead of being retyped from console memory.
#
# What it does NOT do, on purpose:
#   - it does not deploy application code. Cloud Run services and the migration
#     job are created by .github/workflows/deploy-dev.yml from an immutable
#     publish/release ref, which is the authorized deploy path.
#   - it does not touch GitHub repository variables/secrets. They are printed at
#     the end for a human (or `gh`) to apply.
#   - it does not invent Google Maps or LLM credentials. Those are external
#     accounts; the deploy treats them as optional and degrades cleanly.
#
# Requires: an identity with project-admin rights on $PROJECT_ID (roles/owner or
# an equivalent set), plus billing already attached to the project.
#
# Idempotent: every step checks for the resource before creating it, so a failed
# run can be repeated.

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-drts-dev-devcc-20260825}"
REGION="${REGION:-us-central1}"
GITHUB_REPO="${GITHUB_REPO:-ajoe734/drts-fleet-platform}"

SQL_INSTANCE="${SQL_INSTANCE:-drts-dev-db}"
SQL_TIER="${SQL_TIER:-db-custom-1-3840}"
SQL_VERSION="${SQL_VERSION:-POSTGRES_15}"
SQL_DISK_GB="${SQL_DISK_GB:-10}"
DB_NAME="${DB_NAME:-drts_fleet_platform}"
DB_USER="${DB_USER:-drts_dev}"

SECRET_PREFIX="${SECRET_PREFIX:-drts-dev}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-drts}"
RUNTIME_SA_ID="${RUNTIME_SA_ID:-drts-dev-runtime}"
DEPLOYER_SA_ID="${DEPLOYER_SA_ID:-github-actions-deployer}"
WIF_POOL="${WIF_POOL:-github-actions}"
WIF_PROVIDER="${WIF_PROVIDER:-github}"

RUNTIME_SA="${RUNTIME_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
DEPLOYER_SA="${DEPLOYER_SA_ID}@${PROJECT_ID}.iam.gserviceaccount.com"

say() { printf '\n=== %s\n' "$*"; }
gc() { gcloud --project "$PROJECT_ID" "$@"; }

# ---------------------------------------------------------------- preflight
say "Preflight"
gcloud projects describe "$PROJECT_ID" --format='value(projectId,lifecycleState)'
billing_enabled="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)')"
if [[ "$billing_enabled" != "True" ]]; then
  echo "FATAL: billing is not enabled on ${PROJECT_ID}." >&2
  echo "A dev project without billing is what killed the previous two rotations." >&2
  exit 1
fi
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"

# ---------------------------------------------------------------- APIs
say "Enabling APIs"
gc services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  cloudresourcemanager.googleapis.com \
  serviceusage.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com

# ---------------------------------------------------------------- registry
say "Artifact Registry ${ARTIFACT_REPOSITORY} (${REGION})"
if ! gc artifacts repositories describe "$ARTIFACT_REPOSITORY" --location "$REGION" >/dev/null 2>&1; then
  gc artifacts repositories create "$ARTIFACT_REPOSITORY" \
    --repository-format=docker \
    --location "$REGION" \
    --description="DRTS container images"
else
  echo "already exists"
fi

# ---------------------------------------------------------------- identities
say "Service accounts"
if ! gc iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1; then
  gc iam service-accounts create "$RUNTIME_SA_ID" --display-name="DRTS dev Cloud Run runtime"
fi
if ! gc iam service-accounts describe "$DEPLOYER_SA" >/dev/null 2>&1; then
  gc iam service-accounts create "$DEPLOYER_SA_ID" --display-name="GitHub Actions deployer (dev)"
fi

say "Project IAM"
# Runtime identity: read its own secrets, reach Cloud SQL, write telemetry.
for role in \
  roles/cloudsql.client \
  roles/logging.logWriter \
  roles/monitoring.metricWriter \
  roles/secretmanager.secretAccessor
do
  gc projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${RUNTIME_SA}" --role="$role" \
    --condition=None --quiet >/dev/null
done

# Deployer identity: push images, deploy services/jobs, read the secrets the
# deploy job itself reads (map keys), and describe what it just deployed.
for role in \
  roles/run.admin \
  roles/artifactregistry.writer \
  roles/cloudsql.viewer \
  roles/secretmanager.viewer \
  roles/secretmanager.secretAccessor \
  roles/serviceusage.serviceUsageConsumer
do
  gc projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${DEPLOYER_SA}" --role="$role" \
    --condition=None --quiet >/dev/null
done

# Deploying a service that runs as the runtime identity is an act-as.
gc iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/iam.serviceAccountUser" --quiet >/dev/null

# ---------------------------------------------------------------- WIF
say "Workload Identity Federation for ${GITHUB_REPO}"
if ! gc iam workload-identity-pools describe "$WIF_POOL" --location=global >/dev/null 2>&1; then
  gc iam workload-identity-pools create "$WIF_POOL" \
    --location=global --display-name="GitHub Actions"
fi
if ! gc iam workload-identity-pools providers describe "$WIF_PROVIDER" \
     --location=global --workload-identity-pool="$WIF_POOL" >/dev/null 2>&1; then
  # The attribute condition is the security boundary: without it, any GitHub
  # repository in the world can mint tokens for this pool.
  gc iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
    --location=global \
    --workload-identity-pool="$WIF_POOL" \
    --display-name="GitHub OIDC" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${GITHUB_REPO}'"
fi

gc iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}" \
  --quiet >/dev/null

# ---------------------------------------------------------------- Cloud SQL
say "Cloud SQL ${SQL_INSTANCE} (${SQL_VERSION}, ${SQL_TIER})"
if ! gc sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  # Deletion protection stays off: dev is rotated deliberately and often, and a
  # protected instance in a dead project is harder to clean up, not safer.
  gc sql instances create "$SQL_INSTANCE" \
    --database-version="$SQL_VERSION" \
    --tier="$SQL_TIER" \
    --region="$REGION" \
    --storage-size="$SQL_DISK_GB" \
    --storage-auto-increase \
    --availability-type=zonal \
    --no-deletion-protection
else
  echo "already exists"
fi

if ! gc sql databases describe "$DB_NAME" --instance="$SQL_INSTANCE" >/dev/null 2>&1; then
  gc sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
fi

CONNECTION_NAME="$(gc sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"

# ---------------------------------------------------------------- secrets
say "Secret Manager"
# Values are generated here and never printed. Rotating any of them later is a
# `gcloud secrets versions add` plus a redeploy.
put_secret() { # put_secret <name>  (value on stdin)
  local name="$1"
  if ! gc secrets describe "$name" >/dev/null 2>&1; then
    gc secrets create "$name" --replication-policy=automatic --data-file=- >/dev/null
    echo "created  ${name}"
  else
    gc secrets versions add "$name" --data-file=- >/dev/null
    echo "rotated  ${name}"
  fi
}

random_token() { openssl rand -base64 48 | tr -d '\n'; }

DB_PASSWORD="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)"
if gc sql users list --instance="$SQL_INSTANCE" --format='value(name)' | grep -qx "$DB_USER"; then
  gc sql users set-password "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD"
else
  gc sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASSWORD"
fi

# Unix-socket form: Cloud Run mounts the instance at /cloudsql/<connection>.
# operations/database/db-common.sh parses the password out of this URL and hands
# the whole URL to psql, so the ?host= form works for both the API and migrations.
printf 'postgresql://%s:%s@/%s?host=/cloudsql/%s' \
  "$DB_USER" "$DB_PASSWORD" "$DB_NAME" "$CONNECTION_NAME" \
  | put_secret "${SECRET_PREFIX}-db-url"
unset DB_PASSWORD

for name in \
  "${SECRET_PREFIX}-api-key-salt" \
  "${SECRET_PREFIX}-jwt-secret" \
  "${SECRET_PREFIX}-controlled-download-signing-secret" \
  "${SECRET_PREFIX}-referral-embed-handoff-key" \
  "${SECRET_PREFIX}-referral-embed-partner-ingress-key"
do
  if gc secrets describe "$name" >/dev/null 2>&1; then
    echo "kept     ${name} (already present; not rotating)"
    continue
  fi
  random_token | put_secret "$name"
done

cat <<'NOTE'

Not provisioned, by design:
  drts-dev-google-maps-geocoding-api-key
  drts-dev-google-maps-routes-api-key
  drts-dev-google-maps-browser-key
      External Google Maps Platform keys. The deploy requires all three or none;
      with none, dev runs the map provider in its degraded mode.
  drts-dev-llm-gateway-api-key
      Optional. Absent means the platform-admin assistant uses its mock model.
  drts-dev-workload-identity-jwt-public-key
  drts-dev-workload-identity-service-principals
      Deliberately absent in dev. The workflow says why: inventing a public key
      whose private half nobody holds reads as configured security while
      authorising a subject nobody can be.
NOTE

# ---------------------------------------------------------------- handoff
say "GitHub repository configuration to apply"
cat <<EOF
Variables (Settings > Secrets and variables > Actions > Variables):
  DEV_GCP_PROJECT_ID              ${PROJECT_ID}
  DEV_GCP_REGION                  ${REGION}
  DEV_GCP_CLOUDSQL_INSTANCE       ${CONNECTION_NAME}
  DEV_GCP_RUNTIME_SERVICE_ACCOUNT ${RUNTIME_SA}
  DEV_ARTIFACT_PROJECT_ID         ${PROJECT_ID}
  DEV_ARTIFACT_REGION             ${REGION}
  DEV_ARTIFACT_REPOSITORY         ${ARTIFACT_REPOSITORY}
  DEV_SECRET_PREFIX               ${SECRET_PREFIX}

Secrets (Settings > Secrets and variables > Actions > Secrets):
  DEV_WIF_PROVIDER                projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}
  DEV_WIF_SERVICE_ACCOUNT         ${DEPLOYER_SA}

Equivalent gh commands:
  gh variable set DEV_GCP_PROJECT_ID              --repo ${GITHUB_REPO} --body '${PROJECT_ID}'
  gh variable set DEV_GCP_REGION                  --repo ${GITHUB_REPO} --body '${REGION}'
  gh variable set DEV_GCP_CLOUDSQL_INSTANCE       --repo ${GITHUB_REPO} --body '${CONNECTION_NAME}'
  gh variable set DEV_GCP_RUNTIME_SERVICE_ACCOUNT --repo ${GITHUB_REPO} --body '${RUNTIME_SA}'
  gh variable set DEV_ARTIFACT_PROJECT_ID         --repo ${GITHUB_REPO} --body '${PROJECT_ID}'
  gh variable set DEV_ARTIFACT_REGION             --repo ${GITHUB_REPO} --body '${REGION}'
  gh variable set DEV_ARTIFACT_REPOSITORY         --repo ${GITHUB_REPO} --body '${ARTIFACT_REPOSITORY}'
  gh secret   set DEV_WIF_PROVIDER                --repo ${GITHUB_REPO} --body 'projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}'
  gh secret   set DEV_WIF_SERVICE_ACCOUNT         --repo ${GITHUB_REPO} --body '${DEPLOYER_SA}'

Then deploy with an immutable ref (never dev/main):
  gh workflow run deploy-dev.yml --repo ${GITHUB_REPO} -f source_ref=<publish/vYYYY.MM.DD.N or full SHA>
EOF
