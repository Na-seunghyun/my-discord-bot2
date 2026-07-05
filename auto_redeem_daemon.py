#!/usr/bin/env python3
"""
Tmux-friendly Kingshot Auto Redeem runner.

This daemon claims pending redeem jobs from the Worker, redeems them through the
official Kingshot gift-code page with Playwright, then reports the result back
to the Worker/Supabase queue.

Required environment variables:
  HUB_BASE_URL   Example: https://my-discord-bot2.looloo90.workers.dev
  ADMIN_TOKEN    Same value as the Cloudflare Worker ADMIN_TOKEN secret

Optional:
  AUTO_REDEEM_DAEMON_INTERVAL    Idle seconds when no jobs exist, default 60
  AUTO_REDEEM_DAEMON_REST_SECONDS Seconds to rest after a non-empty batch, default 5
  AUTO_REDEEM_DAEMON_BATCH_SIZE  Jobs per loop, default 20
  AUTO_REDEEM_DAEMON_CONCURRENCY Pages processed at once, default 2
  AUTO_REDEEM_DAEMON_TIMEOUT_MS  Browser action timeout, default 2500
  AUTO_REDEEM_DAEMON_HEADLESS    true/false, default true
"""

import asyncio
import json
import os
import sys
import time
import urllib.error
import urllib.request

try:
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError
    from playwright.async_api import async_playwright
except Exception:  # pragma: no cover - shown to the server operator
    async_playwright = None
    PlaywrightTimeoutError = TimeoutError


BASE_URL = os.getenv("HUB_BASE_URL", "https://my-discord-bot2.looloo90.workers.dev").rstrip("/")
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "")
INTERVAL = max(10, int(os.getenv("AUTO_REDEEM_DAEMON_INTERVAL", "60")))
REST_SECONDS = max(0.0, float(os.getenv("AUTO_REDEEM_DAEMON_REST_SECONDS", "5")))
BATCH_SIZE = max(1, min(30, int(os.getenv("AUTO_REDEEM_DAEMON_BATCH_SIZE", "20"))))
CONCURRENCY = max(1, min(4, int(os.getenv("AUTO_REDEEM_DAEMON_CONCURRENCY", "2"))))
TIMEOUT_MS = max(800, int(os.getenv("AUTO_REDEEM_DAEMON_TIMEOUT_MS", "2500")))
HEADLESS = os.getenv("AUTO_REDEEM_DAEMON_HEADLESS", "true").strip().lower() not in {"0", "false", "no", "off"}
OFFICIAL_REDEEM_URL = "https://ks-giftcode.centurygame.com/"
USER_AGENT = os.getenv(
    "AUTO_REDEEM_DAEMON_USER_AGENT",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 NashshAutoRedeem/2.0",
)


