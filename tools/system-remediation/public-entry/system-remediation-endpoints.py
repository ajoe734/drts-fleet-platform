#!/usr/bin/env python3
"""
tools/system-remediation/public-entry/system-remediation-endpoints.py

SR-PUBLIC-001: 公開入口／callback／版本清單診斷與分層評估工具
- 診斷 9 個正式公開入口之 DNS、TLS、HTTP 與 Cloud Run 降級 URL
- 核驗已退休／暫停網域（book, ride, concierge）未混入現行 active inventory
- 分層檢驗根因：DNS A 紀錄（8.233.119.14 逾時／重設）vs CNAME（ghs.googlehosted.com.）
- 檢驗 Cloud Run 現行部署 URL（lyo6ra57fq）vs 陳舊文件 URL（4t7rg6fmeq）
- 提供離線 mock 模式以供 CI 與單元測試無網路環境驗證
"""

import argparse
import json
import socket
import ssl
import subprocess
import sys
from typing import Any, Dict, List, Optional


ACTIVE_PUBLIC_ENTRIES = [
    {
        "id": "entry-fleets",
        "subdomain": "fleets.smarttransport.tw",
        "cloud_run_service": "drts-dev-platform-admin-web",
        "role": "平台管理員 / 車隊管理",
        "category": "admin",
        "path": "/",
        "expected_direct_status": [200, 307],
        "expected_ghs_status": [200, 307, 404],
        "auth_required": True,
    },
    {
        "id": "entry-ops",
        "subdomain": "ops.smarttransport.tw",
        "cloud_run_service": "drts-dev-ops-console-web",
        "role": "營運中心 / 調度員",
        "category": "operations",
        "path": "/",
        "expected_direct_status": [200, 307],
        "expected_ghs_status": [200, 307, 404],
        "auth_required": True,
    },
    {
        "id": "entry-partners",
        "subdomain": "partners.smarttransport.tw",
        "cloud_run_service": "drts-dev-fleet-partner-portal-web",
        "role": "車行夥伴",
        "category": "partner",
        "path": "/",
        "expected_direct_status": [200, 307],
        "expected_ghs_status": [200, 307, 404],
        "auth_required": True,
    },
    {
        "id": "entry-dispatch",
        "subdomain": "dispatch.smarttransport.tw",
        "cloud_run_service": "drts-dev-enterprise-dispatch-web",
        "role": "企業派車 / 企業員工",
        "category": "enterprise",
        "path": "/",
        "expected_direct_status": [200, 307],
        "expected_ghs_status": [200, 307, 404],
        "auth_required": False,
    },
    {
        "id": "entry-bank",
        "subdomain": "bank.smarttransport.tw",
        "cloud_run_service": "drts-dev-bank-console-web",
        "role": "銀行後臺 / 方案審查",
        "category": "bank",
        "path": "/",
        "expected_direct_status": [200, 307],
        "expected_ghs_status": [200, 307, 404],
        "auth_required": False,
    },
    {
        "id": "entry-channel",
        "subdomain": "channel.smarttransport.tw",
        "cloud_run_service": "drts-channel-partner-portal-web",
        "role": "渠道夥伴",
        "category": "channel",
        "path": "/",
        "expected_direct_status": [200, 307],
        "expected_ghs_status": [200, 307, 404],
        "auth_required": True,
    },
    {
        "id": "entry-tenant",
        "subdomain": "tenant.smarttransport.tw",
        "cloud_run_service": "drts-dev-tenant-console-web",
        "role": "企業租戶管理員",
        "category": "tenant",
        "path": "/",
        "expected_direct_status": [200, 307],
        "expected_ghs_status": [200, 307, 404],
        "auth_required": True,
    },
    {
        "id": "entry-refer",
        "subdomain": "refer.smarttransport.tw",
        "cloud_run_service": "drts-dev-referral-embed-web",
        "role": "推薦嵌入乘客（御和物業）",
        "category": "passenger",
        "path": "/embed/yuhe-residence",
        "expected_direct_status": [200],
        "expected_ghs_status": [200, 404],
        "auth_required": False,
    },
    {
        "id": "entry-api",
        "subdomain": "api.smarttransport.tw",
        "cloud_run_service": "drts-dev-api",
        "role": "系統後端 API / BFF / Health",
        "category": "api",
        "path": "/api/health",
        "expected_direct_status": [200],
        "expected_ghs_status": [200, 404],
        "auth_required": False,
    },
]

