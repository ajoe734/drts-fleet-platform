#!/usr/bin/env python3
"""
tools/system-remediation/public-entry/system-remediation-endpoints.py

SR-PUBLIC-001: 公開入口／callback／版本清單診斷與分層評估工具
- 診斷 9 個正式公開入口之 DNS、TLS、HTTP 與 Cloud Run 降級 URL
- 核驗已退休／暫停網域（book, ride, concierge）未混入現行 active inventory
- 分層檢驗根因：DNS A 紀錄（8.233.119.14 逾時／重設）vs CNAME（ghs.googlehosted.com.）
- 檢驗 Cloud Run 現行部署 URL（lyo6ra57fq）vs 陳舊文件 URL（4t7rg6fmeq）
- 追蹤並記錄有界重新導向鏈（bounded redirect chain）、實際最終 URL 與最終 HTTP 狀態
- 嚴格區分「缺陷重現（diagnosis reproduction）」與「修復驗收（recovery acceptance）」
- 遵守 DNS 錯誤安全邊界：socket.EAI_AGAIN (-3) 等解析器逾時失敗維持 fail-closed，不誤判為 clean NXDOMAIN
- 提供離線 mock 模式以供 CI 與單元測試無網路環境驗證（支援 reproduced 與 repaired 兩種情境）
"""

import argparse
import json
import re
import socket
import ssl
import subprocess
import sys
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple


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