def request_json(path: str, payload: dict | None = None) -> dict:
    body = json.dumps(payload or {}).encode("utf-8")
    request = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=body,
        method="POST",
        headers={
            "accept": "application/json",
            "content-type": "application/json",
            "user-agent": USER_AGENT,
            "x-admin-token": ADMIN_TOKEN,
            "x-auto-redeem-runner": "putty-browser-daemon",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode("utf-8", "replace")
    return json.loads(raw or "{}")


def classify_message(message: str) -> tuple[str, bool]:
    text = (message or "").strip()
    lower = text.lower()
    if "redeemed, please claim" in lower or "claim the rewards in your mail" in lower:
        return "success", True
    if "same gift code" in lower or "only be redeemed once" in lower or "already claimed" in lower:
        return "already_claimed", False
    if "gift code not found" in lower or "case-sensitive" in lower or "invalid code" in lower:
        return "invalid_code", False
    if "expired" in lower or "no longer valid" in lower:
        return "expired", False
    if "time error" in lower or "redemption time" in lower or "exchange time" in lower:
        return "time_window_closed", False
    if "server busy" in lower or "try again later" in lower:
        return "server_busy", False
    if "too frequent" in lower or "too many" in lower or "rate limit" in lower:
        return "rate_limited", False
    if "captcha" in lower or "verification" in lower or "verify" in lower:
        return "captcha_required", False
    if "player not found" in lower or "invalid player" in lower or "double check player" in lower:
        return "player_not_found", False
    return "failed", False


async def read_modal_message(page) -> str:
    try:
        await page.wait_for_selector("div.message_modal", timeout=TIMEOUT_MS * 3)
        return (await page.inner_text("div.modal_content .msg", timeout=TIMEOUT_MS)).strip()
    except Exception:
        return ""


async def close_modal(page) -> None:
    for selector in ("div.confirm_btn", "button:has-text('OK')", "button:has-text('Confirm')"):
        try:
            locator = page.locator(selector).first
            if await locator.is_visible(timeout=500):
                await locator.click(timeout=TIMEOUT_MS)
                return
        except Exception:
            pass


async def exit_player_panel(page) -> None:
    try:
        locator = page.locator("div.exit_con").first
        if await locator.is_visible(timeout=700):
            await locator.click(timeout=TIMEOUT_MS)
    except Exception:
        pass


async def detect_blocked_or_unready(page) -> str:
    try:
        content = (await page.content()).lower()
    except Exception:
        return ""
    if "captcha" in content or "challenge" in content or "verify you are human" in content:
        return "captcha_required"
    return ""


async def redeem_one(page, job: dict) -> dict:
    job_key = str(job.get("jobKey") or "")
    player_id = str(job.get("playerId") or "")
    gift_code = str(job.get("giftCode") or "")
    attempts = int(job.get("attempts") or 0)

    result = {
        "jobKey": job_key,
        "playerId": player_id,
        "giftCode": gift_code,
        "attempts": attempts,
        "ok": False,
        "status": "failed",
        "message": "",
        "response": {"source": "putty-browser-daemon"},
    }

    try:
        await page.goto(OFFICIAL_REDEEM_URL, wait_until="domcontentloaded", timeout=TIMEOUT_MS * 8)
        blocked = await detect_blocked_or_unready(page)
        if blocked:
            result.update(status=blocked, message="Official page requires verification.")
            return result

        await page.fill("input[placeholder='Player ID']", player_id, timeout=TIMEOUT_MS * 4)
        await page.click("div.btn.login_btn", timeout=TIMEOUT_MS * 4)
        await page.wait_for_timeout(900)

        login_message = await read_modal_message(page)
        if login_message:
            await close_modal(page)
            status, ok = classify_message(login_message)
            if status == "failed":
                status = "server_busy" if "server busy" in login_message.lower() else "player_not_found"
            result.update(status=status, ok=ok, message=login_message)
            return result

        try:
            player_nick = (await page.inner_text("p.name", timeout=TIMEOUT_MS * 5)).strip()
        except Exception:
            blocked = await detect_blocked_or_unready(page)
            result.update(
                status=blocked or "timeout",
                message="Player login did not complete before timeout.",
            )
            return result

        await page.fill("input[placeholder='Enter Gift Code']", gift_code, timeout=TIMEOUT_MS * 4)
        await page.click("div.btn.exchange_btn", timeout=TIMEOUT_MS * 4)
        await page.wait_for_timeout(900)

        modal_text = await read_modal_message(page)
        if not modal_text:
            result.update(status="timeout", message="No confirmation modal appeared.")
            return result

        await close_modal(page)
        await exit_player_panel(page)

        status, ok = classify_message(modal_text)
        result.update(
            status=status,
            ok=ok,
            message=modal_text,
            playerNick=player_nick,
            response={
                "source": "putty-browser-daemon",
                "player_nick": player_nick,
                "message": modal_text,
            },
        )
        return result
    except PlaywrightTimeoutError as error:
        result.update(status="timeout", message=f"Timeout: {error}")
        return result
    except Exception as error:
        result.update(status="network_error", message=str(error))
        return result


async def redeem_jobs(jobs: list[dict]) -> list[dict]:
    if not jobs:
        return []
    if async_playwright is None:
        return [
            {
                "jobKey": job.get("jobKey"),
                "playerId": job.get("playerId"),
                "giftCode": job.get("giftCode"),
                "attempts": job.get("attempts"),
                "ok": False,
                "status": "failed",
                "message": "Playwright is not installed. Run: pip install -r requirements.txt && python3 -m playwright install chromium",
            }
            for job in jobs
        ]

    results: list[dict] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=HEADLESS)
        semaphore = asyncio.Semaphore(CONCURRENCY)
        ordered_results: list[dict | None] = [None] * len(jobs)

        async def run_one(index: int, job: dict) -> None:
            async with semaphore:
                page = await browser.new_page(user_agent=USER_AGENT, viewport={"width": 1280, "height": 900})
                try:
                    ordered_results[index] = await redeem_one(page, job)
                finally:
                    await page.close()
                await asyncio.sleep(0.5)

        await asyncio.gather(*(run_one(index, job) for index, job in enumerate(jobs)))
        results = [result for result in ordered_results if result is not None]
        await browser.close()
    return results


