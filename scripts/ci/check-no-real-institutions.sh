#!/usr/bin/env bash
# Fail the build if a real financial-institution identifier or corporate
# domain re-enters deployable source. Demo brands must be clearly fictional.
# Task-ID: GCP-TOS-REMEDIATION-20260907
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
PATTERN='ctbcbank\.com|cathaybk\.com|taishinbank\.com|fubon-ins\.com|lion-travel\.com|ghprestige\.com|yuhe-living\.com|@dbs\.com|@fubon\.com|中國信託|中信銀行|國泰世華|台新銀行|星展銀行|富邦產險|雄獅旅遊|凱撒飯店|\bCTBC\b|Cathay United|Taishin Bank|DBS Bank|Fubon Bank|World Elite|CUBE 世界卡|太陽無限卡|DBS Insignia'
if hits=$(grep -rnP "$PATTERN" apps packages tests infra --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.json' --include='*.sql' --include='*.css' 2>/dev/null); then
  echo "::error::Real financial-institution identifiers found in deployable source:"; echo "$hits"; exit 1
fi
echo "OK: no real financial-institution identifiers in apps/ packages/ tests/ infra/"