EXCLUDED_ENTRIES = [
    {
        "id": "entry-book",
        "subdomain": "book.smarttransport.tw",
        "cloud_run_service": "drts-dev-partner-booking-web",
        "status": "paused",
        "policy": "Excluded from active surface since 2026-08-01",
        "expected_dns": "NXDOMAIN",
    },
    {
        "id": "entry-ride",
        "subdomain": "ride.smarttransport.tw",
        "cloud_run_service": "passenger-web",
        "status": "retired",
        "policy": "Retired since 2026-06-16",
        "expected_dns": "NXDOMAIN",
    },
    {
        "id": "entry-concierge",
        "subdomain": "concierge.smarttransport.tw",
        "cloud_run_service": "concierge-portal-web",
        "status": "retired",
        "policy": "Retired since 2026-06-16",
        "expected_dns": "NXDOMAIN",
    },
]

KNOWN_CLOUD_RUN_SUFFIXES = {
    "active": "lyo6ra57fq-uc.a.run.app",
    "stale_documentation": "4t7rg6fmeq-uc.a.run.app",
    "legacy_suspended": "waji3fer3a-uc.a.run.app",
}

STALE_DNS_A_RECORD = "8.233.119.14"
CANONICAL_CNAME_TARGET = "ghs.googlehosted.com"


def query_dns_records(domain: str, mock: bool = False) -> Dict[str, Any]:
    """Query A and CNAME records for a domain."""
    if mock:
        if domain in [e["subdomain"] for e in EXCLUDED_ENTRIES]:
            return {"domain": domain, "resolved": False, "status": "NXDOMAIN", "a_records": [], "cname": None}
        return {
            "domain": domain,
            "resolved": True,
            "status": "RESOLVED_STALE_A",
            "a_records": [STALE_DNS_A_RECORD],
            "cname": None,
            "canonical_cname_target": CANONICAL_CNAME_TARGET,
            "has_stale_a": True,
        }

    res: Dict[str, Any] = {
        "domain": domain,
        "resolved": False,
        "status": "UNKNOWN",
        "a_records": [],
        "cname": None,
        "canonical_cname_target": CANONICAL_CNAME_TARGET,
        "has_stale_a": False,
    }
    try:
        ips = socket.getaddrinfo(domain, 443)
        a_records = sorted(list(set(addr[4][0] for addr in ips)))
        res["resolved"] = True
        res["a_records"] = a_records
        res["has_stale_a"] = STALE_DNS_A_RECORD in a_records
        res["status"] = "RESOLVED_STALE_A" if res["has_stale_a"] else "RESOLVED_OK"
    except socket.gaierror as e:
        if e.errno in (-2, -3):
            res["status"] = "NXDOMAIN"
        else:
            res["status"] = f"GAI_ERROR_{e.errno}"

    # Query CNAME via host command if available
    try:
        proc = subprocess.run(["host", "-t", "CNAME", domain], capture_output=True, text=True, timeout=3)
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                if "an alias for" in line or "is an alias for" in line:
                    res["cname"] = line.split()[-1].rstrip(".")
    except Exception:
        pass

    return res