def print_cycle(started: str, claim: dict, report: dict | None = None, error: str = "") -> None:
    jobs = claim.get("jobs") or []
    recovered = claim.get("recovered") or {}
    status_counts: dict[str, int] = {}
    samples: list[str] = []
    report_failed_samples: list[str] = []
    for row in (report or {}).get("results", [])[:50]:
        status = str(row.get("status") or "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
        message = str(row.get("message") or "").strip()
        sample = f"{status}: {message[:160]}" if message else status
        if status == "report_failed" and len(report_failed_samples) < 5:
            report_failed_samples.append(sample)
        elif message and len(samples) < 3:
            samples.append(sample)
    payload = {
        "time": started,
        "ok": not error,
        "claimed": len(jobs),
        "processed": (report or {}).get("processed", 0),
        "saved": (report or {}).get("saved", 0),
        "saveFailed": (report or {}).get("saveFailed", 0),
        "success": (report or {}).get("success", 0),
        "failed": (report or {}).get("failed", 0),
        "retrying": (report or {}).get("retrying", 0),
        "recovered": recovered.get("recovered", 0),
        "staleFailed": recovered.get("failed", 0),
        "statuses": status_counts,
        "samples": (report_failed_samples[:3] or samples),
        "reportFailedSamples": report_failed_samples,
        "error": error,
    }
    print(json.dumps(payload, ensure_ascii=False), flush=True)


async def run_once() -> int:
    if async_playwright is None:
        raise RuntimeError(
            "Playwright is not installed. Install it before starting the daemon: "
            "pip install -r requirements.txt && python3 -m playwright install chromium"
        )

    started_text = time.strftime("%Y-%m-%d %H:%M:%S")
    started_ms = int(time.time() * 1000)
    claim = request_json("/api/redeem/claim", {"limit": BATCH_SIZE})
    jobs = claim.get("jobs") or []
    if not jobs:
        report = request_json("/api/redeem/report", {"startedAtMs": started_ms, "results": []})
        print_cycle(started_text, claim, report)
        return 0

    results = await redeem_jobs(jobs)
    report = request_json("/api/redeem/report", {"startedAtMs": started_ms, "results": results})
    print_cycle(started_text, claim, report)
    return len(jobs)


def main() -> int:
    if not ADMIN_TOKEN:
        print("ADMIN_TOKEN is required.", file=sys.stderr)
        return 2
    if async_playwright is None:
        print(
            "Playwright is not installed. Stop here before claiming jobs.\n"
            "Run: pip install -r requirements.txt && python3 -m playwright install chromium",
            file=sys.stderr,
            flush=True,
        )
        return 2

    print(
        f"Auto Redeem browser daemon started. base={BASE_URL} interval={INTERVAL}s "
        f"batch={BATCH_SIZE} concurrency={CONCURRENCY} rest={REST_SECONDS:g}s headless={HEADLESS}",
        flush=True,
    )
    while True:
        sleep_seconds = INTERVAL
        try:
            claimed = asyncio.run(run_once())
            sleep_seconds = REST_SECONDS if claimed else INTERVAL
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            if error.code == 403 and "1010" in detail:
                detail = (
                    "Cloudflare blocked this server request before it reached the Worker "
                    "(error code: 1010). Add a Cloudflare WAF/Security skip rule for "
                    "/api/redeem/* or allow this server IP."
                )
            print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} HTTP {error.code}: {detail}", flush=True)
        except KeyboardInterrupt:
            raise
        except Exception as error:
            print(f"{time.strftime('%Y-%m-%d %H:%M:%S')} ERROR: {error}", flush=True)
        time.sleep(sleep_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
