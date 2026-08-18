#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from common import parse_iso_utc as _parse_iso
from typing import Any

from common import (
    ROOT,
    SOURCE_ROOT,
    agent_config_for,
    command_exists,
    config_path,
    load_config,
    load_json,
    load_status,
    relpath,
    render_template,
    run_command,
    selected_shared_files,
    utc_now,
    write_activity_log,
    write_json,
)
from github_command_parser import GitHubCommand, parse_command
from control_plane.infra.queue_repo import enqueue_event
from control_plane.usecases.task_board_commands import run_task_board_command
from watch_events import render_wakeup_message

COMMENT_MARKER = "<!-- pantheon-bus -->"
MAX_PROCESSED_IDS = 2000


class GitHubBusError(RuntimeError):
    pass


class GitHubBusOffline(GitHubBusError):
    pass


def _iso_now_dt() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def default_bus_state() -> dict[str, Any]:
    return {
        "version": 1,
        "repo": None,
        "last_sync_at": None,
        "offline_until": None,
        "last_error": None,
        "processed_review_ids": [],
        "processed_comment_ids": [],
        "processed_webhook_deliveries": [],
        "tasks": {},
    }


def load_bus_state(config: dict[str, Any]) -> dict[str, Any]:
    path = config_path(config, "github_bus_state")
    state = load_json(path, default=default_bus_state()) or {}
    merged = default_bus_state()
    merged.update(state)
    merged.setdefault("tasks", {})
    merged.setdefault("processed_review_ids", [])
    merged.setdefault("processed_comment_ids", [])
    merged.setdefault("processed_webhook_deliveries", [])
    return merged


def save_bus_state(config: dict[str, Any], state: dict[str, Any]) -> None:
    pruned_tasks: dict[str, Any] = {}
    for task_id, entry in (state.get("tasks") or {}).items():
        if any(
            (
                entry.get("review_pr"),
                entry.get("ops_issue"),
                entry.get("last_review_hash"),
                entry.get("last_issue_hash"),
            )
        ):
            pruned_tasks[task_id] = entry
    state["tasks"] = pruned_tasks
    state["last_sync_at"] = utc_now()
    state["processed_review_ids"] = state.get("processed_review_ids", [])[-MAX_PROCESSED_IDS:]
    state["processed_comment_ids"] = state.get("processed_comment_ids", [])[-MAX_PROCESSED_IDS:]
    state["processed_webhook_deliveries"] = state.get("processed_webhook_deliveries", [])[-MAX_PROCESSED_IDS:]
    write_json(config_path(config, "github_bus_state"), state)


def trim_text(value: str | None, limit: int = 400) -> str:
    if not value:
        return ""
    text = re.sub(r"\s+", " ", value).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def infer_repo_slug(config: dict[str, Any], bus_state: dict[str, Any]) -> str | None:
    configured = (config.get("github_bus", {}) or {}).get("repo")
    if configured:
        return str(configured)
    if bus_state.get("repo"):
        return str(bus_state["repo"])
    proc = run_command(["git", "remote", "get-url", "origin"], cwd=ROOT)
    if proc.returncode != 0:
        return None
    remote = (proc.stdout or "").strip()
    patterns = [
        re.compile(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/.]+)(?:\.git)?$"),
    ]
    for pattern in patterns:
        match = pattern.search(remote)
        if match:
            return f"{match.group('owner')}/{match.group('repo')}"
    return None