def check_tls_connection(domain: str, resolve_ip: Optional[str] = None, mock: bool = False) -> Dict[str, Any]:
    """Inspect TLS handshake and server certificate."""
    if mock:
        if resolve_ip:
            return {
                "success": True,
                "sni_domain": domain,
                "resolved_ip": resolve_ip,
                "tls_version": "TLSv1.3",
                "issuer": "C=US; O=Google Trust Services; CN=WR3",
                "subject": f"CN={domain}",
                "valid_until": "2026-10-30T02:52:18Z",
                "error": None,
            }
        else:
            return {
                "success": False,
                "sni_domain": domain,
                "resolved_ip": STALE_DNS_A_RECORD,
                "tls_version": None,
                "issuer": None,
                "subject": None,
                "valid_until": None,
                "error": "SSL_ERROR_SYSCALL in connection (exit 35)",
            }

    target_host = resolve_ip if resolve_ip else domain
    res: Dict[str, Any] = {
        "success": False,
        "sni_domain": domain,
        "resolved_ip": target_host,
        "tls_version": None,
        "issuer": None,
        "subject": None,
        "valid_until": None,
        "error": None,
    }

    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((target_host, 443), timeout=4) as sock:
            with ctx.wrap_socket(sock, server_hostname=domain) as ssock:
                res["success"] = True
                res["tls_version"] = ssock.version()
                cert = ssock.getpeercert()
                if cert:
                    res["subject"] = str(cert.get("subject", []))
                    res["issuer"] = str(cert.get("issuer", []))
                    res["valid_until"] = cert.get("notAfter")
    except Exception as e:
        res["error"] = str(e)

    return res


def check_http_response(
    domain: str,
    path: str = "/",
    resolve_ip: Optional[str] = None,
    timeout_sec: int = 5,
    mock: bool = False,
) -> Dict[str, Any]:
    """Test HTTP endpoint status code and headers."""
    if mock:
        if resolve_ip:
            # When routed through Google front-end directly without mapping setup, returns 404
            return {"http_code": 404, "exit_code": 0, "final_url": f"https://{domain}{path}", "error": None}
        else:
            # Direct hit to 8.233.119.14 yields curl exit 35
            return {"http_code": 0, "exit_code": 35, "final_url": f"https://{domain}{path}", "error": "curl exit 35 (SSL error)"}

    cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", str(timeout_sec)]
    if resolve_ip:
        cmd.extend(["--resolve", f"{domain}:443:{resolve_ip}"])
    cmd.append(f"https://{domain}{path}")

    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_sec + 2)
        code_str = p.stdout.strip()
        http_code = int(code_str) if code_str.isdigit() else 0
        return {
            "http_code": http_code,
            "exit_code": p.returncode,
            "final_url": f"https://{domain}{path}",
            "error": p.stderr.strip() if p.returncode != 0 else None,
        }
    except Exception as e:
        return {
            "http_code": 0,
            "exit_code": -1,
            "final_url": f"https://{domain}{path}",
            "error": str(e),
        }


def check_cloud_run_fallback(service: str, path: str = "/", timeout_sec: int = 5, mock: bool = False) -> Dict[str, Any]:
    """Probe current active and stale Cloud Run URLs for service."""
    active_suffix = KNOWN_CLOUD_RUN_SUFFIXES["active"]
    stale_suffix = KNOWN_CLOUD_RUN_SUFFIXES["stale_documentation"]

    active_url = f"https://{service}-{active_suffix}{path}"
    stale_url = f"https://{service}-{stale_suffix}{path}"

    if mock:
        # Based on actual probes: api, refer, dispatch, bank return 200; ops, partners, channel, tenant return 307
        expected_code = 200 if service in ["drts-dev-api", "drts-dev-referral-embed-web", "drts-dev-enterprise-dispatch-web", "drts-dev-bank-console-web", "drts-dev-platform-admin-web"] else 307
        return {
            "active_url": active_url,
            "active_status": expected_code,
            "active_healthy": True,
            "stale_url": stale_url,
            "stale_status": 404,
            "stale_healthy": False,
        }

    def _probe(url: str) -> int:
        try:
            p = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", url, "--max-time", str(timeout_sec)], capture_output=True, text=True, timeout=timeout_sec + 2)
            s = p.stdout.strip()
            return int(s) if s.isdigit() else 0
        except Exception:
            return 0

    code_active = _probe(active_url)
    code_stale = _probe(stale_url)

    return {
        "active_url": active_url,
        "active_status": code_active,
        "active_healthy": code_active in [200, 307],
        "stale_url": stale_url,
        "stale_status": code_stale,
        "stale_healthy": code_stale in [200, 307],
    }


