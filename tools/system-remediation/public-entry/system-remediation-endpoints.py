#!/usr/bin/env python3
"""Read-only public-entry evidence. No URL suffix guessing or cloud mutations."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlsplit

SERVICES = {
    "fleets": "drts-dev-platform-admin-web",
    "ops": "drts-dev-ops-console-web",
    "partners": "drts-dev-fleet-partner-portal-web",
    "dispatch": "drts-dev-enterprise-dispatch-web",
    "bank": "drts-dev-bank-console-web",
    "channel": "drts-channel-partner-portal-web",
    "tenant": "drts-dev-tenant-console-web",
    "refer": "drts-dev-referral-embed-web",
    "api": "drts-dev-api",
}


def run(argv, timeout=25):
    try:
        p = subprocess.run(argv, text=True, capture_output=True, input="", timeout=timeout)
        return {"command": argv, "exit_code": p.returncode,
                "stdout": p.stdout.strip(), "stderr": p.stderr.strip()}
    except subprocess.TimeoutExpired:
        return {"command": argv, "exit_code": 124, "stdout": "", "stderr": "probe timed out"}
    except OSError as exc:
        return {"command": argv, "exit_code": 127, "stdout": "", "stderr": str(exc)}


def parsed(result):
    if result["exit_code"] != 0:
        return None
    try:
        return json.loads(result["stdout"])
    except (ValueError, TypeError):
        return None


def http(url, direct=False):
    cmd = ["curl", "--disable", "--silent", "--show-error", "--location", "--max-redirs", "5",
           "--connect-timeout", "5", "--max-time", "15", "--proto", "=https",
           "--proto-redir", "=https", "--output", os.devnull, "--write-out",
           '{"status":"%{http_code}","final_url":"%{url_effective}",'
           '"remote_ip":"%{remote_ip}","redirects":%{num_redirects},'
           '"ssl_verify_result":%{ssl_verify_result}}']
    if direct:
        cmd += ["--noproxy", "*"]
    result = run(cmd + [url])
    try:
        result["response"] = json.loads(result["stdout"])
        result["response"]["status"] = int(result["response"]["status"])
    except (ValueError, TypeError, KeyError):
        result["response"] = None
    # HTTP 401/403/404 are observations, never successful user acceptance.
    response = result["response"] or {}
    result["reachable"] = result["exit_code"] == 0 and 200 <= response.get("status", 0) < 400
    return result


def probe(url):
    host = urlsplit(url).hostname
    return {
        "url": url,
        "dns": {kind: run(["dig", "+time=3", "+tries=1", "+noall", "+comments", "+answer", "+stats", host, kind])
                for kind in ("CNAME", "A", "AAAA")},
        "tls_direct": run(["openssl", "s_client", "-connect", host + ":443", "-servername", host,
                           "-verify_hostname", host, "-verify_return_error", "-brief"], timeout=12),
        "http_environment": http(url),
        "http_direct": http(url, direct=True),
    }


def cloud_inventory(project, region):
    common = ["--project=" + project, "--region=" + region, "--quiet"]
    result = run(["gcloud", "run", "services", "list", *common,
                  "--format=json(metadata.name,metadata.labels,status.url,status.latestReadyRevisionName,status.traffic)"])
    data = parsed(result)
    # Failed discovery is unknown, not an empty/healthy service list.
    services = {s["metadata"]["name"]: s for s in data} if isinstance(data, list) else {}
    mappings = run(["gcloud", "beta", "run", "domain-mappings", "list", *common,
                    "--format=json(metadata.name,spec.routeName,status.conditions,status.resourceRecords)"])
    return result, services, mappings


def collect(project, region, base_sha):
    started_at = datetime.now(timezone.utc).isoformat()
    discovery, services, mappings = cloud_inventory(project, region)
    def entry(item):
        prefix, name = item
        service = services.get(name)
        url = (service or {}).get("status", {}).get("url")
        # Only server-returned HTTPS Cloud Run origins are used.
        valid_url = bool(url and urlsplit(url).scheme == "https" and
                         (urlsplit(url).hostname or "").endswith(".run.app") and
                         not urlsplit(url).username and not urlsplit(url).query)
        revisions = {}
        for traffic in (service or {}).get("status", {}).get("traffic", []):
            revision = traffic.get("revisionName")
            if revision and traffic.get("percent", 0) > 0:
                revisions[revision] = run([
                    "gcloud", "run", "revisions", "describe", revision, "--project=" + project,
                    "--region=" + region, "--quiet",
                    "--format=json(metadata.name,metadata.labels,status.imageDigest,spec.containers.image)"])
        return {"resource_id": f"projects/{project}/locations/{region}/services/{name}",
                "service": service, "serving_revisions": revisions,
                "public": probe("https://" + prefix + ".smarttransport.tw/"),
                "cloud_run": probe(url + "/") if valid_url else None,
                "cloud_run_status": "observed" if valid_url else "unknown: discovery unavailable or URL missing"}
    with ThreadPoolExecutor(max_workers=9) as pool:
        entries = dict(zip(SERVICES, pool.map(entry, SERVICES.items())))
    return {"started_at": started_at, "observed_at": datetime.now(timezone.utc).isoformat(), "base_sha": base_sha,
            "candidate_sha": run(["git", "rev-parse", "HEAD"])["stdout"],
            "git_status": run(["git", "status", "--porcelain"]),
            "tool_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            "project": project, "region": region,
            "proxy_variables_present": [k for k in ("HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY",
                                                        "https_proxy", "http_proxy", "all_proxy", "no_proxy") if os.getenv(k)],
            "cloud_discovery": discovery, "domain_mappings": mappings, "entries": entries,
            "acceptance": "diagnostic only; no authenticated journey, deployment or rollback performed"}


def complete(report):
    return (parsed(report["cloud_discovery"]) is not None and
            parsed(report["domain_mappings"]) is not None and
            all(e["cloud_run"] is not None and
                all(p["tls_direct"]["exit_code"] == 0 and
                    all(r["exit_code"] == 0 and "status: NOERROR" in r["stdout"]
                        for r in p["dns"].values()) and
                    p["http_direct"]["reachable"] and p["http_environment"]["reachable"]
                    for p in (e["public"], e["cloud_run"]))
                for e in report["entries"].values()))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", required=True)
    parser.add_argument("--region", required=True)
    parser.add_argument("--base-sha", required=True)
    args = parser.parse_args()
    report = collect(args.project, args.region, args.base_sha)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if complete(report) else 1


if __name__ == "__main__":
    raise SystemExit(main())