def query_dns_records(
    domain: str,
    mock: bool = False,
    mock_state: str = "reproduced",
    mock_dns_error: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Query A and CNAME records for a domain.
    Preserves temporary / unknown DNS failures (e.g. EAI_AGAIN / -3) and fails closed.
    """
    if mock:
        if mock_dns_error is not None:
            # Simulate DNS resolver error directly
            err_name = "EAI_AGAIN" if mock_dns_error in (getattr(socket, "EAI_AGAIN", -3), -3) else f"GAI_ERROR_{mock_dns_error}"
            return {
                "domain": domain,
                "resolved": False,
                "status": err_name,
                "a_records": [],
                "cname": None,
                "canonical_cname_target": CANONICAL_CNAME_TARGET,
                "has_stale_a": False,
                "error": f"Simulated DNS resolver failure (errno {mock_dns_error})",
            }

        if domain in [e["subdomain"] for e in EXCLUDED_ENTRIES]:
            return {
                "domain": domain,
                "resolved": False,
                "status": "NXDOMAIN",
                "a_records": [],
                "cname": None,
                "canonical_cname_target": CANONICAL_CNAME_TARGET,
                "has_stale_a": False,
                "error": None,
            }

        if mock_state == "repaired":
            return {
                "domain": domain,
                "resolved": True,
                "status": "RESOLVED_CNAME_OK",
                "a_records": ["108.177.97.121"],
                "cname": CANONICAL_CNAME_TARGET,
                "canonical_cname_target": CANONICAL_CNAME_TARGET,
                "has_stale_a": False,
                "error": None,
            }

        return {
            "domain": domain,
            "resolved": True,
            "status": "RESOLVED_STALE_A",
            "a_records": [STALE_DNS_A_RECORD],
            "cname": None,
            "canonical_cname_target": CANONICAL_CNAME_TARGET,
            "has_stale_a": True,
            "error": None,
        }

    res: Dict[str, Any] = {
        "domain": domain,
        "resolved": False,
        "status": "UNKNOWN",
        "a_records": [],
        "cname": None,
        "canonical_cname_target": CANONICAL_CNAME_TARGET,
        "has_stale_a": False,
        "error": None,
    }
    try:
        ips = socket.getaddrinfo(domain, 443)
        a_records = sorted(list(set(addr[4][0] for addr in ips)))
        res["resolved"] = True
        res["a_records"] = a_records
        res["has_stale_a"] = STALE_DNS_A_RECORD in a_records
        res["status"] = "RESOLVED_STALE_A" if res["has_stale_a"] else "RESOLVED_OK"
    except socket.gaierror as e:
        # socket.EAI_NONAME (-2 on Linux): Host name not found (clean NXDOMAIN)
        # socket.EAI_AGAIN (-3 on Linux): Temporary failure in name resolution (resolver outage - must NOT map to NXDOMAIN)
        # socket.EAI_NODATA (-5 on Linux): No address associated with hostname
        if hasattr(socket, "EAI_NONAME") and e.errno == socket.EAI_NONAME:
            res["status"] = "NXDOMAIN"
            res["error"] = "NXDOMAIN (Host name not found)"
        elif e.errno == -2:
            res["status"] = "NXDOMAIN"
            res["error"] = "NXDOMAIN (Host name not found)"
        elif hasattr(socket, "EAI_AGAIN") and e.errno == socket.EAI_AGAIN:
            res["status"] = "EAI_AGAIN"
            res["error"] = "EAI_AGAIN (Temporary DNS resolver failure / timeout)"
        elif e.errno == -3:
            res["status"] = "EAI_AGAIN"
            res["error"] = "EAI_AGAIN (Temporary DNS resolver failure / timeout)"
        else:
            res["status"] = f"GAI_ERROR_{e.errno}"
            res["error"] = str(e)

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


def check_tls_connection(
    domain: str,
    resolve_ip: Optional[str] = None,
    mock: bool = False,
    mock_state: str = "reproduced",
) -> Dict[str, Any]:
    """Inspect TLS handshake and server certificate."""
    if mock:
        if mock_state == "repaired" or resolve_ip:
            return {
                "success": True,
                "sni_domain": domain,
                "resolved_ip": resolve_ip if resolve_ip else "108.177.97.121",
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


def parse_curl_output(stdout: str, request_url: str) -> Dict[str, Any]:
    """
    Parse curl output containing header blocks dumped via '-D -' along with
    write-out metadata tags (FINAL_URL, FINAL_STATUS, NUM_REDIRECTS).
    Captures bounded redirect chain, actual final URL and final status.
    """
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    meta_final_url: Optional[str] = None
    meta_final_status: Optional[int] = None
    meta_num_redirects: Optional[int] = None
    header_lines: List[str] = []

    for line in lines:
        if line.startswith("FINAL_URL:"):
            meta_final_url = line.split("FINAL_URL:", 1)[1].strip()
        elif line.startswith("FINAL_STATUS:"):
            s = line.split("FINAL_STATUS:", 1)[1].strip()
            if s.isdigit():
                meta_final_status = int(s)
        elif line.startswith("NUM_REDIRECTS:"):
            s = line.split("NUM_REDIRECTS:", 1)[1].strip()
            if s.isdigit():
                meta_num_redirects = int(s)
        else:
            header_lines.append(line)

    hops: List[Dict[str, Any]] = []
    current_hop: Optional[Dict[str, Any]] = None

    for line in header_lines:
        m = re.match(r"^HTTP/\S+\s+(\d{3})", line, re.IGNORECASE)
        if m:
            if current_hop is not None:
                hops.append(current_hop)
            current_hop = {
                "status_code": int(m.group(1)),
                "headers": {},
            }
        elif current_hop is not None and ":" in line:
            k, v = line.split(":", 1)
            current_hop["headers"][k.strip().lower()] = v.strip()

    if current_hop is not None:
        hops.append(current_hop)

    redirect_chain: List[Dict[str, Any]] = []
    current_url = request_url

    if hops:
        initial_status = hops[0]["status_code"]
        for hop in hops[:-1]:
            loc = hop["headers"].get("location")
            if loc:
                target_url = urllib.parse.urljoin(current_url, loc)
                redirect_chain.append({
                    "url": current_url,
                    "status_code": hop["status_code"],
                    "location": loc,
                    "target_url": target_url,
                })
                current_url = target_url
            else:
                redirect_chain.append({
                    "url": current_url,
                    "status_code": hop["status_code"],
                    "location": None,
                    "target_url": current_url,
                })

        # If last hop is also a redirect (e.g. single 307 mock without subsequent hops)
        last_hop = hops[-1]
        if last_hop["status_code"] in (301, 302, 303, 307, 308) and "location" in last_hop["headers"]:
            loc = last_hop["headers"]["location"]
            target_url = urllib.parse.urljoin(current_url, loc)
            redirect_chain.append({
                "url": current_url,
                "status_code": last_hop["status_code"],
                "location": loc,
                "target_url": target_url,
            })
            current_url = target_url

        final_url = meta_final_url if meta_final_url else current_url
        final_status = meta_final_status if meta_final_status is not None else last_hop["status_code"]
    else:
        # Fallback if no HTTP/x.x status line found (e.g. stdout was just a numeric code or empty)
        stripped = stdout.strip()
        first_word = stripped.split()[0] if stripped else ""
        if first_word.isdigit():
            initial_status = int(first_word)
            final_status = meta_final_status if meta_final_status is not None else initial_status
            final_url = meta_final_url if meta_final_url else request_url
        else:
            initial_status = 0
            final_status = 0
            final_url = request_url

    num_redirects = meta_num_redirects if meta_num_redirects is not None else len(redirect_chain)

    return {
        "initial_http_code": initial_status,
        "http_code": initial_status,
        "final_http_code": final_status,
        "final_status": final_status,
        "final_url": final_url,
        "redirect_chain": redirect_chain,
        "num_redirects": num_redirects,
    }


def probe_http_endpoint_with_redirects(
    url: str,
    resolve_ip: Optional[str] = None,
    timeout_sec: int = 5,
    max_redirects: int = 5,
) -> Dict[str, Any]:
    """Execute curl with bounded redirect tracking, header dumps, and write-out metadata."""
    cmd = [
        "curl",
        "-s",
        "-D", "-",
        "-o", "/dev/null",
        "-L",
        "--max-redirs", str(max_redirects),
        "--max-time", str(timeout_sec),
        "-w", "\nFINAL_URL:%{url_effective}\nFINAL_STATUS:%{http_code}\nNUM_REDIRECTS:%{num_redirects}\n",
    ]
    if resolve_ip:
        parsed = urllib.parse.urlparse(url)
        host = parsed.hostname or url
        port = parsed.port or 443
        cmd.extend(["--resolve", f"{host}:{port}:{resolve_ip}"])
    cmd.append(url)

    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_sec + 2)
        parsed_result = parse_curl_output(p.stdout, url)
        parsed_result["exit_code"] = p.returncode
        parsed_result["error"] = p.stderr.strip() if p.returncode != 0 else None
        return parsed_result
    except Exception as e:
        return {
            "initial_http_code": 0,
            "http_code": 0,
            "exit_code": -1,
            "redirect_chain": [],
            "num_redirects": 0,
            "final_url": url,
            "final_http_code": 0,
            "final_status": 0,
            "error": str(e),
        }


def check_http_response(
    domain: str,
    path: str = "/",
    resolve_ip: Optional[str] = None,
    timeout_sec: int = 5,
    max_redirects: int = 5,
    mock: bool = False,
    mock_state: str = "reproduced",
) -> Dict[str, Any]:
    """
    Test HTTP endpoint status code, bounded redirect chain, and final URL.
    Handles relative and absolute redirect targets without discarding Location headers.
    """
    request_url = f"https://{domain}{path}"

    if mock:
        if mock_state == "repaired":
            # Repaired mock state: CNAME points to GHS and domain mapping routes correctly
            if domain == "tenant.smarttransport.tw":
                loc = "/login?redirect_uri=%2F"
                target = f"https://{domain}{loc}"
                return {
                    "initial_http_code": 307,
                    "http_code": 307,
                    "exit_code": 0,
                    "redirect_chain": [{"url": request_url, "status_code": 307, "location": loc, "target_url": target}],
                    "num_redirects": 1,
                    "final_url": target,
                    "final_http_code": 200,
                    "final_status": 200,
                    "error": None,
                }
            elif domain in ["ops.smarttransport.tw", "partners.smarttransport.tw", "channel.smarttransport.tw"]:
                loc = "/dashboard"
                target = f"https://{domain}{loc}"
                return {
                    "initial_http_code": 307,
                    "http_code": 307,
                    "exit_code": 0,
                    "redirect_chain": [{"url": request_url, "status_code": 307, "location": loc, "target_url": target}],
                    "num_redirects": 1,
                    "final_url": target,
                    "final_http_code": 200,
                    "final_status": 200,
                    "error": None,
                }
            else:
                return {
                    "initial_http_code": 200,
                    "http_code": 200,
                    "exit_code": 0,
                    "redirect_chain": [],
                    "num_redirects": 0,
                    "final_url": request_url,
                    "final_http_code": 200,
                    "final_status": 200,
                    "error": None,
                }

        # Reproduced mock state (defects active)
        if resolve_ip:
            # GFE front-end without domain mapping returns 404
            return {
                "initial_http_code": 404,
                "http_code": 404,
                "exit_code": 0,
                "redirect_chain": [],
                "num_redirects": 0,
                "final_url": request_url,
                "final_http_code": 404,
                "final_status": 404,
                "error": None,
            }
        else:
            # Direct hit to 8.233.119.14 yields curl exit 35
            return {
                "initial_http_code": 0,
                "http_code": 0,
                "exit_code": 35,
                "redirect_chain": [],
                "num_redirects": 0,
                "final_url": request_url,
                "final_http_code": 0,
                "final_status": 0,
                "error": "curl exit 35 (SSL error)",
            }

    return probe_http_endpoint_with_redirects(
        request_url,
        resolve_ip=resolve_ip,
        timeout_sec=timeout_sec,
        max_redirects=max_redirects,
    )


def check_cloud_run_fallback(
    service: str,
    path: str = "/",
    timeout_sec: int = 5,
    max_redirects: int = 5,
    mock: bool = False,
) -> Dict[str, Any]:
    """
    Probe current active (lyo6ra57fq) and stale (4t7rg6fmeq) Cloud Run URLs.
    Captures redirect chain, final URL and final status for fallback verification.
    """
    active_suffix = KNOWN_CLOUD_RUN_SUFFIXES["active"]
    stale_suffix = KNOWN_CLOUD_RUN_SUFFIXES["stale_documentation"]

    active_url = f"https://{service}-{active_suffix}{path}"
    stale_url = f"https://{service}-{stale_suffix}{path}"

    if mock:
        # Mock simulation matching verified live Cloud Run probe truth
        if service in ["drts-dev-ops-console-web", "drts-dev-fleet-partner-portal-web", "drts-channel-partner-portal-web"]:
            loc = "/dashboard"
            target = f"https://{service}-{active_suffix}{loc}"
            return {
                "active_url": active_url,
                "active_status": 307,
                "active_healthy": True,
                "active_redirect_chain": [{"url": active_url, "status_code": 307, "location": loc, "target_url": target}],
                "active_num_redirects": 1,
                "active_final_url": target,
                "active_final_status": 200,
                "stale_url": stale_url,
                "stale_status": 404,
                "stale_healthy": False,
                "stale_redirect_chain": [],
                "stale_num_redirects": 0,
                "stale_final_url": stale_url,
                "stale_final_status": 404,
            }
        elif service == "drts-dev-tenant-console-web":
            loc = "/login?redirect_uri=%2F"
            target = f"https://{service}-{active_suffix}{loc}"
            return {
                "active_url": active_url,
                "active_status": 307,
                "active_healthy": True,
                "active_redirect_chain": [{"url": active_url, "status_code": 307, "location": loc, "target_url": target}],
                "active_num_redirects": 1,
                "active_final_url": target,
                "active_final_status": 200,
                "stale_url": stale_url,
                "stale_status": 404,
                "stale_healthy": False,
                "stale_redirect_chain": [],
                "stale_num_redirects": 0,
                "stale_final_url": stale_url,
                "stale_final_status": 404,
            }
        else:
            return {
                "active_url": active_url,
                "active_status": 200,
                "active_healthy": True,
                "active_redirect_chain": [],
                "active_num_redirects": 0,
                "active_final_url": active_url,
                "active_final_status": 200,
                "stale_url": stale_url,
                "stale_status": 404,
                "stale_healthy": False,
                "stale_redirect_chain": [],
                "stale_num_redirects": 0,
                "stale_final_url": stale_url,
                "stale_final_status": 404,
            }

    probe_active = probe_http_endpoint_with_redirects(active_url, timeout_sec=timeout_sec, max_redirects=max_redirects)
    probe_stale = probe_http_endpoint_with_redirects(stale_url, timeout_sec=timeout_sec, max_redirects=max_redirects)

    active_healthy = (
        probe_active["initial_http_code"] in [200, 307]
        and probe_active["final_http_code"] in [200, 307]
    )
    stale_healthy = (
        probe_stale["initial_http_code"] in [200, 307]
        and probe_stale["final_http_code"] in [200, 307]
    )

    return {
        "active_url": active_url,
        "active_status": probe_active["initial_http_code"],
        "active_healthy": active_healthy,
        "active_redirect_chain": probe_active["redirect_chain"],
        "active_num_redirects": probe_active["num_redirects"],
        "active_final_url": probe_active["final_url"],
        "active_final_status": probe_active["final_http_code"],
        "stale_url": stale_url,
        "stale_status": probe_stale["initial_http_code"],
        "stale_healthy": stale_healthy,
        "stale_redirect_chain": probe_stale["redirect_chain"],
        "stale_num_redirects": probe_stale["num_redirects"],
        "stale_final_url": probe_stale["final_url"],
        "stale_final_status": probe_stale["final_http_code"],
    }


def diagnose_public_entries(
    mock: bool = False,
    resolve_google_ip: str = "108.177.97.121",
    mock_state: str = "reproduced",
) -> Dict[str, Any]:
    """Perform full 4-layer diagnostic on all 9 public entries and retired domains."""
    results: List[Dict[str, Any]] = []

    for entry in ACTIVE_PUBLIC_ENTRIES:
        sub = entry["subdomain"]
        svc = entry["cloud_run_service"]
        path = entry["path"]

        dns_info = query_dns_records(sub, mock=mock, mock_state=mock_state)
        tls_direct = check_tls_connection(sub, mock=mock, mock_state=mock_state)
        tls_via_ghs = check_tls_connection(sub, resolve_ip=resolve_google_ip, mock=mock, mock_state=mock_state)

        http_direct = check_http_response(sub, path=path, mock=mock, mock_state=mock_state)
        http_via_ghs = check_http_response(sub, path=path, resolve_ip=resolve_google_ip, mock=mock, mock_state=mock_state)

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

        # Detection of broken login redirects
        broken_redirect = False
        if http_direct.get("redirect_chain"):
            if http_direct.get("final_http_code") not in [200, 307]:
                layer_root_causes.append(f"REDIRECT_LAYER: Broken redirect chain terminating in HTTP {http_direct.get('final_http_code')}")
                broken_redirect = True
        if cr_info.get("active_redirect_chain"):
            if cr_info.get("active_final_status") not in [200, 307]:
                layer_root_causes.append(f"FALLBACK_REDIRECT_LAYER: Cloud Run fallback redirect terminating in HTTP {cr_info.get('active_final_status')}")
                broken_redirect = True

        # Layer repair criteria
        repaired_dns = (not dns_info.get("has_stale_a")) and (dns_info.get("cname") == CANONICAL_CNAME_TARGET or dns_info.get("resolved", False))
        repaired_tls = tls_direct.get("success", False)
        repaired_http = (
            http_direct.get("http_code") in entry["expected_direct_status"]
            and http_direct.get("final_http_code") in [200, 307]
            and not broken_redirect
        )
        repaired_all = repaired_dns and repaired_tls and repaired_http and cr_info.get("active_healthy", False)

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
            "repaired_dns": repaired_dns,
            "repaired_tls": repaired_tls,
            "repaired_http": repaired_http,
            "repaired_all": repaired_all,
        })

    # Diagnostic for retired / paused entries
    retired_results: List[Dict[str, Any]] = []
    for excluded in EXCLUDED_ENTRIES:
        sub = excluded["subdomain"]
        dns_info = query_dns_records(sub, mock=mock, mock_state=mock_state)
        # Retired domain cleanliness strictly checks for clean NXDOMAIN
        is_clean_nxdomain = (dns_info.get("status") == "NXDOMAIN")
        retired_results.append({
            "entry_id": excluded["id"],
            "subdomain": sub,
            "policy_status": excluded["status"],
            "policy": excluded["policy"],
            "dns": dns_info,
            "is_clean_nxdomain": is_clean_nxdomain,
        })

    r01_all = all(r["reproduced_r01"] for r in results)
    r29_all = all(r["reproduced_r29"] for r in results)
    retired_clean = all(r["is_clean_nxdomain"] for r in retired_results)
    cr_active_healthy = all(r["cloud_run_direct"]["active_healthy"] for r in results)
    all_repaired = all(r["repaired_all"] for r in results)

    diagnosis_passed = (
        len(results) == 9
        and r01_all
        and r29_all
        and retired_clean
        and cr_active_healthy
    )

    recovery_passed = (
        len(results) == 9
        and all_repaired
        and retired_clean
        and cr_active_healthy
    )

    summary = {
        "active_entries_count": len(results),
        "retired_entries_count": len(retired_results),
        "r01_reproduced_all_entries": r01_all,
        "r29_reproduced_all_entries": r29_all,
        "all_retired_clean_nxdomain": retired_clean,
        "all_cloud_run_active_healthy": cr_active_healthy,
        "all_entries_repaired": all_repaired,
        "diagnosis_passed": diagnosis_passed,
        "recovery_passed": recovery_passed,
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


def verify_diagnostics(diag: Dict[str, Any], target: str = "auto") -> Tuple[bool, str]:
    """
    Verify diagnostic output against target evaluation criteria.
    - 'diagnosis': Assert pre-repair defect reproduction (R01, R29, retired clean NXDOMAIN, Cloud Run active healthy).
    - 'recovery': Assert post-repair recovery acceptance (DNS CNAME, TLS success, HTTP expected code/redirects, retired clean NXDOMAIN).
    - 'auto': Determine based on observed state: if repaired returns PASS, if defect reproduced returns PASS.
    """
    summary = diag.get("summary", {})
    t = target.lower()
    if t not in ["auto", "diagnosis", "recovery"]:
        t = "auto"

    if t == "diagnosis":
        if summary.get("diagnosis_passed"):
            return True, "PASS (Diagnosis reproduction verified: defects R01 and R29 confirmed; retired domains clean; Cloud Run fallbacks healthy)"
        reasons = []
        if not summary.get("r01_reproduced_all_entries"):
            reasons.append("R01 not reproduced across all entries")
        if not summary.get("r29_reproduced_all_entries"):
            reasons.append("R29 not reproduced across all entries")
        if not summary.get("all_retired_clean_nxdomain"):
            reasons.append("Retired domains not clean NXDOMAIN")
        if not summary.get("all_cloud_run_active_healthy"):
            reasons.append("Active Cloud Run fallbacks not healthy")
        return False, f"FAILED_VERIFICATION (Diagnosis reproduction incomplete: {'; '.join(reasons)})"

    if t == "recovery":
        if summary.get("recovery_passed"):
            return True, "PASS (Recovery acceptance verified: all 9 entries healthy on DNS/TLS/HTTP with bounded redirects; retired domains clean)"
        reasons = []
        if not summary.get("all_entries_repaired"):
            reasons.append("One or more active entries failed DNS/TLS/HTTP recovery check")
        if not summary.get("all_retired_clean_nxdomain"):
            reasons.append("Retired domains not clean NXDOMAIN")
        if not summary.get("all_cloud_run_active_healthy"):
            reasons.append("Active Cloud Run fallbacks not healthy")
        return False, f"FAILED_VERIFICATION (Recovery acceptance incomplete: {'; '.join(reasons)})"

    # auto target
    if summary.get("recovery_passed"):
        return True, "PASS (Recovery acceptance verified: all 9 entries healthy on DNS/TLS/HTTP with bounded redirects; retired domains clean)"
    elif summary.get("diagnosis_passed"):
        return True, "PASS (Diagnosis reproduction verified: defects R01 and R29 accurately reproduced; retired domains clean; live gate preserved)"
    else:
        return False, "FAILED_VERIFICATION (Neither diagnosis reproduction nor recovery acceptance passed)"


def format_markdown_table(diagnostic_data: Dict[str, Any]) -> str:
    """Render diagnostic data as clean Markdown table."""
    lines = [
        "| Subdomain | Target Service | Path | Public DNS (A / CNAME) | Direct TLS / HTTP | Final URL & Status | GHS Anycast TLS / HTTP | Active Cloud Run (`lyo6ra57fq`) | Stale URL (`4t7rg6fmeq`) |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for r in diagnostic_data["active_entries"]:
        sub = r["subdomain"]
        svc = r["cloud_run_service"]
        path = r["path"]
        dns_status = f"`{','.join(r['dns']['a_records'])}` (Stale A)" if r["dns"]["has_stale_a"] else ("`ghs.googlehosted.com.` (CNAME)" if r["dns"].get("cname") else "OK")

        if not r["tls_direct"]["success"]:
            direct_status = f"Exit {r['http_direct']['exit_code']} (TLS Syscall Error)"
            final_status = "N/A (Connection Reset)"
        else:
            direct_status = f"HTTP {r['http_direct']['http_code']}"
            if r['http_direct'].get("redirect_chain"):
                final_status = f"`{r['http_direct']['final_url']}` (HTTP {r['http_direct']['final_http_code']})"
            else:
                final_status = f"`{r['http_direct']['final_url']}` (HTTP {r['http_direct']['final_http_code']})"

        ghs_status = f"Cert: Valid | HTTP {r['http_via_ghs']['http_code']}" if r["tls_via_ghs"]["success"] else "TLS Fail"

        cr = r["cloud_run_direct"]
        if cr.get("active_redirect_chain"):
            cr_active = f"HTTP {cr['active_status']} -> `{cr['active_final_url']}` (HTTP {cr['active_final_status']})"
        else:
            cr_active = f"HTTP {cr['active_status']} (Healthy)" if cr["active_healthy"] else f"HTTP {cr['active_status']}"
        cr_stale = f"HTTP {cr['stale_status']} (Dead/404)"

        lines.append(f"| `{sub}` | `{svc}` | `{path}` | {dns_status} | {direct_status} | {final_status} | {ghs_status} | {cr_active} | {cr_stale} |")

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
    parser.add_argument(
        "--target", "--phase",
        dest="target",
        choices=["auto", "diagnosis", "recovery"],
        default="auto",
        help="Verification target phase: auto (default), diagnosis (pre-repair defect reproduction), recovery (post-repair recovery acceptance)",
    )
    parser.add_argument("--offline", "--mock", dest="mock", action="store_true", help="Run in mock/offline mode (for CI without network)")
    parser.add_argument(
        "--mock-state",
        choices=["reproduced", "repaired"],
        default="reproduced",
        help="Mock state to simulate in offline mode: reproduced (default) or repaired",
    )
    parser.add_argument("--output", type=str, default="", help="Optional file path to write JSON output")
    args = parser.parse_args()

    diag = diagnose_public_entries(mock=args.mock, mock_state=args.mock_state)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(diag, f, indent=2, ensure_ascii=False)
        print(f"Wrote diagnostic results to {args.output}")

    if args.mode == "table":
        print(format_markdown_table(diag))
    elif args.mode == "verify":
        passed, msg = verify_diagnostics(diag, target=args.target)
        summary = diag["summary"]
        print("=== SR-PUBLIC-001 Verification Check ===")
        print(f"Target phase: {args.target}")
        print(f"Active entries count: {summary['active_entries_count']} (expected: 9)")
        print(f"R01 reproduced (exit 35 on direct A record): {summary['r01_reproduced_all_entries']}")
        print(f"R29 reproduced (stale URL 404, active lyo6ra57fq healthy): {summary['r29_reproduced_all_entries']}")
        print(f"Diagnosis reproduction passed: {summary['diagnosis_passed']}")
        print(f"Recovery acceptance passed: {summary['recovery_passed']}")
        print(f"Retired domains clean NXDOMAIN: {summary['all_retired_clean_nxdomain']}")
        print(f"All Cloud Run active healthy: {summary['all_cloud_run_active_healthy']}")
        print(f"Status: {msg}")
        if passed:
            sys.exit(0)
        else:
            sys.exit(1)
    else:
        print(json.dumps(diag, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