def diagnose_public_entries(mock: bool = False, resolve_google_ip: str = "108.177.97.121") -> Dict[str, Any]:
    """Perform full 4-layer diagnostic on all 9 public entries and retired domains."""
    results: List[Dict[str, Any]] = []

    for entry in ACTIVE_PUBLIC_ENTRIES:
        sub = entry["subdomain"]
        svc = entry["cloud_run_service"]
        path = entry["path"]

        dns_info = query_dns_records(sub, mock=mock)
        tls_direct = check_tls_connection(sub, mock=mock)
        tls_via_ghs = check_tls_connection(sub, resolve_ip=resolve_google_ip, mock=mock)

        http_direct = check_http_response(sub, path=path, mock=mock)
        http_via_ghs = check_http_response(sub, path=path, resolve_ip=resolve_google_ip, mock=mock)

        cr_info = check_cloud_run_fallback(svc, path=path, mock=mock)

        # Diagnose layer root cause
        layer_root_causes = []
        if dns_info.get("has_stale_a"):
            layer_root_causes.append(f"DNS_LAYER: GoDaddy authoritative A record points to stale IP {STALE_DNS_A_RECORD} instead of CNAME {CANONICAL_CNAME_TARGET}")
        if not tls_direct["success"]:
            layer_root_causes.append(f"TLS_LAYER_DIRECT: TCP/TLS reset on stale IP {STALE_DNS_A_RECORD} (curl exit 35, SSL_ERROR_SYSCALL)")
        if tls_via_ghs["success"] and http_via_ghs.get("http_code") == 404:
            layer_root_causes.append(f"ROUTING_LAYER_GHS: GFE SSL valid but Cloud Run domain mapping for {sub} -> {svc} is not routed (HTTP 404)")
        if cr_info.get("stale_status") == 404:
            layer_root_causes.append(f"DOC_LAYER_R29: Stale Cloud Run URL ({KNOWN_CLOUD_RUN_SUFFIXES['stale_documentation']}) returns 404; active URL is on {KNOWN_CLOUD_RUN_SUFFIXES['active']}")

        results.append({
            "entry_id": entry["id"],
            "subdomain": sub,
            "cloud_run_service": svc,
            "role": entry["role"],
            "category": entry["category"],
            "path": path,
            "dns": dns_info,
            "tls_direct": tls_direct,
            "tls_via_ghs": tls_via_ghs,
            "http_direct": http_direct,
            "http_via_ghs": http_via_ghs,
            "cloud_run_direct": cr_info,
            "layer_root_causes": layer_root_causes,
            "reproduced_r01": not tls_direct["success"] and http_direct.get("exit_code") == 35,
            "reproduced_r29": cr_info.get("stale_status") == 404 and cr_info.get("active_healthy", False),
        })

    # Diagnostic for retired / paused entries
    retired_results: List[Dict[str, Any]] = []
    for excluded in EXCLUDED_ENTRIES:
        sub = excluded["subdomain"]
        dns_info = query_dns_records(sub, mock=mock)
        retired_results.append({
            "entry_id": excluded["id"],
            "subdomain": sub,
            "policy_status": excluded["status"],
            "policy": excluded["policy"],
            "dns": dns_info,
            "is_clean_nxdomain": dns_info.get("status") == "NXDOMAIN",
        })

    summary = {
        "active_entries_count": len(results),
        "retired_entries_count": len(retired_results),
        "r01_reproduced_all_entries": all(r["reproduced_r01"] for r in results),
        "r29_reproduced_all_entries": all(r["reproduced_r29"] for r in results),
        "all_retired_clean_nxdomain": all(r["is_clean_nxdomain"] for r in retired_results),
        "all_cloud_run_active_healthy": all(r["cloud_run_direct"]["active_healthy"] for r in results),
        "canonical_cname_target": CANONICAL_CNAME_TARGET,
        "stale_a_ip": STALE_DNS_A_RECORD,
        "active_cloud_run_suffix": KNOWN_CLOUD_RUN_SUFFIXES["active"],
        "stale_cloud_run_suffix": KNOWN_CLOUD_RUN_SUFFIXES["stale_documentation"],
    }

    return {
        "summary": summary,
        "active_entries": results,
        "retired_entries": retired_results,
    }