def default_branch(config: dict[str, Any]) -> str:
    bus_cfg = config.get("github_bus", {}) or {}
    configured = bus_cfg.get("default_branch")
    if configured:
        return str(configured)
    proc = run_command(["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd=ROOT)
    if proc.returncode == 0:
        ref = (proc.stdout or "").strip()
        if "/" in ref:
            return ref.rsplit("/", 1)[-1]
    return "main"


def current_branch() -> str | None:
    proc = run_command(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=ROOT)
    if proc.returncode != 0:
        return None
    branch = (proc.stdout or "").strip()
    return branch or None


def branch_exists(branch: str) -> bool:
    proc = run_command(["git", "show-ref", "--verify", f"refs/heads/{branch}"], cwd=ROOT)
    return proc.returncode == 0


def branch_has_diff(base: str, branch: str) -> bool:
    proc = run_command(["git", "rev-list", "--count", f"{base}..{branch}"], cwd=ROOT)
    if proc.returncode != 0:
        return False
    try:
        return int((proc.stdout or '0').strip() or '0') > 0
    except ValueError:
        return False


def run_gh_process(args: list[str], *, timeout_seconds: float) -> subprocess.CompletedProcess[str]:
    # Avoid subprocess.run(..., timeout=...) here: if gh gets wedged in I/O,
    # subprocess.run waits on teardown and can stall the supervisor heartbeat.
    with tempfile.TemporaryFile() as stdout_handle, tempfile.TemporaryFile() as stderr_handle:
        process = subprocess.Popen(
            ["gh", *args],
            cwd=str(ROOT),
            stdout=stdout_handle,
            stderr=stderr_handle,
            start_new_session=True,
        )
        try:
            process.wait(timeout=timeout_seconds)
        except subprocess.TimeoutExpired as exc:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                process.wait(timeout=0.2)
            except subprocess.TimeoutExpired:
                pass
            raise exc

        stdout_handle.seek(0)
        stderr_handle.seek(0)
        stdout = stdout_handle.read().decode("utf-8", errors="replace")
        stderr = stderr_handle.read().decode("utf-8", errors="replace")
        return subprocess.CompletedProcess(["gh", *args], process.returncode or 0, stdout, stderr)


def run_gh(args: list[str], *, allow_offline: bool = True) -> subprocess.CompletedProcess[str]:
    if not command_exists("gh"):
        raise GitHubBusError("GitHub CLI `gh` is not installed.")
    timeout_seconds = 8.0
    try:
        cfg = load_config()
        timeout_seconds = float((cfg.get("github_bus", {}) or {}).get("command_timeout_seconds", 8))
    except Exception:
        timeout_seconds = 8.0
    try:
        proc = run_gh_process(args, timeout_seconds=timeout_seconds)
    except subprocess.TimeoutExpired as exc:
        message = f"GitHub CLI timed out after {int(timeout_seconds)}s while running: gh {' '.join(args)}"
        if allow_offline:
            raise GitHubBusOffline(message) from exc
        raise GitHubBusError(message) from exc
    if proc.returncode == 0:
        return proc
    combined = f"{proc.stdout or ''}\n{proc.stderr or ''}".strip()
    lowered = combined.lower()
    if allow_offline and (
        "error connecting to api.github.com" in lowered
        or "check your internet connection" in lowered
        or "dial tcp" in lowered
        or "no such host" in lowered
    ):
        raise GitHubBusOffline(trim_text(combined, 600))
    raise GitHubBusError(trim_text(combined, 600))


def gh_json(args: list[str]) -> Any:
    proc = run_gh(args)
    text = (proc.stdout or "").strip()
    return json.loads(text) if text else None


def ensure_temp_body(text: str) -> Path:
    handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".md", delete=False)
    handle.write(text)
    handle.flush()
    handle.close()
    return Path(handle.name)


def task_bus_entry(bus_state: dict[str, Any], task_id: str) -> dict[str, Any]:
    return bus_state.setdefault("tasks", {}).setdefault(
        task_id,
        {
            "review_pr": None,
            "ops_issue": None,
            "last_review_hash": None,
            "last_issue_hash": None,
        },
    )


def build_template_body(config: dict[str, Any], template_key: str, variables: dict[str, Any]) -> str:
    template_rel = config.get("github_bus", {}).get("templates", {}).get(template_key)
    if not template_rel:
        raise GitHubBusError(f"Missing github_bus template config for {template_key}")
    template_path = SOURCE_ROOT / template_rel
    return render_template(template_path, variables).strip() + "\n"


def reviewer_handles(config: dict[str, Any], task: dict[str, Any]) -> list[str]:
    mapping = (config.get("github_bus", {}) or {}).get("reviewers", {}) or {}
    return list(mapping.get(task.get("reviewer"), []) or [])


def edit_label_args(labels: list[str]) -> list[str]:
    args: list[str] = []
    for label in labels:
        args.extend(["--add-label", label])
    return args


# repo -> labels this process gave up on, so it stops sending them
_LABELS_UNAVAILABLE: dict[str, set[str]] = {}
_MISSING_LABEL_RE = re.compile(r"'([^']+)' not found")


def usable_labels(repo: str, labels: list[str]) -> list[str]:
    """Drop labels this process already failed to create on `repo`.

    Pure filter, no API calls: the happy path must stay at one `gh` call, which
    is the ordering the bus tests pin -- create the PR or issue first, attach
    optional metadata second.
    """
    blocked = _LABELS_UNAVAILABLE.get(repo, set())
    return [label for label in labels if label not in blocked]


def repair_missing_label(
    config: dict[str, Any], repo: str, labels: list[str], exc: Exception
) -> bool:
    """Create the label `exc` complained about. True if the caller should retry.

    Every configured label was absent from this repository, so each sync failed
    the whole `gh pr edit` call and logged `'pantheon-bus' not found` -- twenty
    times in one hour, while every PR synced fine immediately afterwards without
    its labels. The noise mattered more than the labels did: it was twenty of the
    twenty-one failure events in that window, which is enough to bury a real one.

    So: create the label and retry once. If creation is impossible -- no
    permission, read-only token -- record that once and stop sending the label,
    which degrades to unlabelled PRs instead of a permanent error stream.
    """
    match = _MISSING_LABEL_RE.search(str(exc))
    if not match:
        return False
    label = match.group(1)
    if label not in labels:
        return False

    try:
        run_gh(["label", "create", label, "--repo", repo])
    except GitHubBusError as create_exc:
        _LABELS_UNAVAILABLE.setdefault(repo, set()).add(label)
        write_activity_log(
            config,
            {
                "type": "github_bus_label_unavailable",
                "message": (
                    f"label {label!r} is missing and could not be created; "
                    f"continuing without it: {create_exc}"
                ),
                "github_repo": repo,
            },
        )
        return False

    write_activity_log(
        config,
        {
            "type": "github_bus_label_created",
            "message": f"created missing bus label {label!r}",
            "github_repo": repo,
        },
    )
    return True


def review_branch_for_task(config: dict[str, Any], status: dict[str, Any], task: dict[str, Any]) -> str | None:
    candidate_branch = str(task.get("candidate_branch") or "").strip()
    if candidate_branch and candidate_branch != "not_applicable":
        return candidate_branch
    meta = task.get("github") or {}
    explicit = meta.get("head_branch")
    if explicit and branch_exists(str(explicit)):
        return str(explicit)

    owner = task.get("owner")
    for agent in status.get("agents", []):
        if agent.get("name") == owner:
            branch = agent.get("branch")
            if branch and branch_exists(str(branch)):
                return str(branch)

    branch = current_branch()
    if branch and branch != default_branch(config):
        return branch
    return None


def parse_number_from_url(url: str) -> int | None:
    match = re.search(r"/(issues|pull)/(\d+)$", url)
    if match:
        return int(match.group(2))
    return None


def find_existing_issue(repo: str, task_id: str) -> dict[str, Any] | None:
    data = gh_json(["issue", "list", "--repo", repo, "--state", "open", "--search", f'"[OpsBus] {task_id}" in:title', "--json", "number,title,url,state,labels"])
    if isinstance(data, list) and data:
        return data[0]
    return None


def find_existing_pr(repo: str, branch: str, base: str) -> dict[str, Any] | None:
    args = [
        "pr",
        "list",
        "--repo",
        repo,
        "--state",
        "open",
        "--head",
        branch,
        "--base",
        base,
        "--json",
        "number,title,url,headRefName,headRefOid,state",
    ]
    data = gh_json(args)
    if isinstance(data, list) and data:
        return data[0]
    return None


def bound_task_pr(task: dict[str, Any], branch: str, candidate_sha: str) -> dict[str, Any] | None:
    """Return the immutable PR reference recorded with a candidate handoff."""
    url = str(task.get("pr_url") or "").strip()
    number = parse_number_from_url(url)
    if not number:
        return None
    return {
        "number": number,
        "url": url,
        "branch": branch,
        "head_sha": candidate_sha,
        "state": "bound",
    }


def cached_pr_matches_candidate(review_pr: Any, branch: str, candidate_sha: str) -> bool:
    if not isinstance(review_pr, dict) or not review_pr.get("number"):
        return False
    return (
        str(review_pr.get("branch") or "") == branch
        and str(review_pr.get("head_sha") or "") == candidate_sha
    )


def sync_optional_pr_metadata(
    config: dict[str, Any],
    repo: str,
    task: dict[str, Any],
    number: int,
    labels: list[str],
) -> None:
    effective_labels = usable_labels(repo, labels)
    args = ["pr", "edit", str(number), "--repo", repo]
    args.extend(edit_label_args(effective_labels))
    if (config.get("github_bus", {}) or {}).get("auto_request_reviewers", True):
        for handle in reviewer_handles(config, task):
            args.extend(["--add-reviewer", handle])
    if len(args) == 5:
        return
    try:
        run_gh(args)
    except GitHubBusError as exc:
        if repair_missing_label(config, repo, effective_labels, exc):
            try:
                run_gh(args)
                return
            except GitHubBusError as retry_exc:
                exc = retry_exc
        write_activity_log(
            config,
            {
                "type": "github_review_pr_metadata_failed",
                "task_id": task["id"],
                "message": str(exc),
                "github_pr": number,
            },
        )


def sync_optional_issue_metadata(
    config: dict[str, Any],
    repo: str,
    task: dict[str, Any],
    number: int,
    labels: list[str],
) -> None:
    effective_labels = usable_labels(repo, labels)
    args = [
        "issue",
        "edit",
        str(number),
        "--repo",
        repo,
        *edit_label_args(effective_labels),
    ]
    if len(args) == 5:
        return
    try:
        run_gh(args)
    except GitHubBusError as exc:
        if repair_missing_label(config, repo, effective_labels, exc):
            try:
                run_gh(args)
                return
            except GitHubBusError as retry_exc:
                exc = retry_exc
        write_activity_log(
            config,
            {
                "type": "github_ops_issue_metadata_failed",
                "task_id": task["id"],
                "message": str(exc),
                "github_issue": number,
            },
        )


def upsert_ops_issue(config: dict[str, Any], bus_state: dict[str, Any], repo: str, task: dict[str, Any], reason: str, details: str) -> bool:
    entry = task_bus_entry(bus_state, task["id"])
    issue_ref = entry.get("ops_issue")
    labels = list((config.get("github_bus", {}) or {}).get("labels", {}).get("ops", []))
    variables = {
        "marker": COMMENT_MARKER,
        "task_id": task["id"],
        "task_title": task.get("title") or task["id"],
        "task_summary": task.get("summary_zh") or task.get("title") or task["id"],
        "task_status": task.get("status") or "unknown",
        "task_owner": task.get("owner") or "-",
        "task_reviewer": task.get("reviewer") or "-",
        "depends_on": ", ".join(task.get("depends_on", [])) or "-",
        "next_step": task.get("next") or "-",
        "reason": reason,
        "details": details,
    }
    body = build_template_body(config, "ops_issue", variables)
    title = f"[OpsBus] {task['id']} blocked: {trim_text(reason, 60) or task['title']}"
    issue_hash = json.dumps({"title": title, "body": body, "labels": labels}, ensure_ascii=False, sort_keys=True)
    if entry.get("last_issue_hash") == issue_hash and issue_ref:
        return False

    body_file = ensure_temp_body(body)
    try:
        if issue_ref and issue_ref.get("number"):
            number = int(issue_ref["number"])
            run_gh(["issue", "edit", str(number), "--repo", repo, "--title", title, "--body-file", str(body_file)])
            issue = dict(issue_ref)
        else:
            found = find_existing_issue(repo, task["id"])
            if found:
                number = int(found["number"])
                run_gh(["issue", "edit", str(number), "--repo", repo, "--title", title, "--body-file", str(body_file)])
                issue = {"number": number, "url": found.get("url"), "title": title}
            else:
                proc = run_gh(["issue", "create", "--repo", repo, "--title", title, "--body-file", str(body_file)])
                url = (proc.stdout or "").strip().splitlines()[-1]
                issue = {"number": parse_number_from_url(url), "url": url, "title": title}
        if issue.get("number"):
            sync_optional_issue_metadata(config, repo, task, int(issue["number"]), labels)
    finally:
        body_file.unlink(missing_ok=True)

    entry["ops_issue"] = {
        "number": issue.get("number"),
        "url": issue.get("url"),
        "title": title,
        "last_comment_id": (issue_ref or {}).get("last_comment_id"),
        "state": "open",
    }
    entry["last_issue_hash"] = issue_hash
    write_activity_log(
        config,
        {
            "type": "github_ops_issue_synced",
            "task_id": task["id"],
            "message": f"GitHub ops issue synced for {task['id']}",
            "github_url": entry["ops_issue"].get("url"),
        },
    )
    return True


def close_ops_issue(config: dict[str, Any], entry: dict[str, Any], task_id: str, reason: str, repo: str) -> bool:
    issue_ref = entry.get("ops_issue")
    if not issue_ref or not issue_ref.get("number"):
        return False
    if issue_ref.get("state") == "closed":
        return False
    number = int(issue_ref["number"])
    comment = f"{COMMENT_MARKER}\nResolved locally: {reason}".strip()
    run_gh(["issue", "close", str(number), "--repo", repo, "--comment", comment])
    issue_ref["state"] = "closed"
    write_activity_log(
        config,
        {
            "type": "github_ops_issue_closed",
            "task_id": task_id,
            "message": reason,
            "github_url": issue_ref.get("url"),
        },
    )
    return True


def upsert_review_pr(config: dict[str, Any], bus_state: dict[str, Any], status: dict[str, Any], repo: str, task: dict[str, Any]) -> bool:
    entry = task_bus_entry(bus_state, task["id"])
    pr_ref = entry.get("review_pr")
    candidate_sha = str(task.get("candidate_sha") or "").strip()
    if not candidate_sha or candidate_sha == "not_applicable":
        skip_hash = json.dumps(
            {"state": "skipped_no_candidate", "task_id": task["id"]},
            ensure_ascii=False,
            sort_keys=True,
        )
        if entry.get("last_review_hash") == skip_hash and (pr_ref or {}).get("state") == "skipped_no_candidate":
            return False
        entry["review_pr"] = {
            "number": None,
            "url": None,
            "title": f"[ReviewBus] {task['id']} {task['title']}",
            "branch": None,
            "state": "skipped_no_candidate",
        }
        entry["last_review_hash"] = skip_hash
        write_activity_log(
            config,
            {
                "type": "github_review_pr_skipped",
                "task_id": task["id"],
                "message": "Review task has no canonical candidate SHA; GitHub PR creation is not applicable.",
            },
        )
        return True
    branch = review_branch_for_task(config, status, task)
    if not branch:
        skip_hash = json.dumps({"state": "skipped_no_branch", "task_id": task["id"], "status": task.get("status")}, ensure_ascii=False, sort_keys=True)
        if entry.get("last_review_hash") == skip_hash and (entry.get("review_pr") or {}).get("state") == "skipped_no_branch":
            return False
        entry["review_pr"] = {
            "number": (pr_ref or {}).get("number"),
            "url": (pr_ref or {}).get("url"),
            "title": f"[ReviewBus] {task['id']} {task['title']}",
            "branch": None,
            "state": "skipped_no_branch",
        }
        entry["last_review_hash"] = skip_hash
        write_activity_log(
            config,
            {
                "type": "github_review_pr_skipped",
                "task_id": task["id"],
                "message": "Review task is in review, but no non-default local branch is available for PR creation.",
            },
        )
        return True

    base = default_branch(config)
    title = f"[ReviewBus] {task['id']} {task['title']}"
    head_sha = candidate_sha
    task_pr = bound_task_pr(task, branch, candidate_sha)
    if task_pr:
        if entry.get("review_pr") == task_pr:
            return False
        entry["review_pr"] = task_pr
        return True
    if not cached_pr_matches_candidate(pr_ref, branch, candidate_sha):
        pr_ref = None
        entry["review_pr"] = None
    variables = {
        "marker": COMMENT_MARKER,
        "task_id": task["id"],
        "task_title": task.get("title") or task["id"],
        "task_summary": task.get("summary_zh") or task.get("title") or task["id"],
        "task_status": task.get("status") or "review",
        "task_owner": task.get("owner") or "-",
        "task_reviewer": task.get("reviewer") or "-",
        "depends_on": ", ".join(task.get("depends_on", [])) or "-",
        "next_step": task.get("next") or "-",
        "artifacts": "\n".join(f"- `{item}`" for item in (task.get("artifacts") or [])) or "- (none listed)",
        "branch": branch,
        "base_branch": base,
    }
    body = build_template_body(config, "review_pr", variables)
    labels = list((config.get("github_bus", {}) or {}).get("labels", {}).get("review", []))
    pr_hash = json.dumps({"title": title, "body": body, "labels": labels, "branch": branch, "base": base, "head_sha": head_sha}, ensure_ascii=False, sort_keys=True)
    if entry.get("last_review_hash") == pr_hash and pr_ref:
        return False

    if not branch_has_diff(base, branch):
        entry["review_pr"] = {
            "number": (pr_ref or {}).get("number"),
            "url": (pr_ref or {}).get("url"),
            "title": title,
            "branch": branch,
            "state": "skipped_no_commits",
            "head_sha": head_sha,
        }
        entry["last_review_hash"] = pr_hash
        write_activity_log(
            config,
            {
                "type": "github_review_pr_skipped",
                "task_id": task["id"],
                "message": f"Review task is in review, but branch `{branch}` has no commits ahead of `{base}` yet.",
            },
        )
        return True

    body_file = ensure_temp_body(body)
    try:
        if pr_ref and pr_ref.get("number"):
            number = int(pr_ref["number"])
            run_gh(["pr", "edit", str(number), "--repo", repo, "--title", title, "--body-file", str(body_file)])
            pr = dict(pr_ref)
        else:
            found = find_existing_pr(repo, branch, base)
            if found:
                number = int(found["number"])
                if str(found.get("headRefOid") or "") != candidate_sha:
                    return False
                run_gh(["pr", "edit", str(number), "--repo", repo, "--title", title, "--body-file", str(body_file)])
                pr = {"number": number, "url": found.get("url"), "title": title, "headRefName": branch}
            else:
                create_args = ["pr", "create", "--repo", repo, "--draft", "--title", title, "--body-file", str(body_file), "--base", base, "--head", branch]
                proc = run_gh(create_args)
                url = (proc.stdout or "").strip().splitlines()[-1]
                pr = {"number": parse_number_from_url(url), "url": url, "title": title, "headRefName": branch}
    finally:
        body_file.unlink(missing_ok=True)

    # A PR only becomes ready once `handoff` locked the candidate SHA. Previous
    # owner checkpoints are never candidates, so they cannot start full CI.
    if pr.get("number"):
        sync_optional_pr_metadata(config, repo, task, int(pr["number"]), labels)
        observation = candidate_pr_observation(repo, int(pr["number"]))
        if observation.get("isDraft"):
            run_gh(["pr", "ready", str(pr["number"]), "--repo", repo])

    entry["review_pr"] = {
        "number": pr.get("number"),
        "url": pr.get("url"),
        "title": title,
        "branch": branch,
        "head_sha": candidate_sha,
        "state": "open",
    }
    entry["last_review_hash"] = pr_hash
    write_activity_log(
        config,
        {
            "type": "github_review_pr_synced",
            "task_id": task["id"],
            "message": f"GitHub review PR synced for {task['id']}",
            "github_url": entry["review_pr"].get("url"),
        },
    )
    return True


def run_ai_status(
    config: dict[str, Any],
    command: str,
    target: str,
    message: str,
    *,
    actor: str | None = None,
    extra_env: dict[str, str] | None = None,
) -> None:
    env: dict[str, str] = {}
    if actor:
        env["AI_NAME"] = actor
    env.update({key: value for key, value in (extra_env or {}).items() if value})
    result = run_task_board_command(
        config,
        command,
        [target, message],
        environ=env,
    )
    if not result.ok:
        raise GitHubBusError(trim_text(result.error, 600))


def candidate_pr_observation(repo: str, number: int) -> dict[str, Any]:
    data = gh_json(
        [
            "pr",
            "view",
            str(number),
            "--repo",
            repo,
            "--json",
            "url,state,isDraft,headRefName,headRefOid,mergeStateStatus,mergeCommit,statusCheckRollup",
        ]
    )
    if not isinstance(data, dict):
        raise GitHubBusError(f"GitHub did not return PR #{number} metadata")
    return data


def candidate_ci_status(observation: dict[str, Any]) -> tuple[str, str]:
    """Map GitHub's check rollup to the small lifecycle vocabulary."""
    if str(observation.get("state") or "").upper() == "MERGED":
        return "success", ""
    if str(observation.get("state") or "").upper() != "OPEN":
        return "closed", ""
    if str(observation.get("mergeStateStatus") or "").upper() == "DIRTY":
        return "merge_conflict", ""

    checks = observation.get("statusCheckRollup") or []
    if not isinstance(checks, list) or not checks:
        return "queued", ""
    details_url = ""
    pending = False
    for check in checks:
        if not isinstance(check, dict):
            continue
        conclusion = str(check.get("conclusion") or "").upper()
        status = str(check.get("status") or "").upper()
        details_url = details_url or str(check.get("detailsUrl") or "")
        if conclusion in {"FAILURE", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"}:
            return "failure", details_url
        if status != "COMPLETED" or not conclusion:
            pending = True
    return ("running" if pending else "success"), details_url


def candidate_pr_for_task(
    config: dict[str, Any],
    bus_state: dict[str, Any],
    repo: str,
    task: dict[str, Any],
) -> int | None:
    entry = task_bus_entry(bus_state, str(task.get("id") or ""))
    branch = str(task.get("candidate_branch") or "").strip()
    candidate_sha = str(task.get("candidate_sha") or "").strip()
    task_pr = bound_task_pr(task, branch, candidate_sha)
    if task_pr:
        entry["review_pr"] = task_pr
        return int(task_pr["number"])

    review_pr = entry.get("review_pr")
    if cached_pr_matches_candidate(review_pr, branch, candidate_sha):
        return int(review_pr["number"])
    if review_pr:
        # A task can be re-handed-off with a new candidate. Never let the
        # previous PR's head invalidate the replacement candidate.
        entry["review_pr"] = None

    if not branch or branch == "not_applicable":
        return None
    found = find_existing_pr(repo, branch, default_branch(config))
    if not found or not found.get("number") or str(found.get("headRefOid") or "") != candidate_sha:
        return None
    entry["review_pr"] = {
        "number": found["number"],
        "url": found.get("url"),
        "branch": branch,
        "head_sha": candidate_sha,
        "state": "open",
    }
    return int(found["number"])


def reconcile_candidate_lifecycle(
    config: dict[str, Any],
    bus_state: dict[str, Any],
    status: dict[str, Any],
    repo: str,
) -> bool:
    """Write GitHub CI/merge evidence only through ai-status' candidate transaction."""
    if not (config.get("github_bus", {}) or {}).get("candidate_reconcile_enabled", True):
        return False

    changed = False
    for task in status.get("tasks", []):
        if task.get("status") not in {"review", "integrating"}:
            continue
        candidate_sha = str(task.get("candidate_sha") or "").strip()
        if not candidate_sha or candidate_sha == "not_applicable":
            continue
        number = candidate_pr_for_task(config, bus_state, repo, task)
        if not number:
            continue
        observation = candidate_pr_observation(repo, number)
        head_sha = str(observation.get("headRefOid") or "").strip()
        ci_status, ci_run_url = candidate_ci_status(observation)
        merge = observation.get("mergeCommit") or {}
        merge_sha = str(merge.get("oid") or "").strip() if isinstance(merge, dict) else ""
        env = {
            "CANDIDATE_HEAD_SHA": head_sha,
            "CANDIDATE_CI_STATUS": ci_status,
            "CANDIDATE_BRANCH": str(observation.get("headRefName") or task.get("candidate_branch") or ""),
            "PR_URL": str(observation.get("url") or ""),
            "CI_RUN_URL": ci_run_url,
            "MERGE_SHA": merge_sha,
        }
        # Polling is intentionally frequent. Do not turn an unchanged GitHub
        # observation into a second state transaction or another worker wakeup.
        observed_fields = {
            "ci_sha": head_sha,
            "ci_status": ci_status,
            "candidate_branch": env["CANDIDATE_BRANCH"],
            "pr_url": env["PR_URL"],
            "ci_run_url": ci_run_url,
            "merge_sha": merge_sha,
        }
        if candidate_sha == head_sha and all(
            str(task.get(field) or "") == value
            for field, value in observed_fields.items()
        ):
            continue
        run_ai_status(
            config,
            "reconcile-candidate",
            str(task["id"]),
            f"GitHub reconciled candidate {candidate_sha[:12]} from PR #{number}.",
            actor="Supervisor",
            extra_env=env,
        )
        entry = task_bus_entry(bus_state, str(task["id"]))
        entry["review_pr"] = {
            "number": number,
            "url": observation.get("url"),
            "branch": observation.get("headRefName"),
            "head_sha": head_sha,
            "state": str(observation.get("state") or "").lower(),
        }
        changed = True
    return changed


def request_candidate_auto_merge(
    config: dict[str, Any],
    bus_state: dict[str, Any],
    status: dict[str, Any],
    repo: str,
) -> bool:
    settings = (config.get("github_bus", {}) or {}).get("auto_merge", {}) or {}
    if not settings.get("enabled", False):
        return False
    changed = False
    for task in status.get("tasks", []):
        if task.get("status") != "integrating":
            continue
        candidate_sha = str(task.get("candidate_sha") or "")
        if not candidate_sha or task.get("reviewed_sha") != candidate_sha:
            continue
        if task.get("ci_sha") != candidate_sha or task.get("ci_status") != "success":
            continue
        number = candidate_pr_for_task(config, bus_state, repo, task)
        if not number:
            continue
        entry = task_bus_entry(bus_state, str(task["id"]))
        if entry.get("auto_merge_candidate_sha") == candidate_sha:
            continue
        # Everything above establishes that the candidate was green on its own
        # head. This asks the question those gates cannot: is it still green on
        # top of the dev it is about to land on?
        integrates, detail = integrates_cleanly_with_dev(config, candidate_sha)
        if not integrates:
            if entry.get("premerge_blocked_sha") != candidate_sha:
                entry["premerge_blocked_sha"] = candidate_sha
                write_activity_log(
                    config,
                    {
                        "type": "candidate_premerge_check_failed",
                        "task_id": task.get("id"),
                        "message": trim_text(detail, 600),
                        "github_pr": number,
                    },
                )
            continue
        entry.pop("premerge_blocked_sha", None)
        try:
            run_gh(["pr", "merge", str(number), "--repo", repo, "--auto", "--squash"])
        except GitHubBusError as exc:
            write_activity_log(
                config,
                {
                    "type": "candidate_auto_merge_deferred",
                    "task_id": task.get("id"),
                    "message": trim_text(str(exc), 600),
                    "github_pr": number,
                },
            )
            continue
        entry["auto_merge_candidate_sha"] = candidate_sha
        write_activity_log(
            config,
            {
                "type": "candidate_auto_merge_requested",
                "task_id": task.get("id"),
                "message": f"Requested auto-merge for reviewed, same-SHA candidate {candidate_sha[:12]}.",
                "github_pr": number,
            },
        )
        changed = True
    return changed


def post_issue_comment(repo: str, issue_number: int, body: str) -> None:
    run_gh(["issue", "comment", str(issue_number), "--repo", repo, "--body", body])


def allowed_logins(config: dict[str, Any], task: dict[str, Any] | None = None) -> set[str]:
    mapping = (config.get("github_bus", {}) or {}).get("reviewers", {}) or {}
    values: set[str] = set()
    for handles in mapping.values():
        for handle in handles or []:
            values.add(handle)
    if task:
        for handle in mapping.get(task.get("reviewer"), []) or []:
            values.add(handle)
    return values


def comment_key(kind: str, item_id: int | str) -> str:
    return f"{kind}:{item_id}"


def resolve_task(
    status: dict[str, Any],
    task_id: str | None,
    fallback_task: dict[str, Any] | None = None,
) -> tuple[str | None, dict[str, Any] | None]:
    if task_id:
        normalized = task_id.strip()
        for item in status.get("tasks", []):
            if str(item.get("id")) == normalized:
                return str(item.get("id")), item
        lowered = normalized.lower()
        for item in status.get("tasks", []):
            if str(item.get("id") or "").lower() == lowered:
                return str(item.get("id")), item
    if fallback_task:
        return str(fallback_task.get("id")), fallback_task
    return task_id, None


def apply_bus_command(
    config: dict[str, Any],
    bus_state: dict[str, Any],
    status: dict[str, Any],
    repo: str,
    command: GitHubCommand,
    actor: str,
    *,
    task: dict[str, Any] | None = None,
    issue_number: int | None = None,
) -> tuple[bool, str]:
    task_id, target_task = resolve_task(status, command.target or (task or {}).get("id"), fallback_task=task)
    changed = False
    reply = ""
    owner = str((target_task or task or {}).get("owner") or "").strip() or None
    reviewer = str((target_task or task or {}).get("reviewer") or "").strip() or None

    if command.verb == "approve" and target_task:
        if target_task.get("status") == "review":
            run_ai_status(
                config,
                "approve",
                task_id,
                f"GitHub approval bus approved via {'issue #' + str(issue_number) if issue_number else 'relay/webhook'} by @{actor}.",
                actor=reviewer,
                extra_env={"REVIEWED_SHA": str(target_task.get("candidate_sha") or "")},
            )
        else:
            run_ai_status(
                config,
                "reopen",
                task_id,
                f"GitHub approval bus approved via {'issue #' + str(issue_number) if issue_number else 'relay/webhook'} by @{actor}; resuming work.",
                actor=owner or reviewer,
            )
        reply = f"Applied `/approve` to `{task_id}`."
        changed = True
    elif command.verb == "deny" and target_task:
        if target_task.get("status") == "review":
            run_ai_status(
                config,
                "reopen",
                task_id,
                f"GitHub approval bus denied via {'issue #' + str(issue_number) if issue_number else 'relay/webhook'} by @{actor}; returning to implementation.",
                actor=reviewer or owner,
            )
        else:
            run_ai_status(
                config,
                "note",
                task_id,
                f"GitHub approval bus denial noted via {'issue #' + str(issue_number) if issue_number else 'relay/webhook'} by @{actor}.",
                actor=owner or reviewer,
            )
        reply = f"Recorded `/deny` for `{task_id}`."
        changed = True
    elif command.verb == "retry" and target_task:
        run_ai_status(
            config,
            "reopen",
            task_id,
            f"GitHub retry requested via {'issue #' + str(issue_number) if issue_number else 'relay/webhook'} by @{actor}.",
            actor=owner or reviewer,
        )
        queue_resume_for_task(config, target_task)
        reply = f"Queued retry for `{task_id}`."
        changed = True
    elif command.verb == "resume" and command.target:
        changed = queue_resume_for_agent(config, status, command.target)
        reply = f"Queued resume for `{command.target}`." if changed else f"No resumable task found for `{command.target}`."
    elif command.verb == "recheck" and target_task:
        entry = task_bus_entry(bus_state, task_id)
        entry["last_issue_hash"] = None
        entry["last_review_hash"] = None
        reply = f"Cleared cached GitHub sync hashes for `{task_id}`; it will be re-synced on the next poll."
        changed = True
    elif command.verb == "status":
        reply = task_summary_line(target_task or task or {"id": task_id or "-", "status": "unknown", "owner": "-", "reviewer": "-", "next": "-"})
    else:
        reply = f"Unsupported or incomplete command `{command.raw}`."

    if changed:
        write_activity_log(
            config,
            {
                "type": "github_issue_command_applied" if issue_number else "github_remote_command_applied",
                "task_id": task_id if target_task else (task or {}).get("id"),
                "message": f"Applied GitHub command `{command.raw}` from @{actor}.",
                "github_issue": issue_number,
            },
        )
    return changed, reply


def process_issue_command(
    config: dict[str, Any],
    bus_state: dict[str, Any],
    status: dict[str, Any],
    repo: str,
    issue_number: int,
    task: dict[str, Any],
    command: GitHubCommand,
    actor: str,
) -> bool:
    changed, reply_text = apply_bus_command(
        config,
        bus_state,
        status,
        repo,
        command,
        actor,
        task=task,
        issue_number=issue_number,
    )
    reply = f"{COMMENT_MARKER}\n{reply_text}"

    if reply:
        post_issue_comment(repo, issue_number, reply)
    return changed


def task_summary_line(task: dict[str, Any]) -> str:
    return (
        f"Task `{task.get('id')}` is `{task.get('status')}`; "
        f"owner=`{task.get('owner')}`, reviewer=`{task.get('reviewer')}`, next={trim_text(task.get('next') or '-', 120)}"
    )


def queue_resume_for_task(config: dict[str, Any], task: dict[str, Any]) -> bool:
    target_agent = task.get("owner")
    if not target_agent:
        return False
    event = {
        "key": f"github-resume:{task['id']}:{target_agent}:{utc_now()}",
        "task_id": task.get("id"),
        "target_agent": target_agent,
        "reason": "github_retry",
        "task": {
            "id": task.get("id"),
            "artifacts": task.get("artifacts") or [],
            "next": task.get("next"),
        },
    }
    message = render_wakeup_message(config, event, target_agent)
    payload = {
        "event_id": f"github-{task['id']}-{_iso_now_dt().strftime('%Y%m%dT%H%M%SZ')}",
        "created_at": utc_now(),
        "event_key": event["key"],
        "task_id": task.get("id"),
        "target_agent": agent_config_for(config, target_agent)["id"],
        "target_display_name": target_agent,
        "provider": agent_config_for(config, target_agent).get("provider", target_agent),
        "reason": "github_retry",
        "message": message,
        "context_files": [relpath(path) for path in selected_shared_files(config)],
        "target_files": task.get("artifacts") or [],
        "metadata": {"task": {"id": task.get("id")}},
    }
    enqueue_event(config, payload)
    write_activity_log(
        config,
        {
            "type": "github_resume_queued",
            "task_id": task.get("id"),
            "target_agent": target_agent,
            "message": "Queued resume wake-up from GitHub approval bus.",
            "queue_event_id": payload["event_id"],
        },
    )
    return True


def queue_resume_for_agent(config: dict[str, Any], status: dict[str, Any], agent_name: str) -> bool:
    target = agent_name.strip().title()
    candidates = [
        task
        for task in status.get("tasks", [])
        if task.get("owner") == target and task.get("status") in {"todo", "in_progress", "review", "blocked"}
    ]
    if not candidates:
        return False
    prioritized = sorted(candidates, key=lambda task: (task.get("status") != "in_progress", task.get("last_update") or ""), reverse=False)
    return queue_resume_for_task(config, prioritized[0])


def poll_issue_comments(config: dict[str, Any], bus_state: dict[str, Any], status: dict[str, Any], repo: str) -> bool:
    changed = False
    seen = set(bus_state.get("processed_comment_ids", []))
    for task in status.get("tasks", []):
        entry = (bus_state.get("tasks", {}) or {}).get(task["id"]) or {}
        issue_ref = entry.get("ops_issue") or {}
        number = issue_ref.get("number")
        if not number:
            continue
        comments = gh_json(["api", f"repos/{repo}/issues/{number}/comments?per_page=100"])
        if not isinstance(comments, list):
            continue
        allowed = allowed_logins(config, task)
        for comment in comments:
            comment_id = comment.get("id")
            if comment_id is None:
                continue
            key = comment_key("issue", comment_id)
            if key in seen:
                continue
            body = comment.get("body") or ""
            if COMMENT_MARKER in body:
                seen.add(key)
                continue
            actor = ((comment.get("user") or {}).get("login") or "").strip()
            if allowed and actor not in allowed:
                seen.add(key)
                continue
            command = parse_command(body)
            if not command:
                seen.add(key)
                continue
            process_issue_command(config, bus_state, status, repo, int(number), task, command, actor)
            seen.add(key)
            changed = True
    bus_state["processed_comment_ids"] = list(seen)
    return changed


def poll_pr_reviews(config: dict[str, Any], bus_state: dict[str, Any], status: dict[str, Any], repo: str) -> bool:
    changed = False
    seen = set(bus_state.get("processed_review_ids", []))
    for task in status.get("tasks", []):
        entry = (bus_state.get("tasks", {}) or {}).get(task["id"]) or {}
        pr_ref = entry.get("review_pr") or {}
        number = pr_ref.get("number")
        if not number:
            continue
        reviews = gh_json(["api", f"repos/{repo}/pulls/{number}/reviews?per_page=100"])
        if not isinstance(reviews, list):
            continue
        allowed = allowed_logins(config, task)
        for review in reviews:
            review_id = review.get("id")
            if review_id is None:
                continue
            key = comment_key("review", review_id)
            if key in seen:
                continue
            actor = ((review.get("user") or {}).get("login") or "").strip()
            if allowed and actor not in allowed:
                seen.add(key)
                continue
            state_value = str(review.get("state") or "").upper()
            body = trim_text(review.get("body"), 240)
            if state_value == "APPROVED":
                run_ai_status(
                    config,
                    "approve",
                    task["id"],
                    f"GitHub PR approved via PR #{number} by @{actor}.",
                    actor=str(task.get("reviewer") or "").strip() or None,
                    extra_env={"REVIEWED_SHA": str(review.get("commit_id") or task.get("candidate_sha") or "")},
                )
                write_activity_log(config, {"type": "github_candidate_approved", "task_id": task["id"], "message": f"PR #{number} approved by @{actor}.", "github_pr": number})
                changed = True
            elif state_value == "CHANGES_REQUESTED":
                detail = f"GitHub PR requested changes via PR #{number} by @{actor}."
                if body:
                    detail += f" {body}"
                run_ai_status(
                    config,
                    "reopen",
                    task["id"],
                    detail,
                    actor=str(task.get("reviewer") or task.get("owner") or "").strip() or None,
                )
                write_activity_log(config, {"type": "github_review_changes_requested", "task_id": task["id"], "message": detail, "github_pr": number})
                changed = True
            elif state_value == "COMMENTED":
                note = f"GitHub PR comment via PR #{number} by @{actor}."
                if body:
                    note += f" {body}"
                run_ai_status(
                    config,
                    "note",
                    task["id"],
                    note,
                    actor=str(task.get("reviewer") or task.get("owner") or "").strip() or None,
                )
                changed = True
            seen.add(key)
    bus_state["processed_review_ids"] = list(seen)
    return changed


def sync_outbound(config: dict[str, Any], bus_state: dict[str, Any], status: dict[str, Any], runtime_state: dict[str, Any], repo: str) -> bool:
    changed = False
    blocked_tasks = {task.get("id"): task for task in status.get("tasks", []) if task.get("status") == "blocked"}
    candidate_tasks = [
        task for task in status.get("tasks", []) if task.get("status") in {"review", "integrating"}
    ]

    blocker_by_task = {item.get("task_id"): item for item in status.get("blockers", []) if item.get("status") == "open"}

    for task in candidate_tasks:
        try:
            changed = upsert_review_pr(config, bus_state, status, repo, task) or changed
        except GitHubBusError as exc:
            write_activity_log(
                config,
                {
                    "type": "github_review_pr_failed",
                    "task_id": task.get("id"),
                    "message": trim_text(str(exc), 600),
                    "github_repo": repo,
                },
            )

    for task_id, task in blocked_tasks.items():
        blocker = blocker_by_task.get(task_id)
        reason = blocker.get("message") if blocker else (task.get("next") or "Task is blocked")
        details = f"Waiting for: {blocker.get('waiting_for')}" if blocker else (task.get("waiting_for") or "-")
        try:
            changed = upsert_ops_issue(config, bus_state, repo, task, reason, details) or changed
        except GitHubBusError as exc:
            write_activity_log(
                config,
                {
                    "type": "github_ops_issue_failed",
                    "task_id": task.get("id"),
                    "message": trim_text(str(exc), 600),
                    "github_repo": repo,
                },
            )

    if (config.get("github_bus", {}) or {}).get("close_resolved_issues", True):
        for task_id, entry in bus_state.get("tasks", {}).items():
            if task_id in blocked_tasks:
                continue
            if entry.get("ops_issue") and entry["ops_issue"].get("state") != "closed":
                task = next((item for item in status.get("tasks", []) if item.get("id") == task_id), None)
                reason = f"Task status is now `{task.get('status')}`." if task else "Task no longer requires an ops issue."
                changed = close_ops_issue(config, entry, task_id, reason, repo) or changed

    return changed


def should_skip_for_offline_backoff(config: dict[str, Any], bus_state: dict[str, Any]) -> bool:
    offline_until = _parse_iso(bus_state.get("offline_until"))
    if not offline_until:
        return False
    return _iso_now_dt() < offline_until


def mark_offline(config: dict[str, Any], bus_state: dict[str, Any], error: str) -> None:
    backoff = int((config.get("github_bus", {}) or {}).get("offline_backoff_seconds", 300))
    bus_state["offline_until"] = (_iso_now_dt() + timedelta(seconds=backoff)).isoformat().replace("+00:00", "Z")
    if bus_state.get("last_error") != error:
        write_activity_log(config, {"type": "github_bus_offline", "message": error})
    bus_state["last_error"] = error


def integrates_cleanly_with_dev(
    config: dict[str, Any], candidate_sha: str, integration_ref: str = "origin/dev"
) -> tuple[bool, str]:
    """Does this candidate still pass once it sits on top of current dev?

    The green CI recorded against a candidate describes that candidate's own
    head. dev moves underneath it, and the gates above cannot see that: on
    2026-08-17, #1461 (permission_broker.py) and #1462 (common.py) shared no
    changed file at all, each merged green 45 seconds apart, and together broke
    dev -- one's new test called a function whose contract the other had
    changed. No file-overlap heuristic sees that shape; only running the suite
    with both changes applied does.

    Reconstructed, it costs 13 seconds locally and no GitHub CI quota at all,
    which is why this is done here rather than by requiring every branch to be
    up to date -- that re-runs the full product suite per rebase, and this repo
    is already being rate-limited on action downloads.

    Scope is the orchestrator suite. Product changes are not covered and do not
    need to be: they go through the full pipeline on GitHub. This closes the
    tool-only fast path, which is where the collision happened.
    """
    try:
        repo_root = config_path(config, "status_file").parent
    except KeyError as exc:
        # A gate must never be the reason something else fails. If this check
        # cannot even locate the repository, it abstains rather than blocking.
        return True, f"pre-merge check skipped: {exc}"
    tools_dir = "tools/development-orchestrator"
    with tempfile.TemporaryDirectory(prefix="premerge-") as tmpdir:
        tree = Path(tmpdir) / "candidate"
        add = _git(repo_root, "worktree", "add", "--detach", str(tree), integration_ref)
        if add.returncode != 0:
            # Never block a merge because the check itself could not run.
            return True, f"pre-merge check skipped: {trim_text(add.stderr, 200)}"
        try:
            merged = _git(tree, "merge", "--no-edit", candidate_sha)
            if merged.returncode != 0:
                return False, f"candidate does not merge into {integration_ref} cleanly"
            proc = subprocess.run(
                [sys.executable, "-m", "unittest", "discover", "-s", ".", "-p", "test_*.py"],
                cwd=str(tree / tools_dir),
                capture_output=True,
                text=True,
                timeout=900,
                env={**os.environ, "ORCH_STATUS_ROOT": str(tree)},
            )
            if proc.returncode != 0:
                tail = "\n".join((proc.stderr or proc.stdout or "").strip().splitlines()[-8:])
                return False, f"orchestrator suite fails on top of {integration_ref}:\n{tail}"
            summary = next(
                (ln for ln in (proc.stderr or "").splitlines() if ln.startswith("Ran ")), "suite passed"
            )
            return True, f"{summary} on top of {integration_ref}"
        except (OSError, subprocess.SubprocessError) as exc:
            return True, f"pre-merge check skipped: {type(exc).__name__}: {exc}"
        finally:
            _git(repo_root, "worktree", "remove", "--force", str(tree))


def _git(cwd: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=str(cwd), capture_output=True, text=True, check=False, timeout=180
    )


def sync_github_bus(config: dict[str, Any], runtime_state: dict[str, Any]) -> bool:
    bus_cfg = config.get("github_bus", {}) or {}
    if not bus_cfg.get("enabled", False):
        return False

    bus_state = load_bus_state(config)
    if should_skip_for_offline_backoff(config, bus_state):
        return False

    last_sync = _parse_iso(bus_state.get("last_sync_at"))
    interval = int(bus_cfg.get("poll_interval_seconds", 30))
    if last_sync and (_iso_now_dt() - last_sync).total_seconds() < interval:
        return False

    repo = infer_repo_slug(config, bus_state)
    if not repo:
        mark_offline(config, bus_state, "Could not infer GitHub repo slug from config or git remote.")
        save_bus_state(config, bus_state)
        return False

    status = load_status(config)
    bus_state["repo"] = repo

    try:
        changed = False
        changed = sync_outbound(config, bus_state, status, runtime_state, repo) or changed
        status = load_status(config)
        changed = reconcile_candidate_lifecycle(config, bus_state, status, repo) or changed
        status = load_status(config)
        changed = poll_pr_reviews(config, bus_state, status, repo) or changed
        status = load_status(config)
        changed = reconcile_candidate_lifecycle(config, bus_state, status, repo) or changed
        status = load_status(config)
        changed = request_candidate_auto_merge(config, bus_state, status, repo) or changed
        status = load_status(config)
        changed = poll_issue_comments(config, bus_state, status, repo) or changed
        status = load_status(config)
        bus_state["offline_until"] = None
        bus_state["last_error"] = None
        save_bus_state(config, bus_state)
        return changed
    except GitHubBusOffline as exc:
        mark_offline(config, bus_state, str(exc))
        save_bus_state(config, bus_state)
        return False
    except Exception as exc:  # pragma: no cover - defensive bus isolation
        mark_offline(config, bus_state, f"GitHub bus error: {trim_text(str(exc), 600)}")
        save_bus_state(config, bus_state)
        return False


if __name__ == "__main__":
    raise SystemExit("Use sync_github_bus() from tools/development-orchestrator/control_plane/runtime/supervisor_runtime.py")
