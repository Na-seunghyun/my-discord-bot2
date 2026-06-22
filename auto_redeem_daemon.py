#!/usr/bin/env python3
"""
Small tmux-friendly Auto Redeem runner.

Required environment variables:
  HUB_BASE_URL   Example: https://my-discord-bot2.looloo90.workers.dev
  ADMIN_TOKEN    Same value as the Cloudflare Worker ADMIN_TOKEN secret

Optional:
  AUTO_REDEEM_DAEMON_INTERVAL  Seconds between runs, default 600
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request


BASE_URL = os.getenv("HUB_BASE_URL", "https://my-discord-bot2.looloo90.workers.dev").rstrip("/")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
INTERVAL = max(60, int(os.getenv("AUTO_REDEEM_DAEMON_INTERVAL", "600")))


def post_json(path: str) -> dict:
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=b"{}",
        method="POST",
        headers={
            "content-type": "application/json",
            "x-admin-token": ADMIN_TOKEN,
        },
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read().decode("utf-8", "replace")
    return json.loads(raw or "{}")


def run_once() -> None:
    started = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        result = post_json("/api/redeem/run")
        discovery = result.get("discovery") or {}
        jobs = result.get("jobs") or {}
        print(
            json.dumps(
                {
                    "time": started,
                    "ok": result.get("ok"),
                    "active": len(discovery.get("active") or []),
                    "discovered": len(discovery.get("discovered") or []),
                    "jobsProcessed": jobs.get("processed", 0),
                    "success": jobs.get("success", 0),
                    "failed": jobs.get("failed", 0),
                    "errors": discovery.get("errors") or [],
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")
        print(f"{started} HTTP {error.code}: {detail}", flush=True)
    except Exception as error:
        print(f"{started} ERROR: {error}", flush=True)


def main() -> int:
    if not ADMIN_TOKEN:
        print("ADMIN_TOKEN is required.", file=sys.stderr)
        return 2

    print(f"Auto Redeem daemon started. base={BASE_URL} interval={INTERVAL}s", flush=True)
    while True:
        run_once()
        time.sleep(INTERVAL)


if __name__ == "__main__":
    raise SystemExit(main())