def format_markdown_table(diagnostic_data: Dict[str, Any]) -> str:
    """Render diagnostic data as clean Markdown table."""
    lines = [
        "| Subdomain | Target Service | Path | Public DNS (A / CNAME) | Direct TLS / HTTP | GHS Anycast TLS / HTTP | Active Cloud Run (`lyo6ra57fq`) | Stale URL (`4t7rg6fmeq`) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for r in diagnostic_data["active_entries"]:
        sub = r["subdomain"]
        svc = r["cloud_run_service"]
        path = r["path"]
        dns_status = f"`{','.join(r['dns']['a_records'])}` (Stale A)" if r["dns"]["has_stale_a"] else "OK"
        direct_status = f"Exit {r['http_direct']['exit_code']} (TLS Sycall Error)" if not r["tls_direct"]["success"] else str(r["http_direct"]["http_code"])
        ghs_status = f"Cert: Valid | HTTP {r['http_via_ghs']['http_code']}" if r["tls_via_ghs"]["success"] else "TLS Fail"
        cr_active = f"HTTP {r['cloud_run_direct']['active_status']} (Healthy)" if r["cloud_run_direct"]["active_healthy"] else f"HTTP {r['cloud_run_direct']['active_status']}"
        cr_stale = f"HTTP {r['cloud_run_direct']['stale_status']} (Dead/404)"

        lines.append(f"| `{sub}` | `{svc}` | `{path}` | {dns_status} | {direct_status} | {ghs_status} | {cr_active} | {cr_stale} |")

    lines.append("")
    lines.append("### 退休／暫停網域檢查（防污染門檻）")
    lines.append("| Subdomain | Policy Status | Expected DNS | Observed DNS | Clean? |")
    lines.append("|---|---|---|---|---|")
    for r in diagnostic_data["retired_entries"]:
        clean_mark = "✅ Clean" if r["is_clean_nxdomain"] else "❌ Contaminated"
        lines.append(f"| `{r['subdomain']}` | `{r['policy_status']}` | NXDOMAIN | `{r['dns']['status']}` | {clean_mark} |")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="SR-PUBLIC-001 System Remediation Endpoint Diagnostic Tool")
    parser.add_argument("--mode", choices=["json", "table", "verify"], default="json", help="Output mode")
    parser.add_argument("--offline", "--mock", dest="mock", action="store_true", help="Run in mock/offline mode (for CI without network)")
    parser.add_argument("--output", type=str, default="", help="Optional file path to write JSON output")
    args = parser.parse_args()

    diag = diagnose_public_entries(mock=args.mock)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(diag, f, indent=2, ensure_ascii=False)
        print(f"Wrote diagnostic results to {args.output}")

    if args.mode == "table":
        print(format_markdown_table(diag))
    elif args.mode == "verify":
        # Verification check
        summary = diag["summary"]
        print("=== SR-PUBLIC-001 Verification Check ===")
        print(f"Active entries count: {summary['active_entries_count']} (expected: 9)")
        print(f"R01 reproduced (exit 35 on direct A record): {summary['r01_reproduced_all_entries']}")
        print(f"R29 reproduced (stale URL 404, active lyo6ra57fq healthy): {summary['r29_reproduced_all_entries']}")
        print(f"Retired domains clean NXDOMAIN: {summary['all_retired_clean_nxdomain']}")
        print(f"All Cloud Run active healthy: {summary['all_cloud_run_active_healthy']}")
        if (
            summary["active_entries_count"] == 9
            and summary["r01_reproduced_all_entries"]
            and summary["r29_reproduced_all_entries"]
            and summary["all_retired_clean_nxdomain"]
            and summary["all_cloud_run_active_healthy"]
        ):
            print("Status: PASS (Diagnosis and inventory complete; live gate preserved)")
            sys.exit(0)
        else:
            print("Status: FAILED_VERIFICATION")
            sys.exit(1)
    else:
        print(json.dumps(diag, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
